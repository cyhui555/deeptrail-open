import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalSha256 } from "../canonical.mjs";
import { resolveGatewayConfig } from "../config.mjs";
import { LoopGatewayError } from "../errors.mjs";
import { sha256 } from "../fs-safe.mjs";
import { readGitState } from "../git-state.mjs";
import { cohortAdmissionDigest, evaluateCohort, validateManifestShape } from "../l2-cohort.mjs";
import {
  assertPathAllowed,
  loadL3Policy,
  validateL3ChangePlan,
  validateL3Policy
} from "../l3-plan.mjs";
import {
  loadL3BPolicy,
  normalizeL3BProtectionSnapshot,
  validateL3BMergePlan,
  validateL3BPolicy
} from "../l3-merge-plan.mjs";
import {
  executePreparedL3BMerge,
  recoverL3BMerge,
  validateL3BActivationEvidence,
  validateL3BMergedFacts,
  validateL3BPreMergeFacts
} from "../l3-merge.mjs";
import {
  publishL3Draft,
  readL3RepositoryControls,
  stagePreparedL3Change,
  validateL3ApprovalEvidence,
  verifyPublishedL3State
} from "../l3-worktree.mjs";
import { acquireWriteLock, quarantineStaleWriteLock } from "../lock.mjs";
import { recoverLoop } from "../operations.mjs";
import { requireSuccess, runProcess } from "../process.mjs";
import { validateLegacyReceiptPolicy, verifyReceiptSet } from "../receipt-integrity.mjs";
import { assertAllowedLoopAnyArgs, sanitizedEnvironment } from "../runtime.mjs";
import { detectUnexpectedProcessError, stableRunIdentity } from "../shadow.mjs";
import { generateProposal } from "../proposal.mjs";
import { syncSkills, verifySkills } from "../skills.mjs";
import {
  beginTransaction,
  inspectTransactions,
  verifyReceiptFile,
  writeReceipt
} from "../transactions.mjs";
import { manifestDigest } from "../tree.mjs";

const staticConfig = {
  schemaVersion: 1,
  projectId: "deeptrail",
  loopany: {
    commit: "0123456789012345678901234567890123456789",
    cliVersion: "0.2.0",
    bunVersion: "1.3.14",
    skills: ["loopany-core", "loopany-review"]
  },
  profiles: { docs: [["pnpm", "docs:check"]] },
  shadowPolicy: {
    workItemPattern: "^docs/issues/(task|bug|spike)-[a-z0-9-]+\\.md$",
    requireCleanWorktree: true,
    maxCommands: 2,
    maxCommandSeconds: 180,
    maxOutputBytes: 2097152,
    maxAttempts: 1,
    unexpectedErrorPatterns: [
      "uncaughtException", "Error: aborted", "Failed to proxy", "ECONNREFUSED", "AggregateError"
    ],
    mutationEnabled: false,
    remoteGitWrite: false,
    autoSkillActivation: false
  }
};

test("配置拒绝把 Loop Workspace 放进 Git 工作树", async () => {
  const root = await temporary("config");
  const repo = path.join(root, "repo");
  await mkdir(repo);
  await assert.rejects(
    resolveGatewayConfig({
      staticConfig,
      repoRoot: repo,
      env: {
        DEEPTRAIL_LOOP_HOME: path.join(repo, ".loop"),
        LOOPANY_SOURCE_ROOT: path.join(root, "source"),
        LOOPANY_BUN: path.join(root, "bun.exe")
      }
    }),
    (error) => error instanceof LoopGatewayError && error.code === "UNSAFE_RUNTIME_PATH"
  );
});

test("LoopAny 子命令使用显式允许列表", () => {
  assert.doesNotThrow(() => assertAllowedLoopAnyArgs(["artifact", "list", "--kind", "run"]));
  assert.throws(
    () => assertAllowedLoopAnyArgs(["factory", "--port", "3000"]),
    (error) => error instanceof LoopGatewayError && error.code === "LOOPANY_COMMAND_DENIED"
  );
});

test("单写锁阻止第二个写者并校验所有权", async () => {
  const config = await fakeConfig("lock");
  const first = await acquireWriteLock(config, "first");
  await assert.rejects(
    acquireWriteLock(config, "second"),
    (error) => error instanceof LoopGatewayError && error.code === "WRITER_LOCKED"
  );
  await first.release();
  const second = await acquireWriteLock(config, "second");
  await second.release();
});

test("活进程写锁和错误 Token 均不能被清理", async () => {
  const config = await fakeConfig("lock-clear");
  const lock = await acquireWriteLock(config, "active");
  await assert.rejects(
    quarantineStaleWriteLock(config, "00000000-0000-4000-8000-000000000000"),
    (error) => error instanceof LoopGatewayError && error.code === "LOCK_TOKEN_MISMATCH"
  );
  await assert.rejects(
    quarantineStaleWriteLock(config, lock.record.token),
    (error) => error instanceof LoopGatewayError && error.code === "LOCK_OWNER_ALIVE"
  );
  await lock.release();
});

test("严格 Cohort Recovery 只忽略当前进程精确拥有的 L3 事务", async () => {
  const config = await fakeConfig("l3-recovery-scope");
  const gitCommit = "a".repeat(40);
  const lock = await acquireWriteLock(config, "l3:preflight", { gitCommit });
  const transaction = await beginTransaction(config, "l3:preflight", { expectedRevision: gitCommit });
  let other;
  await transaction.checkpoint("applying");
  const activeOperation = {
    operation: "l3:preflight",
    transactionId: transaction.id,
    lockToken: lock.record.token
  };
  try {
    assert.equal((await recoverLoop(config)).ok, false);
    await assert.rejects(
      recoverLoop(config, {
        activeOperation: {
          ...activeOperation,
          lockToken: "00000000-0000-4000-8000-000000000000"
        }
      }),
      (error) => error instanceof LoopGatewayError
        && error.code === "RECOVERY_ACTIVE_SCOPE_INVALID"
    );
    const owned = await recoverLoop(config, { activeOperation });
    assert.equal(owned.ok, true);
    assert.equal(owned.lock, null);
    assert.deepEqual(owned.activeOperation, {
      operation: "l3:preflight",
      transactionId: transaction.id
    });

    other = await beginTransaction(config, "shadow", { expectedRevision: gitCommit });
    await other.checkpoint("applying");
    const blocked = await recoverLoop(config, { activeOperation });
    assert.equal(blocked.ok, false);
    assert.deepEqual(blocked.incomplete.map(({ id }) => id), [other.id]);
  } finally {
    if (other?.status === "applying") await other.checkpoint("failed");
    if (transaction.status === "applying") await transaction.checkpoint("failed");
    await lock.release();
  }
  assert.equal((await recoverLoop(config)).ok, true);
});

