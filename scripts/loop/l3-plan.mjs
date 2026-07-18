import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { isWithin, sha256 } from "./fs-safe.mjs";

const moduleRoot = path.dirname(fileURLToPath(import.meta.url));
const policyFile = path.join(moduleRoot, "l3-policy.json");
const fixedBudgets = Object.freeze({
  maxPatchBytes: 262144,
  maxChangedFiles: 10,
  maxAddedLines: 500,
  maxDeletedLines: 250,
  maxProfileSeconds: 900,
  maxOutputBytes: 4194304
});
const fixedProfiles = Object.freeze([
  "docs", "gateway", "quality-light", "quality-server", "quality-web", "smoke"
]);
const fixedPathRoots = Object.freeze(["apps/", "docs/", "evals/", "tests/"]);
const fixedDeniedPatterns = Object.freeze([
  "^scripts(?:/|$)",
  "^docs/(?:architecture|archive|issues|memory|operations|plans|process|requirements|verification)(?:/|$)",
  "^docs/(?:board|backlog)\\.md$",
  "^infra(?:/|$)",
  "^database/migration(?:s)?(?:/|$)",
  "^\\.github(?:/|$)",
  "^AGENTS\\.md$",
  "(?:^|/)\\.env(?:\\.|$)",
  "(?:^|/)(?:uploads?|data|logs?|playwright-report|test-results)(?:/|$)",
  "(?:^|/)package\\.json$",
  "^pnpm-lock\\.yaml$",
  "(?:^|/)pom\\.xml$"
]);
const disabledPermissions = Object.freeze({
  isolatedWorktreeMutation: false,
  localCommit: false,
  remoteBranchPush: false,
  draftPullRequest: false,
  autoApprove: false,
  autoMerge: false,
  autoDeploy: false
});
const l3aPermissions = Object.freeze({
  isolatedWorktreeMutation: true,
  localCommit: true,
  remoteBranchPush: true,
  draftPullRequest: true,
  autoApprove: false,
  autoMerge: false,
  autoDeploy: false
});
const fixedFailurePolicy = Object.freeze({
  preserveWorktree: true,
  forcePush: false,
  deleteRemoteBranch: false,
  closePullRequest: false
});
const workItemPattern = /^docs\/issues\/(?:task|bug|spike)-[a-z0-9-]+\.md$/;
const branchPattern = /^[a-z0-9][a-z0-9._/-]{2,99}$/;

export async function loadL3Policy(file = policyFile) {
  try {
    return validateL3Policy(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (error instanceof LoopGatewayError) throw error;
    throw new LoopGatewayError("L3_POLICY_INVALID", `L3 Policy JSON 无效：${error.message}`);
  }
}

export function validateL3Policy(policy) {
  assertObject(policy, "L3_POLICY_INVALID", "L3 Policy 必须是 JSON Object");
  assertExactKeys(policy, [
    "schemaVersion", "stage", "repository", "baseBranch", "sourceBranchPrefix",
    "targetBranchPrefix", "activation", "budgets", "allowedProfiles",
    "allowedPathRoots", "deniedPathPatterns", "permissions", "failurePolicy"
  ], "L3_POLICY_UNKNOWN_FIELD", "L3 Policy");
  assert(policy.schemaVersion === 1, "L3_POLICY_INVALID", "仅支持 L3 Policy Schema 1");
  assert(policy.repository === "cyhui555/deeptrail-open" && policy.baseBranch === "main"
      && policy.sourceBranchPrefix === "agent/l3/"
      && policy.targetBranchPrefix === "automation/l3/",
    "L3_POLICY_SCOPE_DRIFT", "L3 仓库、主干或分支前缀发生漂移");
  assert(canonicalJson(policy.budgets) === canonicalJson(fixedBudgets),
    "L3_POLICY_BUDGET_DRIFT", "L3 预算不得静默放宽");
  assert(canonicalJson(policy.allowedProfiles) === canonicalJson(fixedProfiles)
      && canonicalJson(policy.allowedPathRoots) === canonicalJson(fixedPathRoots)
      && canonicalJson(policy.deniedPathPatterns) === canonicalJson(fixedDeniedPatterns),
    "L3_POLICY_SCOPE_DRIFT", "L3 Profile 或路径边界发生漂移");
  assert(canonicalJson(policy.failurePolicy) === canonicalJson(fixedFailurePolicy),
    "L3_POLICY_FAILURE_DRIFT", "L3 失败现场策略发生漂移");
  assertObject(policy.activation, "L3_POLICY_INVALID", "L3 activation 缺失");
  assertExactKeys(policy.activation, [
    "enabled", "approvedRevision", "mergedRevision", "l2CohortDigest",
    "humanApprover", "approvalUrl"
  ], "L3_POLICY_UNKNOWN_FIELD", "L3 activation");

  if (policy.stage === "preflight-disabled") {
    assert(policy.activation.enabled === false
        && policy.activation.approvedRevision === null
        && policy.activation.mergedRevision === null
        && policy.activation.l2CohortDigest === null
        && policy.activation.humanApprover === null
        && policy.activation.approvalUrl === null
        && canonicalJson(policy.permissions) === canonicalJson(disabledPermissions),
      "L3_POLICY_PREMATURE_ENABLE", "L3 预检阶段必须关闭全部 Mutation 与远程权限");
  } else if (policy.stage === "l3a-draft-pr") {
    assert(policy.activation.enabled === true
        && /^[a-f0-9]{40}$/.test(policy.activation.approvedRevision ?? "")
        && /^[a-f0-9]{40}$/.test(policy.activation.mergedRevision ?? "")
        && /^[a-f0-9]{64}$/.test(policy.activation.l2CohortDigest ?? "")
        && policy.activation.humanApprover === "cyhui555"
        && /^https:\/\/github\.com\/cyhui555\/deeptrail-open\/pull\/\d+#pullrequestreview-\d+$/.test(
          policy.activation.approvalUrl ?? ""
        )
        && canonicalJson(policy.permissions) === canonicalJson(l3aPermissions),
      "L3_POLICY_ADMISSION_INVALID", "L3A 缺少受保护 Revision、L2 摘要或人工批准");
  } else {
    throw new LoopGatewayError("L3_POLICY_STAGE_INVALID", `未知 L3 Stage：${policy.stage}`);
  }
  return policy;
}

