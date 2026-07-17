import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

import { LoopGatewayError } from "./errors.mjs";

export async function acquireWriteLock(config, operation, metadata = {}) {
  await mkdir(path.dirname(config.lockFile), { recursive: true });
  const token = randomUUID();
  const record = {
    schemaVersion: 1,
    token,
    operation,
    pid: process.pid,
    hostname: hostname(),
    repoRoot: config.repoRoot,
    gitBranch: metadata.gitBranch,
    gitCommit: metadata.gitCommit,
    runId: metadata.runId,
    startedAt: new Date().toISOString()
  };

  let handle;
  try {
    handle = await open(config.lockFile, "wx");
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error?.code === "EEXIST") {
      const owner = await readLock(config.lockFile);
      throw new LoopGatewayError("WRITER_LOCKED", "Loop Workspace 已有写操作持锁", owner);
    }
    throw error;
  }
  await handle.close();

  return {
    record,
    async release() {
      const current = await readLock(config.lockFile);
      if (current?.token !== token) {
        throw new LoopGatewayError("LOCK_OWNERSHIP_LOST", "写锁已被替换，拒绝删除他人的锁", current);
      }
      await unlink(config.lockFile);
    }
  };
}

export async function inspectWriteLock(config) {
  return await readLock(config.lockFile);
}

export async function quarantineStaleWriteLock(config, token) {
  if (!/^[a-f0-9-]{36}$/i.test(token ?? "")) {
    throw new LoopGatewayError("INVALID_LOCK_TOKEN", "清理残留锁需要完整 UUID Token");
  }
  const current = await readLock(config.lockFile);
  if (!current || current.unreadable) {
    throw new LoopGatewayError("STALE_LOCK_UNVERIFIABLE", "写锁不存在或不可解析，拒绝清理", current);
  }
  if (current.token !== token) {
    throw new LoopGatewayError("LOCK_TOKEN_MISMATCH", "写锁 Token 不匹配，拒绝清理", current);
  }
  if (current.hostname !== hostname()) {
    throw new LoopGatewayError("LOCK_HOST_MISMATCH", "只能自动核验并清理本机残留锁", current);
  }
  if (!Number.isInteger(current.pid) || current.pid < 1) {
    throw new LoopGatewayError("STALE_LOCK_UNVERIFIABLE", "写锁 PID 非法，拒绝清理", current);
  }
  if (isProcessAlive(current.pid)) {
    throw new LoopGatewayError("LOCK_OWNER_ALIVE", `PID ${current.pid} 仍存活，拒绝清理写锁`, current);
  }

  const quarantineRoot = path.join(path.dirname(config.lockFile), "quarantine");
  await mkdir(quarantineRoot, { recursive: true });
  const quarantine = path.join(
    quarantineRoot,
    `writer-${new Date().toISOString().replaceAll(/[-:.TZ]/g, "")}-${token}.json`
  );
  await rename(config.lockFile, quarantine);
  const quarantined = await readLock(quarantine);
  if (quarantined?.token !== token) {
    throw new LoopGatewayError("LOCK_CHANGED_DURING_CLEAR", "写锁在隔离时发生变化，停止恢复", quarantined);
  }
  return { owner: current, quarantine };
}

async function readLock(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return { unreadable: true, message: error instanceof Error ? error.message : String(error) };
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    // EPERM 表示进程存在但当前用户不可探测，必须按存活处理。
    return true;
  }
}
