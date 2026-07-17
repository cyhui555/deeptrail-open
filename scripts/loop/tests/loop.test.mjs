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
  publishL3Draft,
  readL3RepositoryControls,
  stagePreparedL3Change,
  validateL3ApprovalEvidence,
  verifyPublishedL3State
} from "../l3-worktree.mjs";
import { acquireWriteLock, quarantineStaleWriteLock } from "../lock.mjs";
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

test("L3 Policy 默认关闭并拒绝预算、路径和权限漂移", async () => {
  const policy = await loadL3Policy();
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