export function validateL3ChangePlan(plan, policy) {
  validateL3Policy(policy);
  assertObject(plan, "L3_PLAN_INVALID", "L3 ChangePlan 必须是 JSON Object");
  assertExactKeys(plan, [
    "schemaVersion", "changeId", "workItemId", "repository", "baseBranch",
    "baseRevision", "workItem", "sourceBranch", "profile", "patch",
    "commitMessage", "pullRequest"
  ], "L3_PLAN_UNKNOWN_FIELD", "ChangePlan");
  assert(plan.schemaVersion === 1, "L3_PLAN_INVALID", "仅支持 L3 ChangePlan Schema 1");
  assert(/^[a-z0-9][a-z0-9-]{7,79}$/.test(plan.changeId ?? ""),
    "L3_PLAN_INVALID", "changeId 不合法");
  assert(/^(?:TASK|BUG|SPIKE)-[A-Z0-9-]+-\d+$/.test(plan.workItemId ?? ""),
    "L3_PLAN_INVALID", "workItemId 不合法");
  assert(plan.repository === policy.repository && plan.baseBranch === policy.baseBranch,
    "L3_PLAN_SCOPE_MISMATCH", "ChangePlan 仓库或基线分支不一致");
  assert(/^[a-f0-9]{40}$/.test(plan.baseRevision ?? ""),
    "L3_PLAN_INVALID", "baseRevision 必须是完整 Git Commit");
  assert(workItemPattern.test(plan.workItem ?? "")
      && path.basename(plan.workItem).startsWith(`${plan.workItemId.toLowerCase()}-`),
    "L3_PLAN_WORK_ITEM_INVALID", "ChangePlan Work Item 与 ID 不一致");
  assertSafeBranch(plan.sourceBranch, policy.sourceBranchPrefix, "L3_PLAN_BRANCH_INVALID");
  assert(policy.allowedProfiles.includes(plan.profile),
    "L3_PLAN_PROFILE_DENIED", `L3 Profile 未登记：${plan.profile}`);

  assertObject(plan.patch, "L3_PLAN_PATCH_INVALID", "ChangePlan patch 缺失");
  assertExactKeys(plan.patch, ["file", "sha256", "changedPaths"],
    "L3_PLAN_UNKNOWN_FIELD", "ChangePlan.patch");
  assert(typeof plan.patch.file === "string"
      && /^[a-z0-9][a-z0-9._-]{1,99}\.patch$/.test(plan.patch.file),
    "L3_PLAN_PATCH_INVALID", "Patch 必须是与 Plan 同目录的简单 .patch 文件名");
  assert(/^[a-f0-9]{64}$/.test(plan.patch.sha256 ?? ""),
    "L3_PLAN_PATCH_INVALID", "Patch SHA-256 不合法");
  assert(Array.isArray(plan.patch.changedPaths) && plan.patch.changedPaths.length > 0
      && plan.patch.changedPaths.length <= policy.budgets.maxChangedFiles,
    "L3_PLAN_PATH_BUDGET", "Patch changedPaths 数量不合法");
  const normalized = plan.patch.changedPaths.map(normalizeRepoPath);
  assert(new Set(normalized).size === normalized.length
      && canonicalJson(normalized) === canonicalJson([...normalized].sort()),
    "L3_PLAN_PATH_ORDER", "Patch changedPaths 必须唯一并按字典序排列");
  for (const candidate of normalized) assertPathAllowed(candidate, policy);

  assert(typeof plan.commitMessage === "string" && plan.commitMessage.length <= 100
      && new RegExp(`^[a-z]+\\(${escapeRegExp(plan.workItemId)}\\): [^\\r\\n]+$`)
        .test(plan.commitMessage),
    "L3_PLAN_COMMIT_INVALID", "Commit Message 必须绑定 Work Item 且不超过 100 字符");
  assertObject(plan.pullRequest, "L3_PLAN_PR_INVALID", "ChangePlan pullRequest 缺失");
  assertExactKeys(plan.pullRequest, ["targetBranch", "title", "body", "draft"],
    "L3_PLAN_UNKNOWN_FIELD", "ChangePlan.pullRequest");
  assertSafeBranch(plan.pullRequest.targetBranch, policy.targetBranchPrefix,
    "L3_PLAN_BRANCH_INVALID");
  assert(plan.pullRequest.draft === true
      && typeof plan.pullRequest.title === "string"
      && plan.pullRequest.title.includes(plan.workItemId)
      && plan.pullRequest.title.length <= 120
      && typeof plan.pullRequest.body === "string"
      && plan.pullRequest.body.length >= 20 && plan.pullRequest.body.length <= 4000,
    "L3_PLAN_PR_INVALID", "L3A 只允许带 Work Item 的 Draft PR");
  return { ...plan, patch: { ...plan.patch, changedPaths: normalized } };
}

