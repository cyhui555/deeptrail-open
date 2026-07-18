import { realpath } from "node:fs/promises";
import path from "node:path";

import { canonicalJson, canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { assertDirectory, assertRegularFile, isWithin, sha256 } from "./fs-safe.mjs";
import { readGitState } from "./git-state.mjs";
import { loadL3ChangePlan, loadL3Policy } from "./l3-plan.mjs";
import {
  loadL3BMergePlan,
  loadL3BPolicy,
  normalizeL3BProtectionSnapshot,
  parseL3BApprovalUrl,
  validateL3BMergePlan,
  validateL3BPolicy
} from "./l3-merge-plan.mjs";
import { readL3RepositoryControls } from "./l3-worktree.mjs";
import { requireSuccess, runProcess } from "./process.mjs";
import { sanitizedEnvironment } from "./runtime.mjs";
import { inspectTransactions, verifyReceiptFile } from "./transactions.mjs";

const shaPattern = /^[a-f0-9]{40}$/;

export async function preflightL3BMerge(config, options = {}) {
  const policy = validateL3BPolicy(options.policy ?? await loadL3BPolicy());
  assertL3BEnabled(policy);
  const proposalRoot = await resolveProposalRoot(config);
  const loaded = await loadL3BMergePlan(options.planFile, proposalRoot, policy);
  const { plan } = loaded;

  const sourceBefore = await readGitState(config);
  assert(sourceBefore.gitStatus.length === 0
      && sourceBefore.gitBranch === policy.baseBranch
      && sourceBefore.gitCommit === plan.baseRevision,
    "L3B_SOURCE_INVALID", "L3B 只接受位于精确 main 基线的 clean 规范源工作树");
  const repositoryBefore = await readL3RepositoryControls(config.repoRoot);
  await verifyRepositoryBase(config.repoRoot, policy, plan);

  const verifyActivation = options.verifyActivation ?? defaultActivationVerifier;
  const activation = validateL3BActivationEvidence(policy, await verifyActivation(policy));
  assert(await gitSucceeds(config.repoRoot, [
    "merge-base", "--is-ancestor", policy.activation.engineMergedRevision, plan.baseRevision
  ]), "L3B_ADMISSION_REVISION_INVALID", "L3B Engine 合入 Revision 不是 MergePlan 基线祖先");
  await verifyWorkItem(config.repoRoot, plan);

  const cohortVerifier = options.verifyCohort ?? defaultCohortVerifier;
  const cohort = await cohortVerifier(config, { recovery: options.cohortRecovery });
  assert(cohort.digest === policy.activation.l2CohortDigest
      && cohort.digest === plan.cohortDigest,
    "L3B_L2_COHORT_DRIFT", "当前严格 L2 Cohort 与 activation 或 MergePlan 不一致");

  const l3a = await verifyL3AChain(config, proposalRoot, plan, options);
  const readRemoteSnapshot = options.readRemoteSnapshot ?? readGitHubPreMergeSnapshot;
  const snapshot = await readRemoteSnapshot({ policy, plan });
  const preMerge = validateL3BPreMergeFacts(policy, plan, snapshot, l3a);

  await assertSourceUnchanged(config, sourceBefore);
  await assertRepositoryControlsUnchanged(config.repoRoot, repositoryBefore);
  return {
    policy,
    plan,
    planFile: loaded.planFile,
    planDigest: loaded.planDigest,
    proposalRoot,
    activation,
    cohortDigest: cohort.digest,
    l3a,
    sourceBefore,
    repositoryBefore,
    preMerge
  };
}

export async function executeL3BMerge(config, options = {}) {
  const context = await preflightL3BMerge(config, options);
  const applied = await executePreparedL3BMerge(config, context, options);
  return { context, applied };
}

export async function executePreparedL3BMerge(config, context, options = {}) {
  const policy = validateL3BPolicy(context?.policy);
  const plan = validateL3BMergePlan(context?.plan, policy);
  assertL3BEnabled(policy);

  // 合并前必须重新读取同一组远端事实；预检缓存不能作为写入授权。
  const readRemoteSnapshot = options.readRemoteSnapshot ?? readGitHubPreMergeSnapshot;
  const immediate = validateL3BPreMergeFacts(
    policy,
    plan,
    await readRemoteSnapshot({ policy, plan }),
    context.l3a
  );
  assert(immediate.factDigest === context.preMerge.factDigest,
    "L3B_PREMERGE_RACE", "PR、Review、Checks、Base、Head 或保护规则在预检后发生变化");
  await assertSourceUnchanged(config, context.sourceBefore);
  await assertRepositoryControlsUnchanged(config.repoRoot, context.repositoryBefore);

  const recovery = {
    kind: "l3b-merge",
    remoteWriteMayHaveOccurred: true,
    context: serializableContext(context),
    immediate,
    mergeResponse: null
  };
  const mergePullRequest = options.mergePullRequest ?? defaultMergePullRequest;
  let mergeResponse;
  try {
    mergeResponse = await mergePullRequest({ policy, plan, immediate });
  } catch (error) {
    throw new LoopGatewayError(
      "L3B_MERGE_RESULT_UNKNOWN",
      "受控 merge 调用没有得到可判定结果；必须先只读恢复，禁止直接重试",
      {
        recovery,
        cause: error instanceof Error ? error.message : String(error)
      }
    );
  }
  if (mergeResponse?.merged === false) {
    throw new LoopGatewayError(
      "L3B_MERGE_REJECTED",
      `GitHub 明确拒绝合并：${mergeResponse.message ?? "unknown"}`
    );
  }
  if (mergeResponse?.merged !== true || !shaPattern.test(mergeResponse.sha ?? "")) {
    throw new LoopGatewayError(
      "L3B_MERGE_RESULT_UNKNOWN",
      "受控 merge 响应缺少明确的 merged=true 与 Commit SHA；必须先只读恢复",
      { recovery: { ...recovery, mergeResponse } }
    );
  }
  return {
    ok: true,
    merged: true,
    mergeResponse,
    recovery: { ...recovery, mergeResponse }
  };
}

export async function verifyMergedL3BState(config, context, mergeResponse, options = {}) {
  const policy = validateL3BPolicy(context?.policy);
  const plan = validateL3BMergePlan(context?.plan, policy);
  const readMergeResult = options.readMergeResult ?? readGitHubMergeResult;
  const facts = await readMergeResult({ policy, plan, preMerge: context.preMerge });
  const verification = validateL3BMergedFacts(
    policy, plan, context.preMerge, facts, mergeResponse
  );
  await assertSourceUnchanged(config, context.sourceBefore);
  await assertRepositoryControlsUnchanged(config.repoRoot, context.repositoryBefore);
  return verification;
}

export async function recoverL3BMerge(config, recovery, options = {}) {
  assert(recovery?.kind === "l3b-merge"
      && recovery.remoteWriteMayHaveOccurred === true
      && recovery.context && recovery.immediate,
    "L3B_RECOVERY_INVALID", "L3B Recovery 缺少远端不确定写入上下文");
  const context = recovery.context;
  const policy = validateL3BPolicy(context.policy);
  const plan = validateL3BMergePlan(context.plan, policy);
  const readMergeResult = options.readMergeResult ?? readGitHubMergeResult;
  const facts = await readMergeResult({ policy, plan, preMerge: recovery.immediate });

  if (facts.pullRequest.merged === true) {
    const verification = validateL3BMergedFacts(
      policy, plan, recovery.immediate, facts, recovery.mergeResponse
    );
    await assertSourceUnchanged(config, context.sourceBefore);
    await assertRepositoryControlsUnchanged(config.repoRoot, context.repositoryBefore);
    return { ...verification, recoveryDisposition: "merged" };
  }

  const safelyNotMerged = facts.pullRequest.state === "open"
    && facts.pullRequest.merged === false
    && facts.pullRequest.headRevision === plan.pullRequest.headRevision
    && facts.pullRequest.baseBranch === plan.baseBranch
    && facts.mainRevision === plan.baseRevision
    && facts.mergeCommit === null
    && facts.deployments.length === 0;
  assert(safelyNotMerged, "L3B_RECOVERY_INCONSISTENT",
    "只读恢复发现 PR、main、merge commit 或部署状态不一致，必须人工审计");
  await assertSourceUnchanged(config, context.sourceBefore);
  await assertRepositoryControlsUnchanged(config.repoRoot, context.repositoryBefore);
  return {
    ok: true,
    recoveryDisposition: "not-merged",
    pullRequest: plan.pullRequest.number,
    headRevision: plan.pullRequest.headRevision,
    mainRevision: facts.mainRevision,
    retryAllowedAfterNewPreflight: true,
    autoDeploy: false
  };
}

export function validateL3BActivationEvidence(policy, evidence) {
  validateL3BPolicy(policy);
  const binding = parseL3BApprovalUrl(policy.activation.approvalUrl);
  assert(policy.activation.enabled === true && evidence
      && evidence.approvalUrl === policy.activation.approvalUrl
      && evidence.pullRequest === binding.pullRequest
      && evidence.reviewId === binding.reviewId
      && evidence.author === policy.activation.humanApprover
      && evidence.state === "APPROVED"
      && evidence.reviewedRevision === policy.activation.engineApprovedRevision
      && evidence.headRevision === policy.activation.engineApprovedRevision
      && evidence.mergedRevision === policy.activation.engineMergedRevision
      && evidence.merged === true
      && evidence.baseBranch === policy.baseBranch
      && evidence.pullRequestAuthor === "github-actions[bot]",
    "L3B_APPROVAL_EVIDENCE_INVALID",
    "L3B activation 未绑定机器人 Engine PR 的最终 Head、main 合入 Revision 与人工批准");
  return evidence;
}

export function validateL3BPreMergeFacts(policy, plan, snapshot, l3a) {
  validateL3BPolicy(policy);
  validateL3BMergePlan(plan, policy);
  const pr = snapshot?.pullRequest;
  assert(pr && snapshot.repository === policy.repository,
    "L3B_REMOTE_FACTS_INVALID", "远端 PR 事实缺失或仓库不一致");
  assert(pr.number === plan.pullRequest.number
      && pr.url === plan.pullRequest.url
      && pr.state === "open"
      && pr.draft === false
      && pr.merged === false
      && pr.mergeable === true
      && pr.mergeableState === "clean"
      && pr.autoMerge === null
      && pr.author === plan.pullRequest.author
      && pr.headRepository === policy.repository
      && pr.baseRepository === policy.repository
      && pr.headBranch === plan.pullRequest.headBranch
      && pr.headRevision === plan.pullRequest.headRevision
      && pr.baseBranch === plan.baseBranch
      && pr.baseRevision === plan.baseRevision
      && pr.commitCount === plan.pullRequest.commitCount
      && pr.changedFiles === plan.pullRequest.changedPaths.length,
    "L3B_PR_DRIFT", "PR Ready、作者、Base、Head、Commit 数或合并状态与 MergePlan 不一致");
  assert(snapshot.mainRevision === plan.baseRevision,
    "L3B_BASE_DRIFT", "远端 main 已不等于 MergePlan baseRevision");
  assert(Array.isArray(snapshot.commits) && snapshot.commits.length === 1
      && snapshot.commits[0].sha === plan.pullRequest.headRevision
      && snapshot.headCommit?.sha === plan.pullRequest.headRevision
      && snapshot.headCommit.parents.length === 1
      && snapshot.headCommit.parents[0] === plan.baseRevision
      && snapshot.commits[0].tree === snapshot.headCommit.tree,
    "L3B_COMMIT_DRIFT", "PR 必须只有一个以精确 Base 为父提交的 L3A Commit");
  assert(canonicalJson(snapshot.files) === canonicalJson(plan.pullRequest.changedPaths)
      && canonicalJson(l3a.changedPaths) === canonicalJson(plan.pullRequest.changedPaths)
      && l3a.commit === plan.pullRequest.headRevision,
    "L3B_PATH_DRIFT", "PR 文件集合与 L3A Receipt/ChangePlan 不一致");
  assert(Array.isArray(snapshot.deployments) && snapshot.deployments.length === 0,
    "L3B_DEPLOYMENT_DETECTED", "L3B PR Head 不允许存在部署");
  assert(snapshot.protection?.digest === plan.protectionDigest
      && snapshot.protection.digest === policy.activation.protectionDigest,
    "L3B_PROTECTION_DRIFT", "当前保护规则摘要与 activation 或 MergePlan 不一致");

  const approval = validatePlanReview(plan, snapshot.reviews, pr.author);
  const checks = validatePlanChecks(plan, snapshot.checkRuns);
  const facts = {
    pullRequest: pr.number,
    baseRevision: plan.baseRevision,
    headBranch: pr.headBranch,
    headRevision: pr.headRevision,
    headTree: snapshot.headCommit.tree,
    commitCount: pr.commitCount,
    changedPaths: snapshot.files,
    approval,
    checks,
    protectionDigest: snapshot.protection.digest,
    deployments: 0
  };
  return { ...facts, factDigest: canonicalSha256(facts) };
}

export function validateL3BMergedFacts(policy, plan, preMerge, facts, mergeResponse = null) {
  validateL3BPolicy(policy);
  validateL3BMergePlan(plan, policy);
  const pr = facts?.pullRequest;
  assert(pr && pr.number === plan.pullRequest.number
      && pr.state === "closed"
      && pr.merged === true
      && pr.draft === false
      && pr.headRevision === plan.pullRequest.headRevision
      && pr.headBranch === plan.pullRequest.headBranch
      && pr.baseBranch === plan.baseBranch
      && pr.mergedBy === policy.activation.humanApprover
      && shaPattern.test(pr.mergeCommitSha ?? ""),
    "L3B_POSTMERGE_PR_INVALID", "合并后 PR 状态、Head、Base、Actor 或 merge commit 不一致");
  assert(facts.mainRevision === pr.mergeCommitSha,
    "L3B_POSTMERGE_MAIN_DRIFT", "合并后 main 未精确指向 PR merge commit");
  const commit = facts.mergeCommit;
  assert(commit?.sha === pr.mergeCommitSha
      && commit.parents.length === 1
      && commit.parents[0] === plan.baseRevision
      && commit.tree === preMerge.headTree
      && commit.message.split(/\r?\n/, 1)[0] === plan.merge.commitTitle
      && commit.message.includes(plan.merge.commitMessage),
    "L3B_POSTMERGE_COMMIT_INVALID", "squash commit 的父提交、Tree 或审计消息不一致");
  if (mergeResponse) {
    assert(mergeResponse.merged === true && mergeResponse.sha === pr.mergeCommitSha,
      "L3B_POSTMERGE_RESPONSE_DRIFT", "merge API 响应与远端最终状态不一致");
  }
  assert(Array.isArray(facts.deployments) && facts.deployments.length === 0,
    "L3B_DEPLOYMENT_DETECTED", "L3B merge 不得产生部署");
  return {
    ok: true,
    merged: true,
    pullRequest: pr.number,
    headRevision: pr.headRevision,
    mergeCommit: pr.mergeCommitSha,
    mainRevision: facts.mainRevision,
    parentRevision: commit.parents[0],
    tree: commit.tree,
    protectionDigest: preMerge.protectionDigest,
    autoApprove: false,
    adminMerge: false,
    forcePush: false,
    autoDeploy: false
  };
}

export async function readGitHubPreMergeSnapshot({ policy, plan }) {
  const number = plan.pullRequest.number;
  const head = plan.pullRequest.headRevision;
  // gh 每次调用都会建立独立 TLS 连接；顺序全量读取可避免连接风暴，任一失败都丢弃整轮快照。
  const pullRequest = await ghApiJson(
    `repos/${policy.repository}/pulls/${number}`, "读取 L3B Pull Request"
  );
  const commits = await ghApiPages(
    `repos/${policy.repository}/pulls/${number}/commits?per_page=100`, "读取 L3B PR Commits"
  );
  const files = await ghApiPages(
    `repos/${policy.repository}/pulls/${number}/files?per_page=100`, "读取 L3B PR Files"
  );
  const reviews = await ghApiPages(
    `repos/${policy.repository}/pulls/${number}/reviews?per_page=100`, "读取 L3B PR Reviews"
  );
  const checkPages = await ghApiObjectPages(
    `repos/${policy.repository}/commits/${head}/check-runs?per_page=100`,
    "check_runs", "读取 L3B Check Runs"
  );
  const branch = await ghApiJson(
    `repos/${policy.repository}/branches/${policy.baseBranch}/protection`, "读取 main 分支保护"
  );
  const repository = await ghApiJson(`repos/${policy.repository}`, "读取仓库合并设置");
  const mainRef = await ghApiJson(
    `repos/${policy.repository}/git/ref/heads/${policy.baseBranch}`, "读取远端 main Revision"
  );
  const headCommit = await ghApiJson(
    `repos/${policy.repository}/git/commits/${head}`, "读取 PR Head Commit"
  );
  const deployments = await ghApiPages(
    `repos/${policy.repository}/deployments?sha=${head}&per_page=100`,
    "读取 PR Head Deployments"
  );
  const protection = normalizeL3BProtectionSnapshot({ branch, repository }, policy);
  return {
    repository: policy.repository,
    pullRequest: normalizePullRequest(pullRequest),
    mainRevision: mainRef.object?.sha,
    commits: commits.map((item) => ({ sha: item.sha, tree: item.commit?.tree?.sha })),
    files: files.map((item) => item.filename).sort(),
    reviews: reviews.map(normalizeReview),
    checkRuns: checkPages.map(normalizeCheckRun),
    headCommit: {
      sha: headCommit.sha,
      tree: headCommit.tree?.sha,
      parents: (headCommit.parents ?? []).map((item) => item.sha)
    },
    protection,
    deployments: deployments.map(normalizeDeployment),
    readAt: new Date().toISOString()
  };
}

export async function readGitHubMergeResult({ policy, plan }) {
  const pullRequestRaw = await ghApiJson(
    `repos/${policy.repository}/pulls/${plan.pullRequest.number}`,
    "读取 L3B 合并后 Pull Request"
  );
  const pullRequest = normalizePullRequest(pullRequestRaw);
  const mainRef = await ghApiJson(
    `repos/${policy.repository}/git/ref/heads/${policy.baseBranch}`, "读取合并后 main Revision"
  );
  const mergeCommit = pullRequest.mergeCommitSha
    ? await ghApiJson(
      `repos/${policy.repository}/git/commits/${pullRequest.mergeCommitSha}`,
      "读取 squash merge commit"
    )
    : null;
  const deployments = pullRequest.mergeCommitSha
    ? await ghApiPages(
      `repos/${policy.repository}/deployments?sha=${pullRequest.mergeCommitSha}&per_page=100`,
      "读取 merge commit Deployments"
    )
    : [];
  return {
    pullRequest,
    mainRevision: mainRef.object?.sha,
    mergeCommit: mergeCommit ? {
      sha: mergeCommit.sha,
      tree: mergeCommit.tree?.sha,
      parents: (mergeCommit.parents ?? []).map((item) => item.sha),
      message: mergeCommit.message
    } : null,
    deployments: deployments.map(normalizeDeployment),
    readAt: new Date().toISOString()
  };
}

async function verifyL3AChain(config, proposalRoot, plan, options) {
  const receiptCandidate = path.join(config.receiptRoot, `${plan.l3a.transactionId}.json`);
  const receiptFile = await assertRegularFile(receiptCandidate, "L3A Receipt");
  assert(isWithin(await realpath(config.receiptRoot), receiptFile),
    "L3B_L3A_RECEIPT_ESCAPE", "L3A Receipt 逃逸 Receipt Root");
  const receipt = await verifyReceiptFile(receiptFile);
  assert(receipt.integritySha256 === plan.l3a.receiptSha256
      && receipt.receiptId === plan.l3a.transactionId
      && receipt.transactionId === plan.l3a.transactionId
      && receipt.operation === "l3:run-draft"
      && receipt.outcome === "passed",
    "L3B_L3A_RECEIPT_INVALID", "L3A Receipt 身份、完整性或结果不符合 MergePlan");
  const transactions = await inspectTransactions(config);
  const transaction = transactions.find((item) => item.id === plan.l3a.transactionId);
  assert(transaction?.latest.status === "closed"
      && transaction.latest.operation === "l3:run-draft"
      && transaction.latest.details?.receiptSha256 === plan.l3a.receiptSha256,
    "L3B_L3A_TRANSACTION_INVALID", "L3A Transaction 未闭环或未绑定目标 Receipt");

  const l3Policy = options.l3Policy ?? await loadL3Policy();
  const change = await loadL3ChangePlan(plan.l3a.changePlanFile, proposalRoot, l3Policy);
  const planDigest = canonicalSha256(change.plan);
  const patchDigest = sha256(change.patch);
  const result = receipt.result;
  assert(planDigest === plan.l3a.planDigest && planDigest === result?.planDigest
      && patchDigest === plan.l3a.patchDigest && patchDigest === result?.patchDigest
      && change.plan.baseRevision === plan.baseRevision
      && change.plan.workItemId === plan.workItemId
      && change.plan.pullRequest.targetBranch === plan.pullRequest.headBranch
      && change.plan.patch.changedPaths.length === plan.pullRequest.changedPaths.length
      && canonicalJson(change.plan.patch.changedPaths)
        === canonicalJson(plan.pullRequest.changedPaths)
      && result?.commit === plan.l3a.commit
      && result?.cohortDigest === plan.cohortDigest
      && result?.pullRequest?.url === plan.pullRequest.url
      && result?.pullRequest?.author === plan.pullRequest.author
      && result?.pullRequest?.head === plan.pullRequest.headBranch
      && result?.pullRequest?.base === plan.baseBranch
      && result?.pullRequest?.commit === plan.pullRequest.headRevision
      && result?.pullRequest?.draft === true
      && result?.autoApprove === false
      && result?.autoMerge === false
      && result?.autoDeploy === false
      && canonicalJson(result?.diff?.changedPaths)
        === canonicalJson(plan.pullRequest.changedPaths)
      && receipt.verification?.commit === plan.pullRequest.headRevision,
    "L3B_L3A_CHAIN_INVALID",
    "L3A ChangePlan、Patch、Receipt、Commit 与机器人 Draft PR 引用链不一致");
  return {
    transactionId: plan.l3a.transactionId,
    receiptSha256: plan.l3a.receiptSha256,
    planDigest,
    patchDigest,
    commit: plan.l3a.commit,
    changedPaths: [...change.plan.patch.changedPaths],
    pullRequest: plan.pullRequest.number
  };
}

function validatePlanReview(plan, reviews, pullRequestAuthor) {
  assert(Array.isArray(reviews), "L3B_REVIEW_INVALID", "远端 Review 列表缺失");
  const decisive = reviews.filter((item) => ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]
    .includes(item.state));
  const latestByAuthor = new Map();
  for (const review of decisive.sort(compareReview)) latestByAuthor.set(review.author, review);
  assert(![...latestByAuthor.values()].some((item) => item.state === "CHANGES_REQUESTED"),
    "L3B_REVIEW_REJECTED", "存在仍有效的 CHANGES_REQUESTED Review");
  const approval = reviews.find((item) => item.id === plan.humanApproval.reviewId);
  const latest = latestByAuthor.get(plan.humanApproval.reviewer);
  assert(approval
      && latest?.id === approval.id
      && approval.state === "APPROVED"
      && approval.author === plan.humanApproval.reviewer
      && approval.author !== pullRequestAuthor
      && approval.commitId === plan.humanApproval.reviewedRevision
      && approval.commitId === plan.pullRequest.headRevision
      && approval.url === plan.humanApproval.reviewUrl
      && approval.submittedAt === plan.humanApproval.submittedAt,
    "L3B_REVIEW_INVALID", "人工批准缺失、过期、被驳回或未绑定精确 Head");
  return {
    reviewer: approval.author,
    reviewId: approval.id,
    reviewUrl: approval.url,
    reviewedRevision: approval.commitId,
    submittedAt: approval.submittedAt
  };
}

