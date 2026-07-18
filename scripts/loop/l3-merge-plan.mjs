import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { isWithin } from "./fs-safe.mjs";

const moduleRoot = path.dirname(fileURLToPath(import.meta.url));
const policyFile = path.join(moduleRoot, "l3b-policy.json");

export const L3B_REQUIRED_CHECKS = Object.freeze([
  Object.freeze({ name: "Backend E2E", appId: 15368 }),
  Object.freeze({ name: "Backend quality", appId: 15368 }),
  Object.freeze({ name: "Frontend quality and Eval", appId: 15368 }),
  Object.freeze({ name: "Frontend smoke", appId: 15368 }),
  Object.freeze({ name: "Governance and Loop quality", appId: 15368 })
]);

export const L3B_PROTECTION_CONTRACT = Object.freeze({
  requiredStatusChecks: Object.freeze({ strict: true }),
  requiredPullRequestReviews: Object.freeze({
    dismissStaleReviews: true,
    requireLastPushApproval: true,
    requiredApprovingReviewCount: 1,
    requireCodeOwnerReviews: false
  }),
  enforceAdmins: true,
  requiredLinearHistory: true,
  requiredConversationResolution: true,
  allowForcePushes: false,
  allowDeletions: false,
  repositoryMergeSettings: Object.freeze({
    allowSquashMerge: true,
    allowAutoMerge: false,
    deleteBranchOnMerge: false
  })
});

const disabledPermissions = Object.freeze({
  markReady: false,
  submitReview: false,
  controlledSquashMerge: false,
  autoApprove: false,
  adminMerge: false,
  forcePush: false,
  deleteRemoteBranch: false,
  autoDeploy: false
});

const enabledPermissions = Object.freeze({
  ...disabledPermissions,
  controlledSquashMerge: true
});

const fixedFailurePolicy = Object.freeze({
  preservePullRequest: true,
  retryMergeWithoutReadback: false,
  closePullRequest: false,
  deleteRemoteBranch: false
});

const workItemPattern = /^docs\/issues\/(?:task|bug|spike)-[a-z0-9-]+\.md$/;
const branchPattern = /^[a-z0-9][a-z0-9._/-]{2,99}$/;
const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const transactionPattern = /^[0-9]{14}-[a-f0-9-]{36}$/;