export async function loadL3ChangePlan(planFile, proposalRoot, policy) {
  const root = await realpath(proposalRoot).catch(() => null);
  assert(root, "L3_PROPOSAL_ROOT_MISSING", `Proposal Root 不存在：${proposalRoot}`);
  assert(typeof planFile === "string" && planFile.length > 0,
    "L3_PLAN_REQUIRED", "L3 命令必须显式提供 --plan");
  const requestedPlan = path.isAbsolute(planFile) ? planFile : path.join(root, planFile);
  const resolvedPlan = await assertFileInside(root, requestedPlan, "L3 ChangePlan");
  let parsed;
  try {
    parsed = JSON.parse(await readFile(resolvedPlan, "utf8"));
  } catch (error) {
    throw new LoopGatewayError("L3_PLAN_INVALID", `L3 ChangePlan JSON 无效：${error.message}`);
  }
  const plan = validateL3ChangePlan(parsed, policy);
  const patchFile = await assertFileInside(root,
    path.join(path.dirname(resolvedPlan), plan.patch.file), "L3 Patch");
  assert(path.dirname(patchFile) === path.dirname(resolvedPlan),
    "L3_PATCH_PATH_ESCAPE", "Patch 必须与 ChangePlan 位于同一目录");
  const patch = await readFile(patchFile);
  assert(patch.length > 0 && patch.length <= policy.budgets.maxPatchBytes,
    "L3_PATCH_BUDGET", `Patch 超过 ${policy.budgets.maxPatchBytes} bytes`);
  assert(!patch.includes(0) && sha256(patch) === plan.patch.sha256,
    "L3_PATCH_DIGEST_MISMATCH", "Patch 含 NUL 或 SHA-256 与 ChangePlan 不一致");
  return { plan, planFile: resolvedPlan, patchFile, patch };
}

export function assertPathAllowed(candidate, policy) {
  const normalized = normalizeRepoPath(candidate);
  assert(policy.allowedPathRoots.some((root) => normalized.startsWith(root)),
    "L3_PATH_ROOT_DENIED", `L3 路径不在允许根内：${normalized}`);
  const denied = policy.deniedPathPatterns.find((pattern) => new RegExp(pattern).test(normalized));
  assert(!denied, "L3_PATH_DENIED", `L3 路径命中禁区：${normalized}`);
  return normalized;
}

function normalizeRepoPath(value) {
  assert(typeof value === "string" && value.length > 0 && !value.includes("\\")
      && !value.startsWith("/") && !/^[A-Za-z]:/.test(value),
    "L3_PATH_INVALID", `非法仓库路径：${value}`);
  const normalized = path.posix.normalize(value);
  assert(normalized === value && normalized !== "." && !normalized.startsWith("../")
      && !normalized.includes("/../") && !normalized.endsWith("/"),
    "L3_PATH_INVALID", `仓库路径未规范化：${value}`);
  return normalized;
}

async function assertFileInside(root, requested, label) {
  const info = await lstat(requested).catch(() => null);
  assert(info?.isFile() && !info.isSymbolicLink(),
    "L3_PROPOSAL_FILE_INVALID", `${label} 不是普通文件：${requested}`);
  const resolved = await realpath(requested);
  assert(isWithin(root, resolved), "L3_PROPOSAL_PATH_ESCAPE", `${label} 逃逸 Proposal Root`);
  return resolved;
}

function assertSafeBranch(value, prefix, code) {
  assert(typeof value === "string" && value.startsWith(prefix) && branchPattern.test(value)
      && !value.includes("..") && !value.includes("//") && !value.includes("@{")
      && !value.endsWith("/") && !value.endsWith(".lock"),
    code, `L3 分支不在固定前缀内或名称不安全：${value}`);
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assert(condition, code, message) {
  if (!condition) throw new LoopGatewayError(code, message);
}