test("子进程环境不继承未批准 Secret", () => {
  process.env.DEEPTRAIL_SECRET_FIXTURE = "must-not-leak";
  try {
    const env = sanitizedEnvironment({ CI: "1" });
    assert.equal(env.DEEPTRAIL_SECRET_FIXTURE, undefined);
    assert.equal(env.CI, "1");
  } finally {
    delete process.env.DEEPTRAIL_SECRET_FIXTURE;
  }
});

test("Skill 快照逐文件锁定且篡改后失败", async () => {
  const config = await fakeConfig("skills");
  for (const skill of staticConfig.loopany.skills) {
    const directory = path.join(config.sourceRoot, "skills", skill, "references");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(config.sourceRoot, "skills", skill, "SKILL.md"), `# ${skill}\n`);
    await writeFile(path.join(directory, "guide.md"), "evidence\n");
  }
  const first = await syncSkills(config, { requireTracked: false });
  assert.equal(first.files, 4);
  assert.equal((await verifySkills(config, { requireTracked: false })).ok, true);
  assert.equal((await syncSkills(config, { requireTracked: false })).reused, true);
  await writeFile(path.join(config.skillSnapshot, "loopany-core", "SKILL.md"), "tampered\n");
  const lockFile = path.join(config.skillSnapshot, "manifest.lock.json");
  const lock = JSON.parse(await readFile(lockFile, "utf8"));
  const item = lock.files.find((entry) => entry.path === "loopany-core/SKILL.md");
  item.sha256 = sha256("tampered\n");
  await writeFile(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  await assert.rejects(
    verifySkills(config, { requireTracked: false }),
    (error) => error instanceof LoopGatewayError && error.code === "SKILL_SNAPSHOT_TAMPERED"
  );
});

test("事务使用追加快照并可识别未终结状态", async () => {
  const config = await fakeConfig("transaction");
  const transaction = await beginTransaction(config, "test", { value: 1 });
  await transaction.checkpoint("applying");
  const items = await inspectTransactions(config);
  assert.equal(items.length, 1);
  assert.equal(items[0].latest.status, "applying");
  await transaction.checkpoint("source_committed");
  await transaction.checkpoint("postchecking");
  await transaction.checkpoint("closed");
  assert.equal((await inspectTransactions(config))[0].latest.status, "closed");
});

test("事务拒绝跳过阶段并拒绝终态重开", async () => {
  const config = await fakeConfig("transaction-transition");
  const transaction = await beginTransaction(config, "test", {});
  await assert.rejects(
    transaction.checkpoint("source_committed"),
    (error) => error instanceof LoopGatewayError && error.code === "TRANSACTION_TRANSITION_DENIED"
  );
  await transaction.checkpoint("failed");
  await assert.rejects(
    transaction.checkpoint("applying"),
    (error) => error instanceof LoopGatewayError && error.code === "TRANSACTION_TERMINAL"
  );
});

test("事务 Hash 链被修改后失败关闭", async () => {
  const config = await fakeConfig("transaction-tamper");
  const transaction = await beginTransaction(config, "test", { fixed: true });
  await transaction.checkpoint("applying", { step: 1 });
  const file = path.join(transaction.directory, "002-applying.json");
  const snapshot = JSON.parse(await readFile(file, "utf8"));
  snapshot.details.step = 2;
  await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  await assert.rejects(
    inspectTransactions(config),
    (error) => error instanceof LoopGatewayError && error.code === "TRANSACTION_TAMPERED"
  );
});

test("Receipt 原子创建并可识别联合篡改", async () => {
  const config = await fakeConfig("receipt");
  const receipt = await writeReceipt(config, "receipt-test", { operation: "test", outcome: "passed" });
  assert.equal((await verifyReceiptFile(receipt.file)).integritySha256, receipt.integritySha256);
  const parsed = JSON.parse(await readFile(receipt.file, "utf8"));
  parsed.outcome = "failed";
  await writeFile(receipt.file, `${JSON.stringify(parsed, null, 2)}\n`);
  await assert.rejects(
    verifyReceiptFile(receipt.file),
    (error) => error instanceof LoopGatewayError && error.code === "RECEIPT_TAMPERED"
  );
});

test("历史 v1 Receipt 只接受固定 Backup 的逐字节证明", async () => {
  const fixture = await legacyReceiptFixture("receipt-v1");
  const report = await verifyReceiptSet(fixture.config, { policy: fixture.policy });
  assert.equal(report.total, 1);
  assert.equal(report.v2Verified, 0);
  assert.equal(report.legacyAttested, 1);
  assert.equal(report.unattestedLegacy, 0);

  await writeFile(fixture.currentFile, fixture.raw.replace('"outcome": "passed"', '"outcome": "failed"'));
  await assert.rejects(
    verifyReceiptSet(fixture.config, { policy: fixture.policy }),
    (error) => error instanceof LoopGatewayError && error.code === "LEGACY_RECEIPT_TAMPERED"
  );

  await writeFile(fixture.currentFile, fixture.raw);
  await writeFile(fixture.backupFile, fixture.raw.replace('"outcome": "passed"', '"outcome": "failed"'));
  await assert.rejects(
    verifyReceiptSet(fixture.config, { policy: fixture.policy }),
    (error) => error instanceof LoopGatewayError && error.code === "BACKUP_PAYLOAD_TAMPERED"
  );
});