export async function loadL3BPolicy(file = policyFile) {
  try {
    return validateL3BPolicy(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (error instanceof LoopGatewayError) throw error;
    throw new LoopGatewayError("L3B_POLICY_INVALID", `L3B Policy JSON 无效：${error.message}`);
  }
}

export function validateL3BPolicy(policy) {
  assertObject(policy, "L3B_POLICY_INVALID", "L3B Policy 必须是 JSON Object");
  assertExactKeys(policy, [
    "schemaVersion", "stage", "repository", "baseBranch", "targetBranchPrefix",
    "mergeMethod", "activation", "requiredChecks", "protectionContract",
    "permissions", "failurePolicy"
  ], "L3B_POLICY_UNKNOWN_FIELD", "L3B Policy");
  assert(policy.schemaVersion === 1, "L3B_POLICY_INVALID", "仅支持 L3B Policy Schema 1");
  assert(policy.repository === "cyhui555/deeptrail-open"
      && policy.baseBranch === "main"
      && policy.targetBranchPrefix === "automation/l3/"
      && policy.mergeMethod === "squash",
    "L3B_POLICY_SCOPE_DRIFT", "L3B 仓库、主干、分支前缀或合并方法发生漂移");
  assert(canonicalJson(policy.requiredChecks) === canonicalJson(L3B_REQUIRED_CHECKS),
    "L3B_POLICY_CHECK_DRIFT", "L3B Required Checks 合同发生漂移");
  assert(canonicalJson(policy.protectionContract) === canonicalJson(L3B_PROTECTION_CONTRACT),
    "L3B_POLICY_PROTECTION_DRIFT", "L3B 分支保护合同发生漂移");
  assert(canonicalJson(policy.failurePolicy) === canonicalJson(fixedFailurePolicy),
    "L3B_POLICY_FAILURE_DRIFT", "L3B 失败保全策略发生漂移");

  assertObject(policy.activation, "L3B_POLICY_INVALID", "L3B activation 缺失");
  assertExactKeys(policy.activation, [
    "enabled", "engineApprovedRevision", "engineMergedRevision", "l2CohortDigest",
    "humanApprover", "approvalUrl", "protectionDigest"
  ], "L3B_POLICY_UNKNOWN_FIELD", "L3B activation");

  if (policy.stage === "l3b-disabled") {
    assert(policy.activation.enabled === false
        && policy.activation.engineApprovedRevision === null
        && policy.activation.engineMergedRevision === null
        && policy.activation.l2CohortDigest === null
        && policy.activation.humanApprover === null
        && policy.activation.approvalUrl === null
        && policy.activation.protectionDigest === null
        && canonicalJson(policy.permissions) === canonicalJson(disabledPermissions),
      "L3B_POLICY_PREMATURE_ENABLE", "L3B Engine 阶段必须关闭全部合并权限");
  } else if (policy.stage === "l3b-controlled-merge") {
    assert(policy.activation.enabled === true
        && shaPattern.test(policy.activation.engineApprovedRevision ?? "")
        && shaPattern.test(policy.activation.engineMergedRevision ?? "")
        && digestPattern.test(policy.activation.l2CohortDigest ?? "")
        && policy.activation.humanApprover === "cyhui555"
        && isApprovalUrl(policy.activation.approvalUrl)
        && digestPattern.test(policy.activation.protectionDigest ?? "")
        && canonicalJson(policy.permissions) === canonicalJson(enabledPermissions),
      "L3B_POLICY_ADMISSION_INVALID",
      "L3B activation 缺少 Engine Revision、Cohort、保护摘要或人工批准");
  } else {
    throw new LoopGatewayError("L3B_POLICY_STAGE_INVALID", `未知 L3B Stage：${policy.stage}`);
  }
  return policy;
}

export function validateL3BMergePlan(plan, policy) {
  validateL3BPolicy(policy);
  assertObject(plan, "L3B_PLAN_INVALID", "L3B MergePlan 必须是 JSON Object");
  assertExactKeys(plan, [
    "schemaVersion", "mergeId", "workItemId", "repository", "baseBranch",
    "baseRevision", "workItem", "l3a", "pullRequest", "checks", "humanApproval",
    "cohortDigest", "protectionDigest", "merge"
  ], "L3B_PLAN_UNKNOWN_FIELD", "L3B MergePlan");
  assert(plan.schemaVersion === 1, "L3B_PLAN_INVALID", "仅支持 L3B MergePlan Schema 1");
  assert(/^[a-z0-9][a-z0-9-]{7,79}$/.test(plan.mergeId ?? ""),
    "L3B_PLAN_INVALID", "mergeId 不合法");
  assert(/^(?:TASK|BUG|SPIKE)-[A-Z0-9-]+-\d+$/.test(plan.workItemId ?? ""),
    "L3B_PLAN_INVALID", "workItemId 不合法");
  assert(plan.repository === policy.repository && plan.baseBranch === policy.baseBranch,
    "L3B_PLAN_SCOPE_MISMATCH", "MergePlan 仓库或基线分支不一致");
  assert(shaPattern.test(plan.baseRevision ?? ""),
    "L3B_PLAN_INVALID", "baseRevision 必须是完整 Git Commit");
  assert(workItemPattern.test(plan.workItem ?? "")
      && path.basename(plan.workItem).startsWith(`${plan.workItemId.toLowerCase()}-`),
    "L3B_PLAN_WORK_ITEM_INVALID", "MergePlan Work Item 与 ID 不一致");

  validateL3AReference(plan.l3a);
  const pullRequest = validatePullRequestBinding(plan.pullRequest, policy, plan);
  const checks = validateCheckEvidence(plan.checks, policy, pullRequest.headRevision);
  const humanApproval = validateHumanApproval(plan.humanApproval, policy, pullRequest);

  assert(digestPattern.test(plan.cohortDigest ?? "")
      && digestPattern.test(plan.protectionDigest ?? ""),
    "L3B_PLAN_EVIDENCE_INVALID", "Cohort 或保护规则摘要不合法");
  if (policy.activation.enabled) {
    assert(plan.cohortDigest === policy.activation.l2CohortDigest
        && plan.protectionDigest === policy.activation.protectionDigest,
      "L3B_PLAN_ACTIVATION_MISMATCH", "MergePlan 未绑定当前 activation 的 Cohort 与保护摘要");
  }

  assertObject(plan.merge, "L3B_PLAN_MERGE_INVALID", "MergePlan.merge 缺失");
  assertExactKeys(plan.merge, [
    "method", "expectedHeadSha", "commitTitle", "commitMessage",
    "admin", "auto", "deleteBranch", "deploy"
  ], "L3B_PLAN_UNKNOWN_FIELD", "MergePlan.merge");
  assert(plan.merge.method === policy.mergeMethod
      && plan.merge.expectedHeadSha === pullRequest.headRevision
      && plan.merge.admin === false
      && plan.merge.auto === false
      && plan.merge.deleteBranch === false
      && plan.merge.deploy === false,
    "L3B_PLAN_MERGE_INVALID", "MergePlan 只允许 expected-Head 的非管理员即时 squash merge");
  assert(typeof plan.merge.commitTitle === "string"
      && plan.merge.commitTitle.length >= 10 && plan.merge.commitTitle.length <= 120
      && !/[\r\n]/.test(plan.merge.commitTitle)
      && plan.merge.commitTitle.includes(plan.workItemId)
      && plan.merge.commitTitle.includes(`(#${pullRequest.number})`),
    "L3B_PLAN_COMMIT_INVALID", "Merge Commit 标题必须绑定 Work Item 与 PR");
  assert(typeof plan.merge.commitMessage === "string"
      && plan.merge.commitMessage.length >= 20 && plan.merge.commitMessage.length <= 1000
      && !/[\r\n]/.test(plan.merge.commitMessage),
    "L3B_PLAN_COMMIT_INVALID", "Merge Commit 正文必须是 20—1000 字符的单行文本");
  assert(plan.l3a.commit === pullRequest.headRevision,
    "L3B_PLAN_L3A_MISMATCH", "L3A Commit 与 PR Head 不一致");

  return {
    ...plan,
    pullRequest,
    checks,
    humanApproval,
    merge: { ...plan.merge }
  };
}

export async function loadL3BMergePlan(planFile, proposalRoot, policy) {
  const root = await realpath(proposalRoot).catch(() => null);
  assert(root, "L3B_PROPOSAL_ROOT_MISSING", `Proposal Root 不存在：${proposalRoot}`);
  assert(typeof planFile === "string" && planFile.length > 0,
    "L3B_PLAN_REQUIRED", "L3B 命令必须显式提供 --plan");
  const requested = path.isAbsolute(planFile) ? planFile : path.join(root, planFile);
  const resolved = await assertFileInside(root, requested, "L3B MergePlan");
  let parsed;
  try {
    parsed = JSON.parse(await readFile(resolved, "utf8"));
  } catch (error) {
    throw new LoopGatewayError("L3B_PLAN_INVALID", `L3B MergePlan JSON 无效：${error.message}`);
  }
  const plan = validateL3BMergePlan(parsed, policy);
  return { plan, planFile: resolved, planDigest: canonicalSha256(plan) };
}

export function normalizeL3BProtectionSnapshot(raw, policy) {
  validateL3BPolicy(policy);
  const branch = raw?.branch;
  const repository = raw?.repository;
  assertObject(branch, "L3B_PROTECTION_INVALID", "缺少 main 分支保护事实");
  assertObject(repository, "L3B_PROTECTION_INVALID", "缺少仓库合并设置");
  const checks = [...(branch.required_status_checks?.checks ?? [])]
    .map((item) => ({ name: item.context, appId: item.app_id }))
    .sort(compareCheckIdentity);
  const normalized = {
    requiredStatusChecks: {
      strict: branch.required_status_checks?.strict === true,
      checks
    },
    requiredPullRequestReviews: {
      dismissStaleReviews: branch.required_pull_request_reviews?.dismiss_stale_reviews === true,
      requireLastPushApproval:
        branch.required_pull_request_reviews?.require_last_push_approval === true,
      requiredApprovingReviewCount:
        branch.required_pull_request_reviews?.required_approving_review_count,
      requireCodeOwnerReviews:
        branch.required_pull_request_reviews?.require_code_owner_reviews === true
    },
    enforceAdmins: branch.enforce_admins?.enabled === true,
    requiredLinearHistory: branch.required_linear_history?.enabled === true,
    requiredConversationResolution:
      branch.required_conversation_resolution?.enabled === true,
    allowForcePushes: branch.allow_force_pushes?.enabled === true,
    allowDeletions: branch.allow_deletions?.enabled === true,
    repositoryMergeSettings: {
      allowSquashMerge: repository.allow_squash_merge === true,
      allowAutoMerge: repository.allow_auto_merge === true,
      deleteBranchOnMerge: repository.delete_branch_on_merge === true
    }
  };
  assert(canonicalJson(checks) === canonicalJson(policy.requiredChecks),
    "L3B_PROTECTION_CHECK_DRIFT", "main 的 Required Checks 与 L3B Policy 不一致");
  const { requiredStatusChecks, ...withoutChecks } = normalized;
  const contractView = {
    requiredStatusChecks: { strict: requiredStatusChecks.strict },
    ...withoutChecks
  };
  assert(canonicalJson(contractView) === canonicalJson(policy.protectionContract),
    "L3B_PROTECTION_DRIFT", "main 分支保护或仓库合并设置不满足 L3B 合同");
  return { ...normalized, digest: canonicalSha256(normalized) };
}

export function parseL3BApprovalUrl(url) {
  const match = /^https:\/\/github\.com\/cyhui555\/deeptrail-open\/pull\/(\d+)#pullrequestreview-(\d+)$/.exec(
    url ?? ""
  );
  assert(match, "L3B_APPROVAL_URL_INVALID", "L3B approvalUrl 必须指向固定仓库的 Review");
  return { pullRequest: Number(match[1]), reviewId: Number(match[2]) };
}