function validatePlanChecks(plan, checkRuns) {
  assert(Array.isArray(checkRuns), "L3B_CHECK_INVALID", "远端 Check Runs 缺失");
  return plan.checks.map((expected) => {
    const matching = checkRuns.filter((item) => item.name === expected.name
      && item.appId === expected.appId
      && item.headRevision === plan.pullRequest.headRevision)
      .sort((left, right) => right.id - left.id);
    const latest = matching[0];
    assert(latest
        && latest.id === expected.checkRunId
        && latest.status === "completed"
        && latest.conclusion === "success"
        && latest.completedAt === expected.completedAt
        && latest.detailsUrl === expected.detailsUrl,
      "L3B_CHECK_INVALID",
      `Required Check 缺失、非最新或未成功：${expected.name}`);
    return {
      name: latest.name,
      appId: latest.appId,
      checkRunId: latest.id,
      headRevision: latest.headRevision,
      completedAt: latest.completedAt,
      detailsUrl: latest.detailsUrl,
      conclusion: latest.conclusion
    };
  });
}

async function defaultActivationVerifier(policy) {
  const binding = parseL3BApprovalUrl(policy.activation.approvalUrl);
  const review = await ghApiJson(
    `repos/${policy.repository}/pulls/${binding.pullRequest}/reviews/${binding.reviewId}`,
    "读取 L3B Engine 人工批准 Review"
  );
  const pullRequest = await ghApiJson(
    `repos/${policy.repository}/pulls/${binding.pullRequest}`, "读取 L3B Engine Pull Request"
  );
  return {
    approvalUrl: policy.activation.approvalUrl,
    pullRequest: pullRequest.number,
    reviewId: review.id,
    author: review.user?.login,
    state: review.state,
    reviewedRevision: review.commit_id,
    headRevision: pullRequest.head?.sha,
    mergedRevision: pullRequest.merge_commit_sha,
    merged: pullRequest.merged_at !== null,
    baseBranch: pullRequest.base?.ref,
    pullRequestAuthor: normalizeActor(pullRequest.user?.login)
  };
}