test("未知 v1 Receipt 与兼容策略放宽均失败关闭", async () => {
  const fixture = await legacyReceiptFixture("receipt-v1-unknown");
  const unknown = fixture.fileName.replace("11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222");
  await writeFile(path.join(fixture.config.receiptRoot, unknown), fixture.raw.replace(
    fixture.document.receiptId, unknown.slice(0, -5)
  ));
  await assert.rejects(
    verifyReceiptSet(fixture.config, { policy: fixture.policy }),
    (error) => error instanceof LoopGatewayError && error.code === "LEGACY_RECEIPT_UNATTESTED"
  );

  const widened = structuredClone(fixture.policy);
  widened.receipts.push(widened.receipts[0]);
  assert.throws(
    () => validateLegacyReceiptPolicy(widened),
    (error) => error instanceof LoopGatewayError && error.code === "LEGACY_RECEIPT_POLICY_INVALID"
  );
});

test("Backup Root 不得与 Loop Home 重叠", async () => {
  const root = await temporary("backup-overlap");
  await assert.rejects(
    resolveGatewayConfig({
      staticConfig,
      repoRoot: path.join(root, "repo"),
      env: {
        DEEPTRAIL_LOOP_HOME: path.join(root, "runtime"),
        DEEPTRAIL_LOOP_BACKUP_ROOT: path.join(root, "runtime", "backups"),
        LOOPANY_SOURCE_ROOT: path.join(root, "source"),
        LOOPANY_BUN: path.join(root, "bun.exe")
      }
    }),
    (error) => error instanceof LoopGatewayError && error.code === "OVERLAPPING_RUNTIME_PATH"
  );
});

test("相同输入生成同一 Run ID，任一输入变化都会分叉", () => {
  const base = { workItemHash: "a", gitCommit: "b", profile: "docs" };
  assert.deepEqual(stableRunIdentity(base), stableRunIdentity(base));
  assert.notEqual(
    stableRunIdentity(base).runId,
    stableRunIdentity({ ...base, profile: "gateway" }).runId
  );
});

test("退出码为零时仍拒绝未预期进程错误", () => {
  assert.equal(
    detectUnexpectedProcessError({ shadowPolicy: staticConfig.shadowPolicy }, "uncaughtException: boom"),
    "uncaughtException"
  );
  assert.equal(
    detectUnexpectedProcessError({ shadowPolicy: staticConfig.shadowPolicy }, "普通构建警告"),
    null
  );
});

test("L2 只生成确定性 Proposal 且所有写权限保持关闭", () => {
  const outcome = {
    schemaVersion: 1,
    release: {
      releaseId: "eval-release",
      gitCommit: "a".repeat(40),
      serverArtifactDigest: `sha256:${"b".repeat(64)}`
    },
    totals: {
      tasks: 10,
      completed: 7,
      failed: 1,
      timeout: 1,
      cancelled: 1,
      parseInvalid: 1,
      degraded: 2,
      tokenTotal: 100
    },
    privacy: {
      containsPrompt: false,
      containsUserId: false,
      containsRawResponse: false,
      containsItineraryText: false
    }
  };

  const first = generateProposal(outcome);
  const second = generateProposal(outcome);
  assert.deepEqual(first, second);
  assert.equal(first.mode, "proposal-only");
  assert.deepEqual(first.constraints, {
    sourceMutation: false,
    remoteGit: false,
    autoApprove: false,
    autoMerge: false,
    autoDeploy: false
  });
  assert.equal(first.decision, "human-review-required");
  assert.throws(
    () => generateProposal({ ...outcome, privacy: undefined }),
    /隐私边界未通过/
  );
});

test("L2 Cohort 按 Work Item 计数并允许固定门槛内的一次失败", () => {
  const registrations = Array.from({ length: 10 }, (_, index) =>
    cohortRegistration(index + 1, index === 0 ? "failed" : "verified"));
  const report = evaluateCohort(registrations);
  assert.equal(report.workItemCount, 10);
  assert.equal(report.metrics.firstVerificationSuccessRate, 0.9);
  assert.equal(report.metrics.idempotentReuseSuccessRate, 1);
  assert.equal(report.metrics.closureRate, 1);
  assert.equal(report.metrics.boundaryViolationRate, 0);
  assert.equal(report.metrics.lastConsecutivePasses, 9);
  assert.equal(report.cohortReady, true);
});

test("L2 Cohort 拒绝放宽门槛，边界违规会阻止晋级", () => {
  assert.throws(
    () => validateManifestShape(cohortManifest({ firstVerificationSuccessRate: 0.8 })),
    (error) => error instanceof LoopGatewayError && error.code === "L2_COHORT_THRESHOLD_DRIFT"
  );
  const registrations = Array.from({ length: 10 }, (_, index) =>
    cohortRegistration(index + 1, "verified", index === 9));
  const report = evaluateCohort(registrations);
  assert.equal(report.metrics.boundaryViolationRate, 0.1);
  assert.equal(report.metrics.lastConsecutivePasses, 0);
  assert.equal(report.cohortReady, false);
});

test("L2 Cohort 新 Evidence 必须引用上一版 main 已登记的样本", () => {
  const previous = cohortManifest();
  previous.evidence = [];
  const next = structuredClone(previous);
  next.registrations.push({
    sequence: 2,
    workItem: ["docs", "issues", "bug-next.md"].join("/"),
    profiles: ["docs"]
  });
  next.evidence.push({
    registrationSequence: 2,
    runs: [{ profile: "docs", runId: `run-${"b".repeat(24)}` }]
  });
  assert.throws(
    () => validateManifestShape(next, previous),
    (error) => error instanceof LoopGatewayError && error.code === "L2_COHORT_NOT_PREREGISTERED"
  );
});

