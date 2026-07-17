import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyBackup } from "./backup.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { sha256 } from "./fs-safe.mjs";
import { verifyReceiptFile } from "./transactions.mjs";

const moduleRoot = path.dirname(fileURLToPath(import.meta.url));
const policyFile = path.join(moduleRoot, "receipt-compatibility.json");

export async function loadLegacyReceiptPolicy(file = policyFile) {
  const policy = JSON.parse(await readFile(file, "utf8"));
  return validateLegacyReceiptPolicy(policy);
}

export function validateLegacyReceiptPolicy(policy) {
  assertExactKeys(policy, ["schemaVersion", "policyId", "recordedBefore", "backup", "receipts"]);
  assert(policy.schemaVersion === 1, "LEGACY_RECEIPT_POLICY_INVALID", "仅支持兼容策略 Schema 1");
  assert(/^[a-z0-9][a-z0-9-]{7,79}$/.test(policy.policyId ?? ""),
    "LEGACY_RECEIPT_POLICY_INVALID", "兼容策略 ID 不合法");
  assert(Number.isFinite(Date.parse(policy.recordedBefore)),
    "LEGACY_RECEIPT_POLICY_INVALID", "兼容截止时间不合法");
  assertExactKeys(policy.backup, ["id", "manifestDigest", "payloadDigest"]);
  assert(/^backup-\d{14}-[a-f0-9]{12}$/.test(policy.backup.id ?? "")
      && isSha256(policy.backup.manifestDigest) && isSha256(policy.backup.payloadDigest),
    "LEGACY_RECEIPT_POLICY_INVALID", "Backup 身份或摘要不合法");
  assert(Array.isArray(policy.receipts) && policy.receipts.length > 0 && policy.receipts.length <= 16,
    "LEGACY_RECEIPT_POLICY_INVALID", "兼容 Receipt 数量不合法");
  const files = [];
  for (const item of policy.receipts) {
    assertExactKeys(item, ["file", "sha256"]);
    assert(/^\d{14}-[a-f0-9-]{36}(?:-recovery)?\.json$/.test(item.file ?? "")
        && isSha256(item.sha256),
      "LEGACY_RECEIPT_POLICY_INVALID", "兼容 Receipt 文件名或摘要不合法");
    files.push(item.file);
  }
  assert(new Set(files).size === files.length
      && JSON.stringify(files) === JSON.stringify([...files].sort()),
    "LEGACY_RECEIPT_POLICY_INVALID", "兼容 Receipt 必须唯一并按文件名字典序排列");
  return policy;
}

export async function verifyReceiptSet(config, options = {}) {
  const policy = validateLegacyReceiptPolicy(options.policy ?? await loadLegacyReceiptPolicy());
  const entries = await readdir(config.receiptRoot, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const invalid = entries.find((entry) => !entry.isFile() || entry.isSymbolicLink()
    || !entry.name.endsWith(".json"));
  assert(!invalid, "RECEIPT_ROOT_TAMPERED", `Receipt Root 含非法条目：${invalid?.name}`);

  const baselines = new Map(policy.receipts.map((item) => [item.file, item]));
  const documents = [];
  let v2Verified = 0;
  let legacyAttested = 0;
  let verifiedBackup;

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const file = path.join(config.receiptRoot, entry.name);
    const raw = await readFile(file);
    let document;
    try {
      document = JSON.parse(raw.toString("utf8"));
    } catch (error) {
      throw new LoopGatewayError("RECEIPT_INVALID", `Receipt JSON 不可解析：${file}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    if (document.schemaVersion === 2) {
      documents.push(await verifyReceiptFile(file));
      v2Verified += 1;
      continue;
    }
    assert(document.schemaVersion === 1, "RECEIPT_SCHEMA_UNSUPPORTED",
      `Receipt Schema 不受支持：${entry.name}`);
    const baseline = baselines.get(entry.name);
    assert(baseline, "LEGACY_RECEIPT_UNATTESTED", `未登记的 v1 Receipt：${entry.name}`);
    verifiedBackup ??= await verifyCompatibilityBackup(config, policy);
    verifyLegacyReceipt(entry.name, raw, document, baseline, policy, verifiedBackup);
    documents.push(document);
    legacyAttested += 1;
  }

  return {
    ok: true,
    total: documents.length,
    v2Verified,
    legacyAttested,
    unattestedLegacy: 0,
    policyId: legacyAttested > 0 ? policy.policyId : null,
    backupId: legacyAttested > 0 ? policy.backup.id : null,
    documents
  };
}

export function summarizeReceiptIntegrity(report) {
  return {
    ok: report.ok,
    total: report.total,
    v2Verified: report.v2Verified,
    legacyAttested: report.legacyAttested,
    unattestedLegacy: report.unattestedLegacy,
    policyId: report.policyId,
    backupId: report.backupId
  };
}

function verifyLegacyReceipt(fileName, raw, document, baseline, policy, backup) {
  assert(sha256(raw) === baseline.sha256, "LEGACY_RECEIPT_TAMPERED",
    `v1 Receipt 与证明摘要不一致：${fileName}`);
  assert(document.receiptId === fileName.slice(0, -".json".length)
      && Number.isFinite(Date.parse(document.recordedAt))
      && Date.parse(document.recordedAt) < Date.parse(policy.recordedBefore),
    "LEGACY_RECEIPT_IDENTITY_INVALID", `v1 Receipt 身份或时间边界不合法：${fileName}`);
  const backupPath = `receipts/${fileName}`;
  const backupEntry = backup.manifest.files.find((item) => item.path === backupPath);
  assert(backupEntry?.sha256 === baseline.sha256 && backupEntry.size === raw.length,
    "LEGACY_RECEIPT_BACKUP_MISMATCH", `v1 Receipt 未被固定 Backup 精确绑定：${fileName}`);
}

async function verifyCompatibilityBackup(config, policy) {
  const backup = await verifyBackup(config, policy.backup.id);
  assert(backup.manifestDigest === policy.backup.manifestDigest
      && backup.payloadDigest === policy.backup.payloadDigest,
    "LEGACY_RECEIPT_BACKUP_MISMATCH", "v1 Receipt 证明 Backup 的 Manifest 或 Payload 摘要漂移");
  return backup;
}

function assertExactKeys(value, expected) {
  assert(value && typeof value === "object" && !Array.isArray(value),
    "LEGACY_RECEIPT_POLICY_INVALID", "兼容策略字段必须是 Object");
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(JSON.stringify(actual) === JSON.stringify(wanted),
    "LEGACY_RECEIPT_POLICY_INVALID", `兼容策略字段必须精确为：${wanted.join(", ")}`);
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(value ?? "");
}

function assert(condition, code, message) {
  if (!condition) throw new LoopGatewayError(code, message);
}