function validateL3AReference(reference) {
  assertObject(reference, "L3B_PLAN_L3A_INVALID", "MergePlan.l3a 缺失");
  assertExactKeys(reference, [
    "transactionId", "receiptSha256", "changePlanFile", "planDigest", "patchDigest", "commit"
  ], "L3B_PLAN_UNKNOWN_FIELD", "MergePlan.l3a");
  assert(transactionPattern.test(reference.transactionId ?? "")
      && digestPattern.test(reference.receiptSha256 ?? "")
      && typeof reference.changePlanFile === "string"
      && /^[a-z0-9][a-z0-9._-]{1,99}\.json$/.test(reference.changePlanFile)
      && digestPattern.test(reference.planDigest ?? "")
      && digestPattern.test(reference.patchDigest ?? "")
      && shaPattern.test(reference.commit ?? ""),
    "L3B_PLAN_L3A_INVALID", "L3A Transaction、Receipt、ChangePlan、Patch 或 Commit 引用不合法");
}

function validatePullRequestBinding(binding, policy, plan) {
  assertObject(binding, "L3B_PLAN_PR_INVALID", "MergePlan.pullRequest 缺失");
  assertExactKeys(binding, [
    "number", "url", "author", "headBranch", "headRevision", "commitCount", "changedPaths"
  ], "L3B_PLAN_UNKNOWN_FIELD", "MergePlan.pullRequest");
  assert(Number.isSafeInteger(binding.number) && binding.number > 0
      && binding.url === `https://github.com/${policy.repository}/pull/${binding.number}`
      && binding.author === "github-actions[bot]"
      && isSafeBranch(binding.headBranch, policy.targetBranchPrefix)
      && shaPattern.test(binding.headRevision ?? "")
      && binding.commitCount === 1,
    "L3B_PLAN_PR_INVALID", "PR 编号、作者、Head 分支、Revision 或 Commit 数不合法");
  assert(Array.isArray(binding.changedPaths)
      && binding.changedPaths.length > 0 && binding.changedPaths.length <= 10,
    "L3B_PLAN_PATH_INVALID", "PR changedPaths 数量不合法");
  const changedPaths = binding.changedPaths.map(normalizeRepoPath);
  assert(new Set(changedPaths).size === changedPaths.length
      && canonicalJson(changedPaths) === canonicalJson([...changedPaths].sort()),
    "L3B_PLAN_PATH_INVALID", "PR changedPaths 必须唯一并按字典序排列");
  assert(plan.baseBranch === policy.baseBranch,
    "L3B_PLAN_PR_INVALID", "PR Base 必须是受保护 main");
  return { ...binding, changedPaths };
}