test("L2 准入摘要忽略追加诊断计数但绑定 Cohort 事实", () => {
  const evaluated = evaluateCohort(Array.from({ length: 10 }, (_, index) =>
    cohortRegistration(index + 1, "verified")));
  const report = {
    schemaVersion: 1,
    cohortId: "stable-cohort",
    repository: "cyhui555/deeptrail-open",
    baseRevision: "a".repeat(40),
    integrity: { receiptsVerified: 10 },
    ...evaluated
  };
  const digest = cohortAdmissionDigest(report);
  assert.equal(cohortAdmissionDigest({
    ...report,
    integrity: { receiptsVerified: 999, auditEntries: 999 }
  }), digest);
  assert.notEqual(cohortAdmissionDigest({
    ...report,
    metrics: { ...report.metrics, lastConsecutivePasses: 11 }
  }), digest);
});

test("L3 Policy 保留关闭基线并拒绝预算、路径和权限漂移", async () => {
  const livePolicy = await loadL3Policy();
  const policy = validateL3Policy({
    ...livePolicy,
    stage: "preflight-disabled",
    activation: {
      enabled: false,
      approvedRevision: null,
      mergedRevision: null,
      l2CohortDigest: null,
      humanApprover: null,
      approvalUrl: null
    },
    permissions: {
      isolatedWorktreeMutation: false,
      localCommit: false,
      remoteBranchPush: false,
      draftPullRequest: false,
      autoApprove: false,
      autoMerge: false,
      autoDeploy: false
    }
  });
  assert.equal(policy.stage, "preflight-disabled");
  assert.equal(policy.permissions.isolatedWorktreeMutation, false);
  assert.throws(
    () => validateL3Policy({
      ...policy,
      permissions: { ...policy.permissions, isolatedWorktreeMutation: true }
    }),
    (error) => error instanceof LoopGatewayError && error.code === "L3_POLICY_PREMATURE_ENABLE"
  );
  assert.throws(
    () => assertPathAllowed("scripts/loop/cli.mjs", policy),
    (error) => error instanceof LoopGatewayError && error.code === "L3_PATH_ROOT_DENIED"
  );
  assert.throws(
    () => assertPathAllowed("docs/issues/task-l3-001-fixture.md", policy),
    (error) => error instanceof LoopGatewayError && error.code === "L3_PATH_DENIED"
  );
  assert.equal(assertPathAllowed("docs/product/pilot.md", policy), "docs/product/pilot.md");
});

test("L3A activation 精确绑定受保护合入证据与最小权限", async () => {
  const policy = await loadL3Policy();
  assert.deepEqual(policy.activation, {
    enabled: true,
    approvedRevision: "340e729ca5ad96a6d9b23cf5099619051628cf2d",
    mergedRevision: "c81c5ccef87e9815383e57b0f06e7193968d93c6",
    l2CohortDigest: "0cb0880be966bbda8e9699362cc9ebee64149f5149ff72db4ceca30421ffb431",
    humanApprover: "cyhui555",
    approvalUrl: "https://github.com/cyhui555/deeptrail-open/pull/36#pullrequestreview-4727476962"
  });
  assert.deepEqual(policy.permissions, {
    isolatedWorktreeMutation: true,
    localCommit: true,
    remoteBranchPush: true,
    draftPullRequest: true,
    autoApprove: false,
    autoMerge: false,
    autoDeploy: false
  });
});

test("L3A 人工批准同时绑定最终 Review Head 与 main 合入 Revision", async () => {
  const policy = enabledL3Policy(await loadL3Policy(), "a".repeat(40));
  const evidence = {
    approvalUrl: policy.activation.approvalUrl,
    pullRequest: 1,
    reviewId: 1,
    author: "cyhui555",
    state: "APPROVED",
    reviewedRevision: policy.activation.approvedRevision,
    headRevision: policy.activation.approvedRevision,
    mergedRevision: policy.activation.mergedRevision,
    merged: true,
    baseBranch: "main"
  };
  assert.equal(validateL3ApprovalEvidence(policy, evidence), evidence);
  assert.throws(
    () => validateL3ApprovalEvidence(policy, { ...evidence, headRevision: "c".repeat(40) }),
    (error) => error instanceof LoopGatewayError
      && error.code === "L3_APPROVAL_EVIDENCE_INVALID"
  );
});

test("L3A 在隔离 Worktree 应用 Patch、提交并仅发布机器人 Draft PR", async () => {
  const fixture = await l3Fixture();
  const staged = await stagePreparedL3Change(fixture.config, fixture.context);
  assert.equal(staged.diff.addedLines, 1);
  assert.equal(staged.diff.deletedLines, 1);
  assert.equal(staged.verification.profile, "docs");
  assert.equal((await readGitState(fixture.config)).gitStatus, "");

  const published = await publishL3Draft(fixture.config, fixture.context, staged, {
    createDraftPullRequest: async ({ plan }) => ({
      url: "https://github.com/cyhui555/deeptrail-open/pull/999",
      draft: true,
      author: "github-actions[bot]",
      head: plan.pullRequest.targetBranch,
      base: plan.baseBranch,
      commit: staged.commit
    })
  });
  assert.equal(published.autoMerge, false);
  assert.equal((await gitTest(fixture.repoRoot, [
    "ls-remote", "--heads", "origin", `refs/heads/${fixture.plan.sourceBranch}`
  ])).split(/\s+/, 1)[0], staged.commit);
  assert.equal((await gitTest(fixture.repoRoot, ["config", "user.name"])).trim(), "L3 Test");
  assert.equal((await verifyPublishedL3State(staged, published, {
    verifyPullRequest: async () => published.pullRequest
  })).ok, true);
});

test("L3B Engine 默认关闭并拒绝一次变更同时扩大和使用权限", async () => {
  const policy = await loadL3BPolicy();
  assert.equal(policy.stage, "l3b-disabled");
  assert.equal(policy.activation.enabled, false);
  assert.deepEqual(policy.permissions, {
    markReady: false,
    submitReview: false,
    controlledSquashMerge: false,
    autoApprove: false,
    adminMerge: false,
    forcePush: false,
    deleteRemoteBranch: false,
    autoDeploy: false
  });
  assert.throws(
    () => validateL3BPolicy({
      ...policy,
      permissions: { ...policy.permissions, controlledSquashMerge: true }
    }),
    (error) => error instanceof LoopGatewayError
      && error.code === "L3B_POLICY_PREMATURE_ENABLE"
  );
});

