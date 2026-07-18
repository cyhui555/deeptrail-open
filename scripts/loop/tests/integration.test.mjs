import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalSha256 } from "../canonical.mjs";
import {
  backupLoop,
  clearStaleLockRecovery,
  doctorLoop,
  finalizeFailedRecovery,
  initializeLoop,
  recoverLoop,
  restoreLoop,
  resumePostcheckRecovery,
  runL3BMergeLoop
} from "../operations.mjs";
import { resolveGatewayConfig } from "../config.mjs";
import { readGitState } from "../git-state.mjs";
import {
  loadL3BPolicy,
  normalizeL3BProtectionSnapshot,
  validateL3BMergePlan,
  validateL3BPolicy
} from "../l3-merge-plan.mjs";
import { validateL3BPreMergeFacts } from "../l3-merge.mjs";
import { readL3RepositoryControls } from "../l3-worktree.mjs";
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

test("L3B 在真实临时远端完成受保护等价 squash merge 与响应丢失恢复", {
  timeout: 240_000
}, async (t) => {
  requireEnvironment();
  const root = await mkdtemp(path.join(os.tmpdir(), "deeptrail-l3b-integration-"));
  t.after(async () => {
    const expected = path.resolve(os.tmpdir());
    if (!path.resolve(root).startsWith(expected + path.sep)) throw new Error("拒绝清理非临时目录");
    await rm(root, { recursive: true, force: true });
  });

  const repoRoot = path.join(root, "repo");
  const bareRoot = path.join(root, "remote.git");
  await createFixtureRepository(repoRoot);
  await gitRequired(repoRoot, ["branch", "-M", "main"]);
  await gitRequired(root, ["init", "--bare", bareRoot]);
  await gitRequired(repoRoot, ["remote", "set-url", "origin", bareRoot]);
  await gitRequired(repoRoot, ["push", "--set-upstream", "origin", "main"]);
  const config = await createConfig(root, "l3b", repoRoot);
  await initializeLoop(config);

  const firstPr = await createTemporaryPullRequest(repoRoot, {
    number: 901,
    branch: "automation/l3/task-loop-006-integration",
    file: "docs/product/l3b-integration-pilot.md",
    content: "# L3B integration pilot\n"
  });
  const first = await createL3BContext(config, bareRoot, firstPr);
  let firstState = { merged: false, mergeCommit: null };
  const firstResult = await runL3BMergeLoop(config, "integration-first.json", {
    preflight: async () => first.context,
    readRemoteSnapshot: async () => await readTemporaryPreMergeSnapshot(
      bareRoot, first, firstState
    ),
    mergePullRequest: async () => {
      const merged = await squashTemporaryPullRequest(root, bareRoot, first);
      firstState = { merged: true, mergeCommit: merged.sha };
      return { merged: true, sha: merged.sha, message: "merged" };
    },
    readMergeResult: async () => await readTemporaryMergeResult(
      bareRoot, first, firstState
    )
  });
  assert.equal(firstResult.ok, true);
  assert.equal(firstResult.verification.tree, firstPr.tree);
  assert.equal(firstResult.verification.parentRevision, firstPr.base);
  assert.equal((await readGitState(config)).gitCommit, firstPr.base);
  assert.equal((await readGitState(config)).gitStatus, "");
  assert.equal((await recoverLoop(config)).ok, true);

  // 进入第二个试点前只把临时源仓快进到刚验证的 main，不改写历史。
  await gitRequired(repoRoot, ["fetch", "origin", "main"]);
  await gitRequired(repoRoot, ["merge", "--ff-only", "origin/main"]);
  const secondPr = await createTemporaryPullRequest(repoRoot, {
    number: 902,
    branch: "automation/l3/task-loop-006-response-loss",
    file: "docs/product/l3b-response-loss-pilot.md",
    content: "# L3B response-loss pilot\n"
  });
  const second = await createL3BContext(config, bareRoot, secondPr);
  let secondState = { merged: false, mergeCommit: null };
  let mergeCalls = 0;
  let unknown;
  try {
    await runL3BMergeLoop(config, "integration-response-loss.json", {
      preflight: async () => second.context,
      readRemoteSnapshot: async () => await readTemporaryPreMergeSnapshot(
        bareRoot, second, secondState
      ),
      mergePullRequest: async () => {
        mergeCalls += 1;
        const merged = await squashTemporaryPullRequest(root, bareRoot, second);
        secondState = { merged: true, mergeCommit: merged.sha };
        throw new Error("模拟 merge 已完成但响应丢失");
      },
      readMergeResult: async () => await readTemporaryMergeResult(
        bareRoot, second, secondState
      )
    });
  } catch (error) {
    unknown = error;
  }
  assert.equal(unknown?.code, "L3B_MERGE_RESULT_UNKNOWN");
  assert.ok(unknown?.details?.transactionId);
  assert.equal(mergeCalls, 1);
  const pending = await recoverLoop(config);
  assert.equal(pending.ok, false);
  assert.equal(pending.incomplete[0].action, "resume-postcheck");
  await assert.rejects(
    finalizeFailedRecovery(config, unknown.details.transactionId),
    (error) => error.code === "RECOVERY_READBACK_REQUIRED"
  );
  const recovered = await resumePostcheckRecovery(
    config,
    unknown.details.transactionId,
    {
      readMergeResult: async () => await readTemporaryMergeResult(
        bareRoot, second, secondState
      )
    }
  );
  assert.equal(recovered.ok, true);
  assert.equal(mergeCalls, 1, "只读恢复不得重新调用 merge");
  assert.equal((await recoverLoop(config)).ok, true);
  assert.equal((await readGitState(config)).gitCommit, secondPr.base);
  assert.equal((await readGitState(config)).gitStatus, "");
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

async function createTemporaryPullRequest(repoRoot, definition) {
  const base = (await gitRequired(repoRoot, ["rev-parse", "HEAD"])).trim();
  await gitRequired(repoRoot, ["switch", "--create", definition.branch]);
  const file = path.join(repoRoot, ...definition.file.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, definition.content, { flag: "wx" });
  await gitRequired(repoRoot, ["add", "--", definition.file]);
  await gitRequired(repoRoot, [
    "commit", "--quiet", "-m", `docs(TASK-LOOP-006): add pilot ${definition.number}`
  ]);
  const head = (await gitRequired(repoRoot, ["rev-parse", "HEAD"])).trim();
  const tree = (await gitRequired(repoRoot, ["rev-parse", "HEAD^{tree}"])).trim();
  await gitRequired(repoRoot, ["push", "origin", `HEAD:refs/heads/${definition.branch}`]);
  await gitRequired(repoRoot, ["switch", "main"]);
  return { ...definition, base, head, tree };
}

async function createL3BContext(config, bareRoot, pullRequest) {
  const disabled = await loadL3BPolicy();
  const rawProtection = temporaryProtection(disabled.requiredChecks);
  const initialProtection = normalizeL3BProtectionSnapshot(rawProtection, disabled);
  const policy = validateL3BPolicy({
    ...disabled,
    stage: "l3b-controlled-merge",
    activation: {
      enabled: true,
      engineApprovedRevision: "d".repeat(40),
      engineMergedRevision: "e".repeat(40),
      l2CohortDigest: "9".repeat(64),
      humanApprover: "cyhui555",
      approvalUrl:
        "https://github.com/cyhui555/deeptrail-open/pull/88#pullrequestreview-8800",
      protectionDigest: initialProtection.digest
    },
    permissions: {
      markReady: false,
      submitReview: false,
      controlledSquashMerge: true,
      autoApprove: false,
      adminMerge: false,
      forcePush: false,
      deleteRemoteBranch: false,
      autoDeploy: false
    }
  });
  const protection = normalizeL3BProtectionSnapshot(rawProtection, policy);
  const checks = policy.requiredChecks.map((item, index) => ({
    ...item,
    checkRunId: pullRequest.number * 100 + index + 1,
    headRevision: pullRequest.head,
    completedAt: `2026-07-18T06:${String(index + 1).padStart(2, "0")}:00.000Z`,
    detailsUrl:
      `https://github.com/cyhui555/deeptrail-open/actions/runs/${pullRequest.number}/job/${pullRequest.number * 100 + index + 1}`,
    conclusion: "success"
  }));
  const plan = validateL3BMergePlan({
    schemaVersion: 1,
    mergeId: `task-loop-006-integration-${pullRequest.number}`,
    workItemId: "TASK-LOOP-006",
    repository: policy.repository,
    baseBranch: policy.baseBranch,
    baseRevision: pullRequest.base,
    workItem: "docs/issues/task-loop-006-l3b-controlled-merge.md",
    l3a: {
      transactionId: `20260718${String(pullRequest.number).padStart(6, "0")}-11111111-1111-4111-8111-111111111111`,
      receiptSha256: "3".repeat(64),
      changePlanFile: `task-loop-006-${pullRequest.number}.json`,
      planDigest: "1".repeat(64),
      patchDigest: "2".repeat(64),
      commit: pullRequest.head
    },
    pullRequest: {
      number: pullRequest.number,
      url: `https://github.com/cyhui555/deeptrail-open/pull/${pullRequest.number}`,
      author: "github-actions[bot]",
      headBranch: pullRequest.branch,
      headRevision: pullRequest.head,
      commitCount: 1,
      changedPaths: [pullRequest.file]
    },
    checks,
    humanApproval: {
      reviewer: "cyhui555",
      reviewId: pullRequest.number * 1000 + 1,
      reviewUrl:
        `https://github.com/cyhui555/deeptrail-open/pull/${pullRequest.number}#pullrequestreview-${pullRequest.number * 1000 + 1}`,
      reviewedRevision: pullRequest.head,
      submittedAt: "2026-07-18T06:10:00.000Z"
    },
    cohortDigest: policy.activation.l2CohortDigest,
    protectionDigest: protection.digest,
    merge: {
      method: "squash",
      expectedHeadSha: pullRequest.head,
      commitTitle:
        `docs(TASK-LOOP-006): L3B integration ${pullRequest.number} (#${pullRequest.number})`,
      commitMessage: "临时远端仅验证人工门禁后的非管理员 expected-Head squash merge。",
      admin: false,
      auto: false,
      deleteBranch: false,
      deploy: false
    }
  }, policy);
  const l3a = {
    transactionId: plan.l3a.transactionId,
    receiptSha256: plan.l3a.receiptSha256,
    planDigest: plan.l3a.planDigest,
    patchDigest: plan.l3a.patchDigest,
    commit: pullRequest.head,
    changedPaths: [pullRequest.file],
    pullRequest: pullRequest.number
  };
  const fixture = { policy, plan, protection, l3a, pullRequest };
  const snapshot = await readTemporaryPreMergeSnapshot(
    bareRoot, fixture, { merged: false, mergeCommit: null }
  );
  const preMerge = validateL3BPreMergeFacts(policy, plan, snapshot, l3a);
  const context = {
    policy,
    plan,
    planFile: `integration-${pullRequest.number}.json`,
    planDigest: canonicalSha256(plan),
    activation: { ok: true },
    cohortDigest: plan.cohortDigest,
    l3a,
    sourceBefore: await readGitState(config),
    repositoryBefore: await readL3RepositoryControls(config.repoRoot),
    preMerge
  };
  return { ...fixture, context };
}

async function readTemporaryPreMergeSnapshot(bareRoot, fixture, state) {
  assert.equal(state.merged, false, "PreMerge Snapshot 不得伪造已合并状态");
  const mainRevision = (await gitRequired(path.dirname(bareRoot), [
    "--git-dir", bareRoot, "rev-parse", "refs/heads/main"
  ])).trim();
  const headRevision = (await gitRequired(path.dirname(bareRoot), [
    "--git-dir", bareRoot, "rev-parse", `refs/heads/${fixture.plan.pullRequest.headBranch}`
  ])).trim();
  const tree = (await gitRequired(path.dirname(bareRoot), [
    "--git-dir", bareRoot, "rev-parse", `${headRevision}^{tree}`
  ])).trim();
  return {
    repository: fixture.policy.repository,
    pullRequest: {
      number: fixture.plan.pullRequest.number,
      url: fixture.plan.pullRequest.url,
      state: "open",
      draft: false,
      merged: false,
      mergeable: true,
      mergeableState: "clean",
      autoMerge: null,
      author: "github-actions[bot]",
      headRepository: fixture.policy.repository,
      headBranch: fixture.plan.pullRequest.headBranch,
      headRevision,
      baseRepository: fixture.policy.repository,
      baseBranch: "main",
      baseRevision: fixture.plan.baseRevision,
      commitCount: 1,
      changedFiles: fixture.plan.pullRequest.changedPaths.length,
      mergeCommitSha: null,
      mergedBy: null
    },
    mainRevision,
    commits: [{ sha: headRevision, tree }],
    files: [...fixture.plan.pullRequest.changedPaths],
    reviews: [{
      id: fixture.plan.humanApproval.reviewId,
      author: fixture.plan.humanApproval.reviewer,
      state: "APPROVED",
      commitId: headRevision,
      submittedAt: fixture.plan.humanApproval.submittedAt,
      url: fixture.plan.humanApproval.reviewUrl
    }],
    checkRuns: fixture.plan.checks.map((item) => ({
      id: item.checkRunId,
      name: item.name,
      appId: item.appId,
      headRevision,
      status: "completed",
      conclusion: "success",
      startedAt: item.completedAt,
      completedAt: item.completedAt,
      detailsUrl: item.detailsUrl
    })),
    headCommit: { sha: headRevision, tree, parents: [fixture.plan.baseRevision] },
    protection: fixture.protection,
    deployments: [],
    readAt: new Date().toISOString()
  };
}

async function squashTemporaryPullRequest(root, bareRoot, fixture) {
  const merger = path.join(root, `merger-${fixture.plan.pullRequest.number}`);
  await gitRequired(root, ["clone", "--quiet", bareRoot, merger]);
  await gitRequired(merger, ["config", "user.name", "Deeptrail L3B Integration"]);
  await gitRequired(merger, ["config", "user.email", "l3b-integration@example.invalid"]);
  await gitRequired(merger, ["checkout", "-B", "main", "origin/main"]);
  await gitRequired(merger, [
    "merge", "--squash", `origin/${fixture.plan.pullRequest.headBranch}`
  ]);
  await gitRequired(merger, [
    "commit", "--quiet",
    "-m", fixture.plan.merge.commitTitle,
    "-m", fixture.plan.merge.commitMessage
  ]);
  const sha = (await gitRequired(merger, ["rev-parse", "HEAD"])).trim();
  const tree = (await gitRequired(merger, ["rev-parse", "HEAD^{tree}"])).trim();
  await gitRequired(merger, ["push", "origin", "HEAD:refs/heads/main"]);
  return { sha, tree };
}

async function readTemporaryMergeResult(bareRoot, fixture, state) {
  const mainRevision = (await gitRequired(path.dirname(bareRoot), [
    "--git-dir", bareRoot, "rev-parse", "refs/heads/main"
  ])).trim();
  let mergeCommit = null;
  if (state.merged) {
    const [tree, parents, message] = await Promise.all([
      gitRequired(path.dirname(bareRoot), [
        "--git-dir", bareRoot, "show", "-s", "--format=%T", state.mergeCommit
      ]),
      gitRequired(path.dirname(bareRoot), [
        "--git-dir", bareRoot, "show", "-s", "--format=%P", state.mergeCommit
      ]),
      gitRequired(path.dirname(bareRoot), [
        "--git-dir", bareRoot, "show", "-s", "--format=%B", state.mergeCommit
      ])
    ]);
    mergeCommit = {
      sha: state.mergeCommit,
      tree: tree.trim(),
      parents: parents.trim().split(/\s+/).filter(Boolean),
      message: message.trimEnd()
    };
  }
  return {
    pullRequest: {
      number: fixture.plan.pullRequest.number,
      state: state.merged ? "closed" : "open",
      merged: state.merged,
      draft: false,
      headRevision: fixture.plan.pullRequest.headRevision,
      headBranch: fixture.plan.pullRequest.headBranch,
      baseBranch: "main",
      mergeCommitSha: state.mergeCommit,
      mergedBy: state.merged ? "cyhui555" : null
    },
    mainRevision,
    mergeCommit,
    deployments: []
  };
}

function temporaryProtection(requiredChecks) {
  return {
    branch: {
      required_status_checks: {
        strict: true,
        checks: requiredChecks.map((item) => ({ context: item.name, app_id: item.appId }))
      },
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_last_push_approval: true,
        required_approving_review_count: 1,
        require_code_owner_reviews: false
      },
      enforce_admins: { enabled: true },
      required_linear_history: { enabled: true },
      required_conversation_resolution: { enabled: true },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false }
    },
    repository: {
      allow_squash_merge: true,
      allow_auto_merge: false,
      delete_branch_on_merge: false
    }
  };
}

async function gitRequired(cwd, args) {
  return requireSuccess(await runProcess("git", args, {
    cwd,
    timeoutMs: 30_000,
    outputLimit: 4 * 1024 * 1024
  }), `集成 Git ${args.at(-1)}`).stdout;
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