function validateCheckEvidence(checks, policy, headRevision) {
  assert(Array.isArray(checks) && checks.length === policy.requiredChecks.length,
    "L3B_PLAN_CHECK_INVALID", "MergePlan 必须逐项绑定全部 Required Checks");
  const normalized = checks.map((check) => {
    assertObject(check, "L3B_PLAN_CHECK_INVALID", "Check Evidence 必须是 Object");
    assertExactKeys(check, [
      "name", "appId", "checkRunId", "headRevision", "completedAt", "detailsUrl", "conclusion"
    ], "L3B_PLAN_UNKNOWN_FIELD", "MergePlan.checks[]");
    assert(typeof check.name === "string" && Number.isSafeInteger(check.appId)
        && Number.isSafeInteger(check.checkRunId) && check.checkRunId > 0
        && check.headRevision === headRevision
        && isIsoTimestamp(check.completedAt)
        && typeof check.detailsUrl === "string"
        && /^https:\/\/github\.com\/cyhui555\/deeptrail-open\/actions\/runs\/\d+(?:\/job\/\d+)?$/.test(
          check.detailsUrl
        )
        && check.conclusion === "success",
      "L3B_PLAN_CHECK_INVALID", "Required Check 未绑定成功结论、精确 Head 或 GitHub Run");
    return { ...check };
  }).sort(compareCheckIdentity);
  const identities = normalized.map(({ name, appId }) => ({ name, appId }));
  assert(canonicalJson(identities) === canonicalJson(policy.requiredChecks),
    "L3B_PLAN_CHECK_INVALID", "MergePlan Check 身份与 Policy 不一致");
  return normalized;
}

