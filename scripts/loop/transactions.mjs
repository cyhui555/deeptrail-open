import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { writeJsonAtomicExclusive } from "./fs-safe.mjs";

export const TERMINAL_TRANSACTION_STATES = new Set([
  "closed", "committed", "failed", "degraded", "aborted"
]);

const TRANSITIONS = {
  prepared: new Set(["applying", "failed", "aborted", "recovery_required"]),
  applying: new Set(["source_committed", "failed", "degraded", "recovery_required"]),
  source_committed: new Set(["postchecking", "degraded", "recovery_required"]),
  postchecking: new Set(["closed", "degraded", "recovery_required"]),
  recovery_required: new Set(["postchecking", "closed", "failed", "degraded", "aborted"]),
  // v1 历史事务保留兼容，只允许显式收口，不允许重新进入写阶段。
  active: new Set(["committed", "failed", "recovery_required"])
};

export async function beginTransaction(config, operation, input = {}) {
  const id = `${compactTimestamp()}-${randomUUID()}`;
  const directory = path.join(config.transactionRoot, id);
  await mkdir(config.transactionRoot, { recursive: true });
  await mkdir(directory, { recursive: false });
  let sequence = 0;
  let currentStatus;
  let previousSha256 = null;

  async function checkpoint(status, details = {}) {
    assertTransition(currentStatus, status);
    sequence += 1;
    const base = {
      schemaVersion: 2,
      transactionId: id,
      operation,
      status,
      sequence,
      recordedAt: new Date().toISOString(),
      input,
      details,
      previousSha256
    };
    const snapshot = { ...base, snapshotSha256: canonicalSha256(base) };
    const name = `${String(sequence).padStart(3, "0")}-${status}.json`;
    await writeJsonAtomicExclusive(path.join(directory, name), snapshot);
    currentStatus = status;
    previousSha256 = snapshot.snapshotSha256;
    return snapshot;
  }

  await checkpoint("prepared");
  return {
    id,
    directory,
    checkpoint,
    get status() { return currentStatus; }
  };
}

export async function writeReceipt(config, id, receipt) {
  const file = path.join(config.receiptRoot, `${id}.json`);
  const envelope = {
    schemaVersion: 2,
    receiptId: id,
    recordedAt: new Date().toISOString(),
    ...receipt
  };
  const integritySha256 = canonicalSha256(envelope);
  await writeJsonAtomicExclusive(file, { ...envelope, integritySha256 });
  return { file, integritySha256 };
}

export async function checkpointExistingTransaction(config, id, status, details = {}) {
  const transaction = await readTransaction(config, id);
  const { directory, snapshots, latest } = transaction;
  assertTransition(latest.status, status);
  const sequence = Number(latest.sequence) + 1;
  const base = {
    ...latest,
    schemaVersion: 2,
    status,
    sequence,
    recordedAt: new Date().toISOString(),
    details,
    previousSha256: latest.snapshotSha256 ?? canonicalSha256(latest)
  };
  delete base.snapshotSha256;
  const snapshot = { ...base, snapshotSha256: canonicalSha256(base) };
  const name = `${String(sequence).padStart(3, "0")}-${status}.json`;
  await writeJsonAtomicExclusive(path.join(directory, name), snapshot);
  return snapshot;
}

export async function inspectTransactions(config) {
  const directories = await readdir(config.transactionRoot, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const transactions = [];
  for (const entry of directories) {
    if (!entry.isDirectory()) continue;
    const transaction = await readTransaction(config, entry.name);
    if (transaction.snapshots.length === 0) continue;
    transactions.push({
      id: entry.name,
      latest: transaction.latest,
      history: transaction.history,
      recoveryPhase: recoveryPhase(transaction.latest)
    });
  }
  return transactions.sort((a, b) => a.id.localeCompare(b.id));
}

export async function verifyReceiptFile(file) {
  const parsed = JSON.parse(await readFile(file, "utf8"));
  const { integritySha256, ...envelope } = parsed;
  if (!integritySha256 || canonicalSha256(envelope) !== integritySha256) {
    throw new LoopGatewayError("RECEIPT_TAMPERED", `Receipt 完整性校验失败：${file}`);
  }
  return parsed;
}

export function recoveryPhase(latest) {
  return latest.status === "recovery_required"
    ? latest.details?.failedAfter ?? "unknown"
    : latest.status;
}

async function readTransaction(config, id) {
  if (!/^[0-9]{14}-[a-f0-9-]{36}$/.test(id)) {
    throw new LoopGatewayError("INVALID_TRANSACTION_ID", `非法事务 ID：${id}`);
  }
  const directory = path.join(config.transactionRoot, id);
  const entries = await readdir(directory, { withFileTypes: true });
  const invalid = entries.find((entry) => !entry.isFile() || entry.isSymbolicLink()
    || !/^\d{3}-[a-z_]+\.json$/.test(entry.name));
  if (invalid) {
    throw new LoopGatewayError("TRANSACTION_TAMPERED", `事务含非法条目：${invalid.name}`);
  }
  const snapshots = entries.map((entry) => entry.name).sort();
  if (snapshots.length === 0) {
    throw new LoopGatewayError("TRANSACTION_EMPTY", `事务 ${id} 没有快照`);
  }
  const history = [];
  for (const name of snapshots) {
    const snapshot = JSON.parse(await readFile(path.join(directory, name), "utf8"));
    const expectedSequence = history.length + 1;
    const prior = history.at(-1);
    if (snapshot.transactionId !== id || snapshot.sequence !== expectedSequence
      || !name.startsWith(`${String(expectedSequence).padStart(3, "0")}-${snapshot.status}.json`)
      || (prior && (snapshot.operation !== prior.operation
        || canonicalSha256(snapshot.input) !== canonicalSha256(prior.input)))) {
      throw new LoopGatewayError("TRANSACTION_TAMPERED", `事务快照顺序或固定字段不一致：${name}`);
    }
    if (snapshot.schemaVersion === 2) {
      const { snapshotSha256, ...base } = snapshot;
      const priorDigest = prior?.snapshotSha256 ?? (prior ? canonicalSha256(prior) : null);
      if (canonicalSha256(base) !== snapshotSha256 || base.previousSha256 !== priorDigest) {
        throw new LoopGatewayError("TRANSACTION_TAMPERED", `事务 Hash 链不一致：${name}`);
      }
    } else if (snapshot.schemaVersion !== 1) {
      throw new LoopGatewayError("TRANSACTION_SCHEMA_UNSUPPORTED", `事务 Schema 不受支持：${name}`);
    }
    history.push(snapshot);
  }
  return { directory, snapshots, history, latest: history.at(-1) };
}

function assertTransition(from, to) {
  if (from === undefined && to === "prepared") return;
  if (TERMINAL_TRANSACTION_STATES.has(from)) {
    throw new LoopGatewayError("TRANSACTION_TERMINAL", `事务已处于终态 ${from}`);
  }
  if (!TRANSITIONS[from]?.has(to)) {
    throw new LoopGatewayError("TRANSACTION_TRANSITION_DENIED", `非法事务迁移：${from} -> ${to}`);
  }
}

function compactTimestamp() {
  return new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
}