test("L3B activation 绑定机器人 Engine PR 的最终批准 Head 与合入 Revision", async () => {
  const fixture = await l3bFactsFixture();
  const policy = fixture.policy;
  const evidence = {
    approvalUrl: policy.activation.approvalUrl,
    pullRequest: 88,
    reviewId: 8800,
    author: "cyhui555",
    state: "APPROVED",
    reviewedRevision: policy.activation.engineApprovedRevision,
    headRevision: policy.activation.engineApprovedRevision,
    mergedRevision: policy.activation.engineMergedRevision,
    merged: true,
    baseBranch: "main",
    pullRequestAuthor: "github-actions[bot]"
  };
  assert.equal(validateL3BActivationEvidence(policy, evidence), evidence);
  assert.throws(
    () => validateL3BActivationEvidence(policy, {
      ...evidence,
      reviewedRevision: "f".repeat(40)
    }),
    (error) => error instanceof LoopGatewayError
      && error.code === "L3B_APPROVAL_EVIDENCE_INVALID"
  );
});

test("L3B MergePlan 与保护快照精确绑定 Required Checks、Review 和拒绝权限", async () => {
  const fixture = await l3bFactsFixture();
  const plan = validateL3BMergePlan(fixture.plan, fixture.policy);
  assert.equal(plan.merge.admin, false);
  assert.equal(plan.merge.auto, false);
  assert.equal(plan.merge.deploy, false);
  assert.equal(fixture.protection.digest, plan.protectionDigest);

  const relaxed = structuredClone(fixture.rawProtection);
  relaxed.branch.enforce_admins.enabled = false;
  assert.throws(
    () => normalizeL3BProtectionSnapshot(relaxed, fixture.policy),
    (error) => error instanceof LoopGatewayError && error.code === "L3B_PROTECTION_DRIFT"
  );
  assert.throws(
    () => validateL3BMergePlan({
      ...plan,
      merge: { ...plan.merge, admin: true }
    }, fixture.policy),
    (error) => error instanceof LoopGatewayError && error.code === "L3B_PLAN_MERGE_INVALID"
  );
});

test("L3B 只接受 Ready、精确 Head、最新人工批准和全部成功 Check", async () => {
  const fixture = await l3bFactsFixture();
  const accepted = validateL3BPreMergeFacts(
    fixture.policy, fixture.plan, fixture.snapshot, fixture.l3a
  );
  assert.equal(accepted.headRevision, fixture.head);
  assert.equal(accepted.checks.length, 5);

  assert.throws(
    () => validateL3BPreMergeFacts(fixture.policy, fixture.plan, {
      ...fixture.snapshot,
      pullRequest: { ...fixture.snapshot.pullRequest, draft: true }
    }, fixture.l3a),
    (error) => error instanceof LoopGatewayError && error.code === "L3B_PR_DRIFT"
  );
  const skipped = structuredClone(fixture.snapshot);
  skipped.checkRuns[0].conclusion = "skipped";
  assert.throws(
    () => validateL3BPreMergeFacts(fixture.policy, fixture.plan, skipped, fixture.l3a),
    (error) => error instanceof LoopGatewayError && error.code === "L3B_CHECK_INVALID"
  );
  const staleApproval = structuredClone(fixture.snapshot);
  staleApproval.reviews.push({
    ...staleApproval.reviews[0],
    id: staleApproval.reviews[0].id + 1,
    state: "CHANGES_REQUESTED",
    submittedAt: "2026-07-18T05:11:00.000Z"
  });
  assert.throws(
    () => validateL3BPreMergeFacts(
      fixture.policy, fixture.plan, staleApproval, fixture.l3a
    ),
    (error) => error instanceof LoopGatewayError && error.code === "L3B_REVIEW_REJECTED"
  );
});

test("L3B 合并前二次取证阻断竞态，未知响应进入只读恢复", async () => {
  const source = await l3Fixture();
  const fixture = await l3bFactsFixture();
  const preMerge = validateL3BPreMergeFacts(
    fixture.policy, fixture.plan, fixture.snapshot, fixture.l3a
  );
  const context = {
    policy: fixture.policy,
    plan: fixture.plan,
    planFile: "fixture.json",
    planDigest: canonicalSha256(fixture.plan),
    activation: {},
    cohortDigest: fixture.plan.cohortDigest,
    l3a: fixture.l3a,
    sourceBefore: await readGitState(source.config),
    repositoryBefore: await readL3RepositoryControls(source.repoRoot),
    preMerge
  };
  let mergeCalls = 0;
  await assert.rejects(
    executePreparedL3BMerge(source.config, context, {
      readRemoteSnapshot: async () => ({
        ...fixture.snapshot,
        mainRevision: "f".repeat(40)
      }),
      mergePullRequest: async () => {
        mergeCalls += 1;
        return { merged: true, sha: fixture.mergeCommit };
      }
    }),
    (error) => error instanceof LoopGatewayError && error.code === "L3B_BASE_DRIFT"
  );
  assert.equal(mergeCalls, 0);

  const unknown = await captureError(() => executePreparedL3BMerge(source.config, context, {
    readRemoteSnapshot: async () => fixture.snapshot,
    mergePullRequest: async () => { throw new Error("response lost"); }
  }));
  assert.equal(unknown.code, "L3B_MERGE_RESULT_UNKNOWN");
  assert.equal(unknown.details.recovery.remoteWriteMayHaveOccurred, true);
});