function validateHumanApproval(approval, policy, pullRequest) {
  assertObject(approval, "L3B_PLAN_REVIEW_INVALID", "MergePlan.humanApproval 缺失");
  assertExactKeys(approval, [
    "reviewer", "reviewId", "reviewUrl", "reviewedRevision", "submittedAt"
  ], "L3B_PLAN_UNKNOWN_FIELD", "MergePlan.humanApproval");
  assert(approval.reviewer === "cyhui555"
      && Number.isSafeInteger(approval.reviewId) && approval.reviewId > 0
      && approval.reviewUrl
        === `https://github.com/${policy.repository}/pull/${pullRequest.number}#pullrequestreview-${approval.reviewId}`
      && approval.reviewedRevision === pullRequest.headRevision
      && isIsoTimestamp(approval.submittedAt),
    "L3B_PLAN_REVIEW_INVALID", "人工 Review 未绑定允许 Reviewer、PR 或精确 Head");
  return { ...approval };
}

function normalizeRepoPath(value) {
  assert(typeof value === "string" && value.length > 0 && !value.includes("\\")
      && !value.startsWith("/") && !/^[A-Za-z]:/.test(value),
    "L3B_PLAN_PATH_INVALID", `非法仓库路径：${value}`);
  const normalized = path.posix.normalize(value);
  assert(normalized === value && normalized !== "." && !normalized.startsWith("../")
      && !normalized.includes("/../") && !normalized.endsWith("/"),
    "L3B_PLAN_PATH_INVALID", `仓库路径未规范化：${value}`);
  return normalized;
}

async function assertFileInside(root, requested, label) {
  const info = await lstat(requested).catch(() => null);
  assert(info?.isFile() && !info.isSymbolicLink(),
    "L3B_PROPOSAL_FILE_INVALID", `${label} 不是普通文件：${requested}`);
  const resolved = await realpath(requested);
  assert(isWithin(root, resolved), "L3B_PROPOSAL_PATH_ESCAPE", `${label} 逃逸 Proposal Root`);
  return resolved;
}

function isSafeBranch(value, prefix) {
  return typeof value === "string" && value.startsWith(prefix) && branchPattern.test(value)
    && !value.includes("..") && !value.includes("//") && !value.includes("@{")
    && !value.endsWith("/") && !value.endsWith(".lock");
}

function isApprovalUrl(value) {
  return /^https:\/\/github\.com\/cyhui555\/deeptrail-open\/pull\/\d+#pullrequestreview-\d+$/.test(
    value ?? ""
  );
}

function isIsoTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function compareCheckIdentity(left, right) {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.appId - right.appId;
}

function assertExactKeys(value, expected, code, label) {
  assertObject(value, code, `${label} 必须是 Object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(canonicalJson(actual) === canonicalJson(wanted), code,
    `${label} 字段必须精确为：${wanted.join(", ")}`);
}

function assertObject(value, code, message) {
  assert(value && typeof value === "object" && !Array.isArray(value), code, message);
}

function assert(condition, code, message) {
  if (!condition) throw new LoopGatewayError(code, message);
}