async function defaultCohortVerifier(config, options = {}) {
  // 动态导入避免 operations -> L3B -> Cohort -> operations 的初始化环。
  const {
    cohortAdmissionDigest,
    loadL2CohortManifest,
    verifyRuntimeCohort
  } = await import("./l2-cohort.mjs");
  const report = await verifyRuntimeCohort(config, await loadL2CohortManifest(), options);
  return { report, digest: cohortAdmissionDigest(report) };
}

async function defaultMergePullRequest({ policy, plan }) {
  const result = await runProcess("gh", [
    "api", "--method", "PUT", `repos/${policy.repository}/pulls/${plan.pullRequest.number}/merge`,
    "-f", `sha=${plan.merge.expectedHeadSha}`,
    "-f", `merge_method=${plan.merge.method}`,
    "-f", `commit_title=${plan.merge.commitTitle}`,
    "-f", `commit_message=${plan.merge.commitMessage}`
  ], {
    env: githubEnvironment(),
    timeoutMs: 30_000,
    outputLimit: 1024 * 1024
  });
  if (result.code !== 0) {
    throw new LoopGatewayError("L3B_MERGE_CALL_FAILED", "GitHub merge API 调用失败", {
      stderr: result.stderr.trim().slice(0, 4096),
      stdout: result.stdout.trim().slice(0, 4096)
    });
  }
  return parseJson(result.stdout, "L3B merge API");
}

