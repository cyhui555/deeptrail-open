import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalSha256 } from "./canonical.mjs";
import { requireBackupRoot } from "./config.mjs";
import { LoopGatewayError } from "./errors.mjs";
import {
  assertDisjoint,
  assertOutside,
  canonicalizePlannedPath,
  isWithin,
  readJson,
  writeJsonAtomicExclusive
} from "./fs-safe.mjs";
import { verifyIdentity } from "./identity.mjs";
import { verifyProjectKinds } from "./kinds.mjs";
import { runLoopAny } from "./runtime.mjs";
import { verifySkills } from "./skills.mjs";
import { collectTree, manifestDigest } from "./tree.mjs";

const SNAPSHOT_SCHEMA = 1;

export async function createBackup(config, options = {}) {
  const backupRoot = requireBackupRoot(config);
  await ensureCanonicalDirectory(backupRoot, "Backup Root");
  const staging = path.join(backupRoot, `.staging-${process.pid}-${randomUUID()}`);
  await mkdir(staging, { recursive: false });
  const payloadRoot = path.join(staging, "payload");
  await mkdir(payloadRoot, { recursive: false });

  const files = await collectBackupFiles(config, options.excludeTransactionId);
  for (const item of files) {
    const target = path.join(payloadRoot, ...item.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(item.source), { flag: "wx" });
  }
  const portableFiles = files.map(({ path: file, size, sha256 }) => ({ path: file, size, sha256 }));
  const payloadDigest = manifestDigest(portableFiles);
  const backupId = `backup-${compactTimestamp()}-${payloadDigest.slice(0, 12)}`;
  const manifest = {
    schemaVersion: SNAPSHOT_SCHEMA,
    backupId,
    projectId: config.projectId,
    createdAt: new Date().toISOString(),
    sourceRevision: options.expectedRevision,
    loopany: {
      commit: config.loopany.commit,
      cliVersion: config.loopany.cliVersion,
      bunVersion: config.loopany.bunVersion
    },
    payloadDigest,
    files: portableFiles
  };
  await writeJsonAtomicExclusive(path.join(staging, "snapshot.json"), {
    ...manifest,
    manifestDigest: canonicalSha256(manifest)
  });
  const target = path.join(backupRoot, backupId);
  await rename(staging, target);
  await verifyBackup(config, backupId);
  return { backupId, path: target, payloadDigest, files: portableFiles.length };
}

export async function verifyBackup(config, backupId) {
  if (!/^backup-\d{14}-[a-f0-9]{12}$/.test(backupId)) {
    throw new LoopGatewayError("INVALID_BACKUP_ID", `非法 Backup ID：${backupId}`);
  }
  const snapshot = path.join(requireBackupRoot(config), backupId);
  const entries = await readdir(snapshot, { withFileTypes: true }).catch((error) => {
    throw new LoopGatewayError("BACKUP_MISSING", `Backup 不可读：${error.message}`);
  });
  const names = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(["payload", "snapshot.json"])) {
    throw new LoopGatewayError("BACKUP_TAMPERED", "Backup 根目录含额外或缺失条目", names);
  }
  const document = await readJson(path.join(snapshot, "snapshot.json"));
  const { manifestDigest: storedManifestDigest, ...manifest } = document;
  if (manifest.schemaVersion !== SNAPSHOT_SCHEMA || manifest.backupId !== backupId
    || manifest.projectId !== config.projectId
    || manifest.loopany?.commit !== config.loopany.commit
    || canonicalSha256(manifest) !== storedManifestDigest) {
    throw new LoopGatewayError("BACKUP_MANIFEST_TAMPERED", "Backup Manifest 完整性校验失败");
  }
  const actual = await collectTree(path.join(snapshot, "payload"));
  if (manifestDigest(actual) !== manifest.payloadDigest
    || canonicalSha256(actual) !== canonicalSha256(manifest.files)) {
    throw new LoopGatewayError("BACKUP_PAYLOAD_TAMPERED", "Backup Payload 文件集合或 Hash 不一致");
  }
  return {
    ok: true,
    backupId,
    path: snapshot,
    payloadDigest: manifest.payloadDigest,
    files: actual.length,
    manifest
  };
}

