import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { restoreLoop, backupLoop, clearStaleLockRecovery, doctorLoop, finalizeFailedRecovery, initializeLoop, recoverLoop, resumePostcheckRecovery } from "../operations.mjs";
import { resolveGatewayConfig } from "../config.mjs";
import { readGitState } from "../git-state.mjs";
import { requireSuccess, runProcess } from "../process.mjs";
import { runShadow, verifyRunClosure } from "../shadow.mjs";
import { verifyBackup } from "../backup.mjs";

const WORK_ITEM = "docs/issues/task-loop-integration-fixture.md";

test("固定 Runtime 完成初始化、Shadow、阶段恢复与隔离 Restore", { timeout: 240_000 }, async (t) => {
  requireEnvironment();
  const root = await mkdtemp(path.join(os.tmpdir(), "deeptrail-loop-integration-"));
  t.after(async () => {
    const expected = path.resolve(os.tmpdir());
    if (!path.resolve(root).startsWith(expected + path.sep)) throw new Error("拒绝清理非临时目录");
    await rm(root, { recursive: true, force: true });
  });

  const repoRoot = path.join(root, "repo");
  await createFixtureRepository(repoRoot);
  const main = await createConfig(root, "main", repoRoot);
  await initializeLoop(main);
  assert.equal((await doctorLoop(main)).ok, true);
  await assert.rejects(
    runShadow(main, { workItem: "docs/issues/board.md", profile: "docs" }),
    (error) => error.code === "WORK_ITEM_SCOPE_DENIED"
  );
  const dirtyFixture = path.join(main.repoRoot, `.loop-dirty-${randomUUID()}.tmp`);
  await writeFile(dirtyFixture, "dirty fixture\n", { flag: "wx" });
  try {
    await assert.rejects(
      runShadow(main, { workItem: WORK_ITEM, profile: "docs" }),
      (error) => error.code === "WORKTREE_NOT_CLEAN"
    );
  } finally {
    await unlink(dirtyFixture);
  }
  const first = await runShadow(main, { workItem: WORK_ITEM, profile: "docs" });
  assert.equal(first.ok, true);
  assert.equal(first.reused, false);
  assert.equal(first.boundaryViolation, false);
  const second = await runShadow(main, { workItem: WORK_ITEM, profile: "docs" });
  assert.equal(second.ok, true);
  assert.equal(second.reused, true);
  assert.equal(second.boundaryViolation, false);
  assert.equal(second.runId, first.runId);
  assert.equal((await verifyRunClosure(main, first.runId)).status, "verified");

  const backup = await backupLoop(main);
  const restoreTarget = path.join(root, "isolated-restore");
  const restored = await restoreLoop(main, backup.backupId, restoreTarget);
  assert.equal(restored.ok, true);
  assert.equal(restored.doctor.ok, true);
  await writeFile(path.join(backup.path, "payload", "tampered.txt"), "tampered\n", { flag: "wx" });
  await assert.rejects(
    verifyBackup(main, backup.backupId),
    (error) => error.code === "BACKUP_PAYLOAD_TAMPERED"
  );

  const legacy = await createConfig(root, "legacy-upgrade", repoRoot);
  await initializeLoop(legacy);
  await unlink(path.join(legacy.workspace, "kinds", "execution-spec.md"));
  await unlink(path.join(legacy.workspace, "kinds", "outcome.md"));
  const upgraded = await initializeLoop(legacy);
  assert.ok(upgraded.preUpgradeBackup?.backupId, "兼容 Kind 升级前必须自动生成 Backup");

  for (const phase of ["prepared", "applying", "source_committed", "postchecking"]) {
    const config = await createConfig(root, `phase-${phase}`, repoRoot);
    await initializeLoop(config);
    const error = await captureFault(() => runShadow(config, {
      workItem: WORK_ITEM,
      profile: "docs",
      faultAfter: phase
    }));
    const transactionId = error.details.transactionId;
    if (phase === "prepared" || phase === "applying") {
      await finalizeFailedRecovery(config, transactionId);
    } else {
      await resumePostcheckRecovery(config, transactionId);
    }
    assert.equal((await recoverLoop(config)).ok, true, `阶段 ${phase} 应恢复干净`);
  }

  const partial = await createConfig(root, "partial-applying", repoRoot);
  await initializeLoop(partial);
  const partialError = await captureFault(() => runShadow(partial, {
    workItem: WORK_ITEM,
    profile: "docs",
    faultStep: "run-created"
  }));
  await finalizeFailedRecovery(partial, partialError.details.transactionId);
  assert.equal((await recoverLoop(partial)).ok, true);

  const stale = await createConfig(root, "stale-lock", repoRoot);
  await initializeLoop(stale);
  await mkdir(path.dirname(stale.lockFile), { recursive: true });
  const token = randomUUID();
  await writeFile(stale.lockFile, `${JSON.stringify({
    schemaVersion: 1,
    token,
    operation: "crashed-test",
    pid: 2147483646,
    hostname: os.hostname(),
    repoRoot: stale.repoRoot,
    startedAt: new Date().toISOString()
  }, null, 2)}\n`, { flag: "wx" });
  const cleared = await clearStaleLockRecovery(stale, token);
  assert.equal(cleared.ok, true);
  assert.equal((await recoverLoop(stale)).ok, true);
  assert.equal((await readGitState(main)).gitStatus, "");
});

async function createFixtureRepository(repoRoot) {
  requireSuccess(
    await runProcess("git", ["clone", "--quiet", "--no-hardlinks", process.cwd(), repoRoot]),
    "创建隔离 Git 集成夹具"
  );
  for (const [key, value] of [
    ["user.name", "Deeptrail Loop Integration"],
    ["user.email", "loop-integration@example.invalid"]
  ]) {
    requireSuccess(
      await runProcess("git", ["config", key, value], { cwd: repoRoot }),
      `配置集成夹具 ${key}`
    );
  }
  const workItem = path.join(repoRoot, ...WORK_ITEM.split("/"));
  // 夹具只证明“已跟踪且已提交”的输入合同；业务字段由独立治理检查负责。
  await writeFile(workItem, "# TASK-LOOP-INTEGRATION\n- 状态：In Progress", { flag: "wx" });
  requireSuccess(
    await runProcess("git", ["add", "--", WORK_ITEM], { cwd: repoRoot }),
    "暂存集成 Work Item"
  );
  requireSuccess(
    await runProcess("git", ["commit", "--quiet", "-m", "test(loop): add integration fixture"], {
      cwd: repoRoot
    }),
    "提交集成 Work Item"
  );
}

async function createConfig(root, name, repoRoot) {
  return await resolveGatewayConfig({
    repoRoot,
    env: {
      ...process.env,
      DEEPTRAIL_LOOP_HOME: path.join(root, name, "home"),
      DEEPTRAIL_LOOP_BACKUP_ROOT: path.join(root, name, "backups")
    }
  });
}

async function captureFault(callback) {
  try {
    await callback();
  } catch (error) {
    assert.equal(error.code, "INJECTED_HARD_FAULT");
    assert.ok(error.details?.transactionId);
    return error;
  }
  assert.fail("预期故障注入抛错");
}

function requireEnvironment() {
  for (const name of ["LOOPANY_SOURCE_ROOT", "LOOPANY_BUN"]) {
    if (!process.env[name]) throw new Error(`集成测试需要 ${name}`);
  }
}