async function resolveProposalRoot(config) {
  const candidate = path.join(config.loopHome, "proposals");
  return await assertDirectory(candidate, "L3B Proposal Root");
}

async function verifyRepositoryBase(repoRoot, policy, plan) {
  const remote = (await git(repoRoot, ["config", "--get", "remote.origin.url"],
    "读取 origin")).trim();
  assert(normalizeGitHubRepository(remote) === policy.repository,
    "L3B_REMOTE_MISMATCH", `origin 不是 ${policy.repository}`);
  const localBase = (await git(repoRoot, [
    "rev-parse", `refs/remotes/origin/${policy.baseBranch}`
  ], "读取本地 origin/main")).trim();
  const remoteLine = (await git(repoRoot, [
    "ls-remote", "origin", `refs/heads/${policy.baseBranch}`
  ], "读取远端 main")).trim();
  const remoteBase = remoteLine.split(/\s+/, 1)[0];
  assert(localBase === plan.baseRevision && remoteBase === plan.baseRevision,
    "L3B_BASE_DRIFT", "MergePlan baseRevision 不等于本地与远端 origin/main");
}

async function verifyWorkItem(repoRoot, plan) {
  const workItem = await git(repoRoot, ["show", `${plan.baseRevision}:${plan.workItem}`],
    "读取 L3B Work Item");
  assert(new RegExp(`^#\\s+${escapeRegExp(plan.workItemId)}\\b`, "m").test(workItem),
    "L3B_WORK_ITEM_REVISION_MISMATCH", "基线 Work Item 标题 ID 与 MergePlan 不一致");
}