export async function restoreBackup(config, backupId, requestedTarget) {
  if (!requestedTarget || !path.isAbsolute(requestedTarget)) {
    throw new LoopGatewayError("INVALID_RESTORE_TARGET", "Restore 目标必须是绝对路径");
  }
  const backup = await verifyBackup(config, backupId);
  const target = await canonicalizePlannedPath(requestedTarget, "Restore 目标");
  assertOutside(config.repoRoot, target, "Restore 目标");
  assertDisjoint(config.loopHome, target, ["活动 Loop Home", "Restore 目标"]);
  assertDisjoint(requireBackupRoot(config), target, ["Backup Root", "Restore 目标"]);
  if (await lstat(target).catch(() => null)) {
    throw new LoopGatewayError("RESTORE_TARGET_EXISTS", `Restore 目标必须不存在：${target}`);
  }

  const staging = `${target}.staging-${process.pid}-${randomUUID()}`;
  await mkdir(staging, { recursive: false });
  for (const item of backup.manifest.files) {
    const source = path.join(backup.path, "payload", ...item.path.split("/"));
    const destination = path.join(staging, ...item.path.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(source), { flag: "wx" });
  }
  await rename(staging, target);
  const verification = await verifyRestoredLoop(config, target, backup.manifest);
  return { backupId, target, ...verification };
}

export async function verifyRestoredLoop(config, target, expectedManifest = undefined, options = {}) {
  const restored = configForLoopHome(config, target);
  const actualFiles = await collectTree(target);
  if (expectedManifest && options.skipPayloadComparison !== true
    && (manifestDigest(actualFiles) !== expectedManifest.payloadDigest
    || canonicalSha256(actualFiles) !== canonicalSha256(expectedManifest.files))) {
    throw new LoopGatewayError("RESTORE_HASH_MISMATCH", "Restore 后文件集合或 Hash 与 Backup 不一致");
  }
  const manifestPaths = new Set(expectedManifest?.files?.map((item) => item.path) ?? []);
  const allowMissing = ["execution-spec.md", "outcome.md"].filter((name) =>
    expectedManifest && !manifestPaths.has(`workspace/kinds/${name}`)
  );
  const skills = await verifySkills(restored);
  const kinds = await verifyProjectKinds(restored, { allowMissing });
  const identity = await verifyIdentity(restored);
  const doctor = await runLoopAny(restored, ["doctor", "--format", "json"], {
    json: true,
    allowFailure: true
  });
  if (doctor.code !== 0 || doctor.json?.ok !== true) {
    throw new LoopGatewayError("RESTORE_DOCTOR_FAILED", "隔离 Restore 的 LoopAny Doctor 未通过", doctor.json);
  }
  return {
    ok: true,
    files: actualFiles.length,
    payloadDigest: manifestDigest(actualFiles),
    skills,
    kinds,
    identity,
    doctor: doctor.json,
    compatibility: allowMissing.length > 0 ? "legacy-15-kind" : "current-17-kind",
    allowedMissingKinds: allowMissing
  };
}

function configForLoopHome(config, loopHome) {
  return {
    ...config,
    loopHome,
    workspace: path.join(loopHome, "workspace"),
    skillSnapshot: path.join(loopHome, "runtime", "skills", config.loopany.commit),
    lockFile: path.join(loopHome, "locks", "writer.lock"),
    transactionRoot: path.join(loopHome, "transactions"),
    receiptRoot: path.join(loopHome, "receipts")
  };
}

async function collectBackupFiles(config, excludeTransactionId) {
  const roots = [
    { absolute: config.workspace, relative: "workspace" },
    { absolute: config.skillSnapshot, relative: `runtime/skills/${config.loopany.commit}` },
    { absolute: config.transactionRoot, relative: "transactions", exclude: excludeTransactionId ? new Set([excludeTransactionId]) : new Set() },
    { absolute: config.receiptRoot, relative: "receipts" }
  ];
  const files = [];
  for (const root of roots) {
    for (const item of await collectTree(root.absolute, { exclude: root.exclude })) {
      files.push({
        ...item,
        path: `${root.relative}/${item.path}`,
        source: path.join(root.absolute, ...item.path.split("/"))
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function ensureCanonicalDirectory(directory, label) {
  await mkdir(directory, { recursive: true });
  const real = await realpath(directory);
  if (!isWithin(directory, real) || !isWithin(real, directory)) {
    throw new LoopGatewayError("RUNTIME_PATH_CHANGED", `${label} 在配置后被重定向：${directory}`);
  }
}

function compactTimestamp() {
  return new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
}
