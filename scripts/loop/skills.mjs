import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { isWithin, sha256File, toPortablePath } from "./fs-safe.mjs";
import { requireSuccess, runProcess } from "./process.mjs";

const LOCK_FILE = "manifest.lock.json";

export async function syncSkills(config, options = {}) {
  const existing = await stat(config.skillSnapshot).catch(() => null);
  if (existing) return { ...(await verifySkills(config, options)), reused: true };

  const parent = path.dirname(config.skillSnapshot);
  const temporary = `${config.skillSnapshot}.tmp-${process.pid}-${randomUUID()}`;
  await mkdir(parent, { recursive: true });
  await mkdir(temporary, { recursive: false });

  try {
    const sourceFiles = await collectAllowedSourceFiles(config, options);
    for (const item of sourceFiles) {
      const target = path.join(temporary, ...item.relative.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, await readFile(item.absolute), { flag: "wx" });
    }
    const lock = await buildLock(config, temporary);
    await writeFile(path.join(temporary, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    await rename(temporary, config.skillSnapshot);
    return {
      ok: true,
      snapshot: config.skillSnapshot,
      files: lock.files.length,
      manifestDigest: canonicalSha256(lock),
      reused: false
    };
  } catch (error) {
    // 失败快照保留用于诊断；Recovery 只报告，不自动递归清理证据。
    throw error;
  }
}

export async function verifySkills(config, options = {}) {
  const lockPath = path.join(config.skillSnapshot, LOCK_FILE);
  const lock = JSON.parse(await readFile(lockPath, "utf8").catch((error) => {
    throw new LoopGatewayError("SKILL_SNAPSHOT_MISSING", `Skill 锁文件不可读：${error.message}`);
  }));
  if (lock.schemaVersion !== 1 || !Array.isArray(lock.files)) {
    throw new LoopGatewayError("SKILL_LOCK_INVALID", "Skill 锁文件 Schema 不受支持");
  }
  if (lock.sourceCommit !== config.loopany.commit) {
    throw new LoopGatewayError("SKILL_COMMIT_MISMATCH", "Skill 快照 Commit 与配置不一致");
  }
  if (JSON.stringify(lock.skills) !== JSON.stringify(config.loopany.skills)) {
    throw new LoopGatewayError("SKILL_ALLOWLIST_MISMATCH", "Skill 快照允许列表与配置不一致");
  }

  const actual = await collectSnapshotFiles(config.skillSnapshot, config.loopany.skills);
  const source = await collectAllowedSourceFiles(config, options);
  const expected = new Map();
  for (const item of lock.files) {
    if (!item || typeof item.path !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw new LoopGatewayError("SKILL_LOCK_INVALID", "Skill 锁文件含非法文件条目");
    }
    if (expected.has(item.path)) {
      throw new LoopGatewayError("SKILL_LOCK_INVALID", `Skill 锁文件含重复路径：${item.path}`);
    }
    expected.set(item.path, item.sha256);
  }
  const sourceHashes = new Map(source.map((item) => [item.relative, item.sha256]));
  const problems = [];
  for (const item of actual) {
    const expectedHash = expected.get(item.relative);
    if (!expectedHash) problems.push(`unexpected:${item.relative}`);
    else if (expectedHash !== item.sha256) problems.push(`hash:${item.relative}`);
    if (sourceHashes.get(item.relative) !== item.sha256) problems.push(`source:${item.relative}`);
    expected.delete(item.relative);
    sourceHashes.delete(item.relative);
  }
  for (const missing of expected.keys()) problems.push(`missing:${missing}`);
  for (const missing of sourceHashes.keys()) problems.push(`source-missing:${missing}`);
  if (problems.length > 0) {
    throw new LoopGatewayError("SKILL_SNAPSHOT_TAMPERED", "Skill 快照完整性校验失败", problems);
  }
  return {
    ok: true,
    snapshot: config.skillSnapshot,
    files: actual.length,
    manifestDigest: canonicalSha256(lock)
  };
}

async function collectAllowedSourceFiles(config, options = {}) {
  const files = [];
  const skillsRoot = path.join(config.sourceRoot, "skills");
  const realSkillsRoot = await realpath(skillsRoot);
  for (const skill of config.loopany.skills) {
    const source = path.join(skillsRoot, skill);
    const realSource = await realpath(source).catch(() => null);
    if (!realSource || !isWithin(realSkillsRoot, realSource)) {
      throw new LoopGatewayError("SKILL_SOURCE_INVALID", `Skill 来源路径非法：${skill}`);
    }
    files.push(...await walkRegularFiles(source, skill, realSkillsRoot, true));
  }
  files.sort((a, b) => a.relative.localeCompare(b.relative));
  if (options.requireTracked !== false) await assertFilesTrackedAtCommit(config, files);
  return files;
}

async function assertFilesTrackedAtCommit(config, files) {
  const pathspecs = config.loopany.skills.map((skill) => `skills/${skill}`);
  const result = requireSuccess(await runProcess("git", [
    "-C", config.sourceRoot, "ls-tree", "-r", "--name-only",
    config.loopany.commit, "--", ...pathspecs
  ]), "读取固定 Commit 的 Skill 文件集合");
  const tracked = result.stdout.split(/\r?\n/)
    .filter(Boolean)
    .map((item) => item.replace(/^skills\//, ""))
    .sort();
  const discovered = files.map((item) => item.relative).sort();
  if (JSON.stringify(tracked) !== JSON.stringify(discovered)) {
    const trackedSet = new Set(tracked);
    const discoveredSet = new Set(discovered);
    throw new LoopGatewayError("SKILL_SOURCE_SET_MISMATCH", "Skill 来源不等于固定 Commit 文件集合", {
      extra: discovered.filter((item) => !trackedSet.has(item)),
      missing: tracked.filter((item) => !discoveredSet.has(item))
    });
  }
}

async function collectSnapshotFiles(snapshot, skills) {
  const rootEntries = await readdir(snapshot, { withFileTypes: true });
  const allowedRoots = new Set([...skills, LOCK_FILE]);
  const unexpectedRoot = rootEntries.find((entry) => !allowedRoots.has(entry.name));
  if (unexpectedRoot) {
    throw new LoopGatewayError("SKILL_SNAPSHOT_TAMPERED", `Skill 快照含额外根条目：${unexpectedRoot.name}`);
  }
  const files = [];
  const realSnapshot = await realpath(snapshot);
  for (const skill of skills) {
    files.push(...await walkRegularFiles(path.join(snapshot, skill), skill, realSnapshot, true));
  }
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

async function walkRegularFiles(directory, relativeRoot, containmentRoot, includeHash = false) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    throw new LoopGatewayError("SKILL_DIRECTORY_INVALID", `${directory} 不可读：${error.message}`);
  });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new LoopGatewayError("SKILL_LINK_DENIED", `Skill 中禁止链接：${absolute}`);
    }
    const resolved = await realpath(absolute);
    if (!isWithin(containmentRoot, resolved)) {
      throw new LoopGatewayError("SKILL_PATH_ESCAPE", `Skill 路径逃逸：${absolute}`);
    }
    const relative = toPortablePath(path.join(relativeRoot, entry.name));
    if (entry.isDirectory()) {
      files.push(...await walkRegularFiles(absolute, relative, containmentRoot, includeHash));
    } else if (entry.isFile()) {
      files.push({
        absolute,
        relative,
        ...(includeHash ? { sha256: await sha256File(absolute) } : {})
      });
    } else {
      throw new LoopGatewayError("SKILL_FILE_TYPE_DENIED", `Skill 含非普通文件：${absolute}`);
    }
  }
  return files;
}

async function buildLock(config, snapshot) {
  const files = await collectSnapshotFiles(snapshot, config.loopany.skills);
  return {
    schemaVersion: 1,
    sourceCommit: config.loopany.commit,
    skills: config.loopany.skills,
    files: files.map(({ relative, sha256 }) => ({ path: relative, sha256 }))
  };
}