async function assertSourceUnchanged(config, expected) {
  const actual = await readGitState(config);
  assert(actual.gitCommit === expected.gitCommit
      && actual.gitTree === expected.gitTree
      && actual.gitBranch === expected.gitBranch
      && actual.gitStatus === expected.gitStatus,
    "L3B_SOURCE_CHANGED", "L3B 远端合并修改了规范源工作树");
}

async function assertRepositoryControlsUnchanged(repoRoot, expected) {
  const actual = await readL3RepositoryControls(repoRoot);
  assert(canonicalSha256(actual) === canonicalSha256(expected),
    "L3B_REPOSITORY_CONTROL_CHANGED", "L3B 执行期间共享 Git 控制面发生变化");
}

async function ghApiJson(endpoint, label) {
  const result = requireSuccess(await runProcess("gh", ["api", endpoint], {
    env: githubEnvironment(),
    timeoutMs: 30_000,
    outputLimit: 4 * 1024 * 1024
  }), label);
  return parseJson(result.stdout, label);
}

async function ghApiPages(endpoint, label) {
  const result = requireSuccess(await runProcess("gh", [
    "api", "--paginate", "--slurp", endpoint
  ], {
    env: githubEnvironment(),
    timeoutMs: 30_000,
    outputLimit: 4 * 1024 * 1024
  }), label);
  const pages = parseJson(result.stdout, label);
  assert(Array.isArray(pages) && pages.every(Array.isArray),
    "L3B_GITHUB_RESPONSE_INVALID", `${label} 分页响应不合法`);
  return pages.flat();
}