test("L3B Postcheck 绑定 squash 父提交、Head Tree、main 与零部署", async () => {
  const fixture = await l3bFactsFixture();
  const preMerge = validateL3BPreMergeFacts(
    fixture.policy, fixture.plan, fixture.snapshot, fixture.l3a
  );
  const verified = validateL3BMergedFacts(
    fixture.policy,
    fixture.plan,
    preMerge,
    fixture.mergedFacts,
    { merged: true, sha: fixture.mergeCommit }
  );
  assert.equal(verified.tree, fixture.tree);
  assert.equal(verified.parentRevision, fixture.base);
  assert.equal(verified.autoDeploy, false);

  assert.throws(
    () => validateL3BMergedFacts(
      fixture.policy,
      fixture.plan,
      preMerge,
      { ...fixture.mergedFacts, mainRevision: "0".repeat(40) },
      { merged: true, sha: fixture.mergeCommit }
    ),
    (error) => error instanceof LoopGatewayError
      && error.code === "L3B_POSTMERGE_MAIN_DRIFT"
  );
});

test("L3B 结果未知时先判定已合并或未合并，拒绝不一致状态", async () => {
  const source = await l3Fixture();
  const fixture = await l3bFactsFixture();
  const context = {
    policy: fixture.policy,
    plan: fixture.plan,
    sourceBefore: await readGitState(source.config),
    repositoryBefore: await readL3RepositoryControls(source.repoRoot),
    preMerge: validateL3BPreMergeFacts(
      fixture.policy, fixture.plan, fixture.snapshot, fixture.l3a
    )
  };
  const recovery = {
    kind: "l3b-merge",
    remoteWriteMayHaveOccurred: true,
    context,
    immediate: context.preMerge,
    mergeResponse: null
  };
  const notMerged = await recoverL3BMerge(source.config, recovery, {
    readMergeResult: async () => ({
      pullRequest: {
        ...fixture.snapshot.pullRequest,
        mergeCommitSha: null,
        mergedBy: null
      },
      mainRevision: fixture.base,
      mergeCommit: null,
      deployments: []
    })
  });
  assert.equal(notMerged.recoveryDisposition, "not-merged");
  assert.equal(notMerged.retryAllowedAfterNewPreflight, true);

  const merged = await recoverL3BMerge(source.config, recovery, {
    readMergeResult: async () => fixture.mergedFacts
  });
  assert.equal(merged.recoveryDisposition, "merged");
  await assert.rejects(
    recoverL3BMerge(source.config, recovery, {
      readMergeResult: async () => ({
        ...fixture.mergedFacts,
        pullRequest: { ...fixture.mergedFacts.pullRequest, merged: false, state: "open" }
      })
    }),
    (error) => error instanceof LoopGatewayError
      && error.code === "L3B_RECOVERY_INCONSISTENT"
  );
});

async function fakeConfig(name) {
  const root = await temporary(name);
  const repoRoot = path.join(root, "repo");
  const sourceRoot = path.join(root, "source");
  const loopHome = path.join(root, "runtime");
  await mkdir(repoRoot);
  await mkdir(sourceRoot);
  return await resolveGatewayConfig({
    staticConfig,
    repoRoot,
    env: {
      DEEPTRAIL_LOOP_HOME: loopHome,
      DEEPTRAIL_LOOP_BACKUP_ROOT: path.join(root, "backups"),
      LOOPANY_SOURCE_ROOT: sourceRoot,
      LOOPANY_BUN: path.join(root, "bun.exe")
    }
  });
}

async function legacyReceiptFixture(name) {
  const config = await fakeConfig(name);
  const fileName = "20260716180000-11111111-1111-4111-8111-111111111111.json";
  const document = {
    schemaVersion: 1,
    receiptId: fileName.slice(0, -5),
    recordedAt: "2026-07-16T18:00:00.000Z",
    operation: "shadow",
    outcome: "passed"
  };
  const raw = `${JSON.stringify(document, null, 2)}\n`;
  const receiptSha256 = sha256(raw);
  const portableReceipt = `receipts/${fileName}`;
  const files = [{ path: portableReceipt, size: Buffer.byteLength(raw), sha256: receiptSha256 }];
  const payloadDigest = manifestDigest(files);
  const backupId = `backup-20260716194349-${payloadDigest.slice(0, 12)}`;
  const manifest = {
    schemaVersion: 1,
    backupId,
    projectId: config.projectId,
    createdAt: "2026-07-16T19:43:49.645Z",
    sourceRevision: "a".repeat(40),
    loopany: {
      commit: config.loopany.commit,
      cliVersion: config.loopany.cliVersion,
      bunVersion: config.loopany.bunVersion
    },
    payloadDigest,
    files
  };
  const policy = {
    schemaVersion: 1,
    policyId: "test-legacy-receipt-v1",
    recordedBefore: "2026-07-16T18:31:00.000Z",
    backup: {
      id: backupId,
      manifestDigest: canonicalSha256(manifest),
      payloadDigest
    },
    receipts: [{ file: fileName, sha256: receiptSha256 }]
  };
  const currentFile = path.join(config.receiptRoot, fileName);
  const backupRoot = path.join(config.backupRoot, backupId);
  const backupFile = path.join(backupRoot, "payload", "receipts", fileName);
  await mkdir(config.receiptRoot, { recursive: true });
  await mkdir(path.dirname(backupFile), { recursive: true });
  await writeFile(currentFile, raw);
  await writeFile(backupFile, raw);
  await writeFile(path.join(backupRoot, "snapshot.json"), `${JSON.stringify({
    ...manifest,
    manifestDigest: policy.backup.manifestDigest
  }, null, 2)}\n`);
  return { config, fileName, document, raw, policy, currentFile, backupFile };
}