async function ghApiObjectPages(endpoint, field, label) {
  const result = requireSuccess(await runProcess("gh", [
    "api", "--paginate", "--slurp", endpoint
  ], {
    env: githubEnvironment(),
    timeoutMs: 30_000,
    outputLimit: 4 * 1024 * 1024
  }), label);
  const pages = parseJson(result.stdout, label);
  assert(Array.isArray(pages) && pages.every((page) => Array.isArray(page?.[field])),
    "L3B_GITHUB_RESPONSE_INVALID", `${label} 分页响应不合法`);
  return pages.flatMap((page) => page[field]);
}

function normalizePullRequest(item) {
  return {
    number: item.number,
    url: item.html_url,
    state: item.state,
    draft: item.draft,
    merged: item.merged,
    mergeable: item.mergeable,
    mergeableState: item.mergeable_state,
    autoMerge: item.auto_merge,
    author: normalizeActor(item.user?.login),
    headRepository: item.head?.repo?.full_name,
    headBranch: item.head?.ref,
    headRevision: item.head?.sha,
    baseRepository: item.base?.repo?.full_name,
    baseBranch: item.base?.ref,
    baseRevision: item.base?.sha,
    commitCount: item.commits,
    changedFiles: item.changed_files,
    mergeCommitSha: item.merge_commit_sha,
    mergedBy: item.merged_by?.login ?? null
  };
}

function normalizeReview(item) {
  return {
    id: item.id,
    author: item.user?.login,
    state: item.state,
    commitId: item.commit_id,
    submittedAt: item.submitted_at,
    url: item.html_url
  };
}

function normalizeCheckRun(item) {
  return {
    id: item.id,
    name: item.name,
    appId: item.app?.id,
    headRevision: item.head_sha,
    status: item.status,
    conclusion: item.conclusion,
    startedAt: item.started_at,
    completedAt: item.completed_at,
    detailsUrl: item.details_url
  };
}

function normalizeDeployment(item) {
  return {
    id: item.id,
    ref: item.ref,
    sha: item.sha,
    environment: item.environment
  };
}

function serializableContext(context) {
  return {
    policy: context.policy,
    plan: context.plan,
    planFile: context.planFile,
    planDigest: context.planDigest,
    activation: context.activation,
    cohortDigest: context.cohortDigest,
    l3a: context.l3a,
    sourceBefore: context.sourceBefore,
    repositoryBefore: context.repositoryBefore,
    preMerge: context.preMerge
  };
}

function assertL3BEnabled(policy) {
  assert(policy.stage === "l3b-controlled-merge"
      && policy.activation.enabled === true
      && policy.permissions.markReady === false
      && policy.permissions.submitReview === false
      && policy.permissions.controlledSquashMerge === true
      && policy.permissions.autoApprove === false
      && policy.permissions.adminMerge === false
      && policy.permissions.forcePush === false
      && policy.permissions.deleteRemoteBranch === false
      && policy.permissions.autoDeploy === false,
    "L3B_MERGE_DISABLED", "L3B 受控合并尚未由独立 activation 启用");
}

function compareReview(left, right) {
  const byTime = String(left.submittedAt ?? "").localeCompare(String(right.submittedAt ?? ""));
  return byTime !== 0 ? byTime : left.id - right.id;
}

function normalizeActor(login) {
  return login === "app/github-actions" ? "github-actions[bot]" : login;
}

function githubEnvironment() {
  return sanitizedEnvironment({
    NO_COLOR: "1",
    GH_PROMPT_DISABLED: "1",
    GIT_TERMINAL_PROMPT: "0"
  });
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new LoopGatewayError(
      "L3B_GITHUB_RESPONSE_INVALID", `${label} 不是合法 JSON：${error.message}`
    );
  }
}

async function git(cwd, args, label) {
  return requireSuccess(await runProcess("git", args, {
    cwd,
    timeoutMs: 30_000,
    outputLimit: 4 * 1024 * 1024
  }), label).stdout;
}

async function gitSucceeds(cwd, args) {
  return (await runProcess("git", args, { cwd, timeoutMs: 30_000 })).code === 0;
}

function normalizeGitHubRepository(remote) {
  return remote.trim()
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/^ssh:\/\/git@github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assert(condition, code, message) {
  if (!condition) throw new LoopGatewayError(code, message);
}