async function l3Fixture() {
  const root = await temporary("l3-stage");
  const repoRoot = path.join(root, "repo");
  const bareRoot = path.join(root, "remote.git");
  const loopHome = path.join(root, "loop-home");
  const sourceRoot = path.join(root, "source");
  const mutationRoot = path.join(root, "mutation");
  const proposalRoot = path.join(loopHome, "proposals");
  await mkdir(repoRoot);
  await mkdir(sourceRoot);
  await mkdir(proposalRoot, { recursive: true });
  await gitTest(repoRoot, ["init"]);
  await gitTest(repoRoot, ["config", "user.name", "L3 Test"]);
  await gitTest(repoRoot, ["config", "user.email", "l3-test@example.invalid"]);
  await gitTest(repoRoot, ["config", "core.autocrlf", "false"]);
  await mkdir(path.join(repoRoot, "docs", "issues"), { recursive: true });
  await writeFile(path.join(repoRoot, "docs", "issues", "task-l3-001-fixture.md"),
    "# TASK-L3-001：隔离试点\n");
  await writeFile(path.join(repoRoot, "docs", "pilot.md"), "before\n");
  await writeFile(path.join(repoRoot, "package.json"), `${JSON.stringify({
    private: true,
    scripts: {
      "docs:check": "node -e \"process.stdout.write('docs-ok\\\\n')\"",
      "security:public-readiness": "node -e \"process.stdout.write('security-ok\\\\n')\""
    }
  }, null, 2)}\n`);
  await writeFile(path.join(repoRoot, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n\n  .: {}\n");
  await writeFile(path.join(repoRoot, ".gitignore"), "node_modules/\n");
  await writeFile(path.join(repoRoot, ".npmrc"),
    `store-dir=${path.join(root, "initially-missing-store").replaceAll("\\", "/")}\n`);
  await gitTest(repoRoot, ["add", "."]);
  await gitTest(repoRoot, ["commit", "-m", "test: baseline"]);
  await gitTest(repoRoot, ["branch", "-M", "main"]);
  await gitTest(root, ["init", "--bare", bareRoot]);
  await gitTest(repoRoot, ["remote", "add", "origin", bareRoot]);
  const baseRevision = (await gitTest(repoRoot, ["rev-parse", "HEAD"])).trim();

  await writeFile(path.join(repoRoot, "docs", "pilot.md"), "after\n");
  const patch = await gitTest(repoRoot, ["diff", "--", "docs/pilot.md"]);
  await writeFile(path.join(repoRoot, "docs", "pilot.md"), "before\n");
  const patchFile = path.join(proposalRoot, "task-l3-001.patch");
  await writeFile(patchFile, patch);
  const policy = enabledL3Policy(await loadL3Policy(), baseRevision);
  const plan = validateL3ChangePlan({
    schemaVersion: 1,
    changeId: "task-l3-001-pilot",
    workItemId: "TASK-L3-001",
    repository: policy.repository,
    baseBranch: policy.baseBranch,
    baseRevision,
    workItem: "docs/issues/task-l3-001-fixture.md",
    sourceBranch: "agent/l3/task-l3-001-pilot",
    profile: "docs",
    patch: {
      file: path.basename(patchFile),
      sha256: sha256(patch),
      changedPaths: ["docs/pilot.md"]
    },
    commitMessage: "docs(TASK-L3-001): update isolated pilot",
    pullRequest: {
      targetBranch: "automation/l3/task-l3-001-pilot",
      title: "TASK-L3-001：隔离试点",
      body: "由 L3A 隔离执行器生成，等待人工所有者审核。",
      draft: true
    }
  }, policy);
  const config = await resolveGatewayConfig({
    staticConfig,
    repoRoot,
    env: {
      DEEPTRAIL_LOOP_HOME: loopHome,
      DEEPTRAIL_LOOP_BACKUP_ROOT: path.join(root, "backups"),
      LOOPANY_SOURCE_ROOT: sourceRoot,
      LOOPANY_BUN: path.join(root, "bun.exe")
    }
  });
  const context = {
    policy,
    plan,
    patchFile,
    remoteUrl: bareRoot,
    paths: { mutationRoot, proposalRoot },
    sourceBefore: await readGitState(config),
    repositoryBefore: await readL3RepositoryControls(repoRoot),
    planDigest: canonicalSha256(plan),
    patchDigest: sha256(patch),
    cohortDigest: policy.activation.l2CohortDigest
  };
  return { config, context, plan, repoRoot };
}

function enabledL3Policy(policy, approvedRevision) {
  return validateL3Policy({
    ...policy,
    stage: "l3a-draft-pr",
    activation: {
      enabled: true,
      approvedRevision,
      mergedRevision: approvedRevision,
      l2CohortDigest: "b".repeat(64),
      humanApprover: "cyhui555",
      approvalUrl: "https://github.com/cyhui555/deeptrail-open/pull/1#pullrequestreview-1"
    },
    permissions: {
      isolatedWorktreeMutation: true,
      localCommit: true,
      remoteBranchPush: true,
      draftPullRequest: true,
      autoApprove: false,
      autoMerge: false,
      autoDeploy: false
    }
  });
}

async function l3bFactsFixture() {
  const disabled = await loadL3BPolicy();
  const rawProtection = {
    branch: {
      required_status_checks: {
        strict: true,
        checks: disabled.requiredChecks.toReversed()
          .map((item) => ({ context: item.name, app_id: item.appId }))
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
  const base = "a".repeat(40);
  const head = "b".repeat(40);
  const tree = "c".repeat(40);
  const mergeCommit = "f".repeat(40);
  const pullRequestNumber = 77;
  const changedPaths = ["docs/product/l3b-merge-pilot.md"];
  const checks = policy.requiredChecks.map((item, index) => ({
    ...item,
    checkRunId: 1001 + index,
    headRevision: head,
    completedAt: `2026-07-18T05:${String(index + 1).padStart(2, "0")}:00.000Z`,
    detailsUrl:
      `https://github.com/cyhui555/deeptrail-open/actions/runs/700/job/${1001 + index}`,
    conclusion: "success"
  }));
  const plan = validateL3BMergePlan({
    schemaVersion: 1,
    mergeId: "task-loop-006-merge-pilot",
    workItemId: "TASK-LOOP-006",
    repository: policy.repository,
    baseBranch: policy.baseBranch,
    baseRevision: base,
    workItem: "docs/issues/task-loop-006-l3b-controlled-merge.md",
    l3a: {
      transactionId: "20260718050000-11111111-1111-4111-8111-111111111111",
      receiptSha256: "3".repeat(64),
      changePlanFile: "task-loop-006-l3b-pilot.json",
      planDigest: "1".repeat(64),
      patchDigest: "2".repeat(64),
      commit: head
    },
    pullRequest: {
      number: pullRequestNumber,
      url: `https://github.com/cyhui555/deeptrail-open/pull/${pullRequestNumber}`,
      author: "github-actions[bot]",
      headBranch: "automation/l3/task-loop-006-merge-pilot",
      headRevision: head,
      commitCount: 1,
      changedPaths
    },
    checks,
    humanApproval: {
      reviewer: "cyhui555",
      reviewId: 9001,
      reviewUrl:
        `https://github.com/cyhui555/deeptrail-open/pull/${pullRequestNumber}#pullrequestreview-9001`,
      reviewedRevision: head,
      submittedAt: "2026-07-18T05:10:00.000Z"
    },
    cohortDigest: policy.activation.l2CohortDigest,
    protectionDigest: protection.digest,
    merge: {
      method: "squash",
      expectedHeadSha: head,
      commitTitle: `docs(TASK-LOOP-006): 完成 L3B 受控合并试点 (#${pullRequestNumber})`,
      commitMessage: "由人工批准与五项必需检查授权本次受控 squash merge。",
      admin: false,
      auto: false,
      deleteBranch: false,
      deploy: false
    }
  }, policy);
  const snapshot = {
    repository: policy.repository,
    pullRequest: {
      number: pullRequestNumber,
      url: plan.pullRequest.url,
      state: "open",
      draft: false,
      merged: false,
      mergeable: true,
      mergeableState: "clean",
      autoMerge: null,
      author: "github-actions[bot]",
      headRepository: policy.repository,
      headBranch: plan.pullRequest.headBranch,
      headRevision: head,
      baseRepository: policy.repository,
      baseBranch: "main",
      baseRevision: base,
      commitCount: 1,
      changedFiles: changedPaths.length,
      mergeCommitSha: null,
      mergedBy: null
    },
    mainRevision: base,
    commits: [{ sha: head, tree }],
    files: changedPaths,
    reviews: [{
      id: plan.humanApproval.reviewId,
      author: plan.humanApproval.reviewer,
      state: "APPROVED",
      commitId: head,
      submittedAt: plan.humanApproval.submittedAt,
      url: plan.humanApproval.reviewUrl
    }],
    checkRuns: checks.map((item) => ({
      id: item.checkRunId,
      name: item.name,
      appId: item.appId,
      headRevision: head,
      status: "completed",
      conclusion: item.conclusion,
      startedAt: item.completedAt,
      completedAt: item.completedAt,
      detailsUrl: item.detailsUrl
    })),
    headCommit: { sha: head, tree, parents: [base] },
    protection,
    deployments: [],
    readAt: "2026-07-18T05:12:00.000Z"
  };
  const l3a = {
    transactionId: plan.l3a.transactionId,
    receiptSha256: plan.l3a.receiptSha256,
    planDigest: plan.l3a.planDigest,
    patchDigest: plan.l3a.patchDigest,
    commit: head,
    changedPaths,
    pullRequest: pullRequestNumber
  };
  const mergedFacts = {
    pullRequest: {
      ...snapshot.pullRequest,
      state: "closed",
      merged: true,
      mergeCommitSha: mergeCommit,
      mergedBy: "cyhui555"
    },
    mainRevision: mergeCommit,
    mergeCommit: {
      sha: mergeCommit,
      tree,
      parents: [base],
      message: `${plan.merge.commitTitle}\n\n${plan.merge.commitMessage}`
    },
    deployments: []
  };
  return {
    policy,
    plan,
    rawProtection,
    protection,
    snapshot,
    l3a,
    mergedFacts,
    base,
    head,
    tree,
    mergeCommit
  };
}

async function captureError(action) {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("预期操作失败，但实际成功");
}

async function gitTest(cwd, args) {
  return requireSuccess(await runProcess("git", args, {
    cwd,
    timeoutMs: 30_000,
    outputLimit: 4 * 1024 * 1024
  }), `测试 Git ${args[0]}`).stdout;
}

async function temporary(name) {
  return await mkdtemp(path.join(os.tmpdir(), `deeptrail-loop-${name}-`));
}

function cohortRegistration(sequence, status, boundaryViolation = false) {
  const profile = "docs";
  return {
    sequence,
    workItem: `docs/issues/task-sample-${sequence}.md`,
    profiles: [profile],
    profileResults: [{
      profile,
      runId: `run-${sequence.toString(16).padStart(24, "0")}`,
      firstStatus: status,
      firstReused: false,
      repeatedStatus: status,
      repeatedReused: true,
      closureOk: true,
      boundaryViolation
    }]
  };
}

function cohortManifest(firstThresholds = {}) {
  return {
    schemaVersion: 1,
    cohortId: "l2-test",
    repository: "cyhui555/deeptrail-open",
    baseRevision: "a".repeat(40),
    targetWorkItems: 10,
    thresholds: {
      firstVerificationSuccessRate: 0.9,
      idempotentReuseSuccessRate: 1,
      closureRate: 1,
      boundaryViolationRate: 0,
      lastConsecutivePasses: 5,
      ...firstThresholds
    },
    selectionPolicy: {
      unit: "work-item",
      initialTranche: "all-active-non-coordinator-work-items-at-base-revision",
      futureRegistration: "append-on-protected-main-before-first-shadow",
      evidenceBinding: "append-after-registration-is-on-main",
      failureRetention: "never-remove-reorder-or-replace"
    },
    exclusions: [{
      workItem: "docs/issues/task-loop-003-l1-phase2-to-l2.md",
      reason: "cohort-coordinator-cannot-score-itself"
    }],
    registrations: [{
      sequence: 1,
      workItem: ["docs", "issues", "task-sample-1.md"].join("/"),
      profiles: ["docs"]
    }],
    evidence: [{
      registrationSequence: 1,
      runs: [{ profile: "docs", runId: `run-${"a".repeat(24)}` }]
    }]
  };
}
