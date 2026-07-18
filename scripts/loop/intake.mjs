import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { sha256 } from "./fs-safe.mjs";
import { runProcess } from "./process.mjs";
import { sanitizedEnvironment } from "./runtime.mjs";

const moduleRoot = path.dirname(fileURLToPath(import.meta.url));
const policyFile = path.join(moduleRoot, "intake-policy.json");
const POLICY_KEYS = [
  "budgets",
  "executableLabel",
  "permissions",
  "repository",
  "requiredSections",
  "schemaVersion",
  "trustedRequesters",
  "workItemProposal"
];
const PERMISSION_KEYS = [
  "createIssue",
  "createPullRequest",
  "deploy",
  "executeCommands",
  "markReady",
  "mergePullRequest",
  "mutateGit",
  "readIssue",
  "submitReview",
  "updateIssue"
];
const REQUIRED_SECTIONS = ["目标", "验收标准", "范围外", "回滚"];
const WORK_ITEM_PROPOSAL = Object.freeze({
  mode: "proposal-only",
  allowedKinds: ["TASK", "BUG", "SPIKE"],
  maxTitleChars: 120,
  maxSectionBytes: 4096,
  maxSectionLines: 40,
  maxContentBytes: 24576
});

export async function loadIntakePolicy(file = policyFile) {
  try {
    return validateIntakePolicy(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (error instanceof LoopGatewayError) throw error;
    throw new LoopGatewayError(
      "INTAKE_POLICY_INVALID",
      `Intake Policy JSON 无效：${error.message}`
    );
  }
}

export function validateIntakePolicy(policy) {
  assertObject(policy, "INTAKE_POLICY_INVALID", "Intake Policy 必须是 JSON Object");
  assertExactKeys(policy, POLICY_KEYS, "INTAKE_POLICY_UNKNOWN_FIELD", "Intake Policy");
  assert(policy.schemaVersion === 2, "INTAKE_POLICY_INVALID", "仅支持 Intake Policy Schema 2");
  assert(policy.repository === "cyhui555/deeptrail-open",
    "INTAKE_POLICY_SCOPE_DRIFT", "Intake 仓库范围发生漂移");
  assert(policy.executableLabel === "agent-ready",
    "INTAKE_POLICY_SCOPE_DRIFT", "Intake 执行标签发生漂移");
  assertStringArray(policy.trustedRequesters, "INTAKE_POLICY_INVALID", "可信请求者");
  assert(policy.trustedRequesters.length > 0
      && policy.trustedRequesters.length === new Set(policy.trustedRequesters).size
      && policy.trustedRequesters.every((item) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(item)),
    "INTAKE_POLICY_INVALID", "可信请求者列表无效");
  assert(Array.isArray(policy.requiredSections)
      && JSON.stringify(policy.requiredSections) === JSON.stringify(REQUIRED_SECTIONS),
    "INTAKE_POLICY_SECTION_DRIFT", "Intake 必需章节发生漂移");
  assertObject(policy.workItemProposal, "INTAKE_POLICY_INVALID", "Work Item Proposal 配置缺失");
  assertExactKeys(policy.workItemProposal, Object.keys(WORK_ITEM_PROPOSAL),
    "INTAKE_POLICY_UNKNOWN_FIELD", "Work Item Proposal");
  assert(canonicalJson(policy.workItemProposal) === canonicalJson(WORK_ITEM_PROPOSAL),
    "INTAKE_POLICY_SCOPE_DRIFT", "Work Item Proposal 模式、类型或预算发生漂移");

  assertObject(policy.budgets, "INTAKE_POLICY_INVALID", "Intake budgets 缺失");
  assertExactKeys(policy.budgets, ["maxBodyBytes", "maxLabels", "maxTitleChars"],
    "INTAKE_POLICY_UNKNOWN_FIELD", "Intake budgets");
  for (const [name, minimum, maximum] of [
    ["maxTitleChars", 20, 500],
    ["maxBodyBytes", 1024, 128 * 1024],
    ["maxLabels", 1, 50]
  ]) {
    const value = policy.budgets[name];
    assert(Number.isInteger(value) && value >= minimum && value <= maximum,
      "INTAKE_POLICY_BUDGET_DRIFT", `${name} 超出允许范围`);
  }

  assertObject(policy.permissions, "INTAKE_POLICY_INVALID", "Intake permissions 缺失");
  assertExactKeys(policy.permissions, PERMISSION_KEYS,
    "INTAKE_POLICY_UNKNOWN_FIELD", "Intake permissions");
  assert(policy.permissions.readIssue === true
      && PERMISSION_KEYS.filter((name) => name !== "readIssue")
        .every((name) => policy.permissions[name] === false),
    "INTAKE_POLICY_PERMISSION_DRIFT", "Intake 只允许读取 Issue，全部写权限必须关闭");
  return policy;
}

export async function inspectIssueIntake(issueNumber, options = {}) {
  return (await readIssueIntakeSource(issueNumber, options)).intake;
}

/** 仅供受控派生合同复用原始响应；普通 Intake CLI 永不返回 raw。 */
export async function readIssueIntakeSource(issueNumber, options = {}) {
  assert(Number.isInteger(issueNumber) && issueNumber > 0,
    "INTAKE_ISSUE_NUMBER_INVALID", "Issue 编号必须是正整数");
  const policy = validateIntakePolicy(options.policy ?? await loadIntakePolicy());
  const reader = options.readIssue ?? readGitHubIssue;
  const raw = await reader(policy.repository, issueNumber);
  assert(raw?.number === issueNumber,
    "INTAKE_ISSUE_NUMBER_MISMATCH", "GitHub Issue 响应编号与请求编号不一致");
  return { policy, raw, intake: evaluateIssueIntake(raw, policy) };
}

export function evaluateIssueIntake(raw, policyInput) {
  const policy = validateIntakePolicy(policyInput);
  assertObject(raw, "INTAKE_GITHUB_RESPONSE_INVALID", "GitHub Issue 响应必须是 Object");
  assert(!raw.pull_request, "INTAKE_PULL_REQUEST_DENIED", "Intake 只接受 Issue，不接受 Pull Request");
  assert(Number.isInteger(raw.number) && raw.number > 0,
    "INTAKE_GITHUB_RESPONSE_INVALID", "GitHub Issue 编号无效");
  const expectedUrl = `https://github.com/${policy.repository}/issues/${raw.number}`;
  assert(raw.html_url === expectedUrl,
    "INTAKE_REPOSITORY_MISMATCH", "GitHub Issue URL 与固定仓库不一致");
  assert(typeof raw.title === "string" && raw.title.trim().length > 0
      && raw.title.length <= policy.budgets.maxTitleChars,
    "INTAKE_TITLE_INVALID", "Issue 标题为空或超过预算");

  const body = raw.body ?? "";
  assert(typeof body === "string", "INTAKE_BODY_INVALID", "Issue 正文必须是字符串");
  assert(Buffer.byteLength(body, "utf8") <= policy.budgets.maxBodyBytes,
    "INTAKE_BODY_BUDGET_EXCEEDED", "Issue 正文超过 Intake 预算");
  const state = normalizeState(raw.state);
  const stateReason = normalizeStateReason(raw.state_reason);
  const requester = raw.user?.login;
  assert(typeof requester === "string" && requester.length > 0,
    "INTAKE_GITHUB_RESPONSE_INVALID", "Issue 请求者缺失");
  const labels = normalizeLabels(raw.labels, policy.budgets.maxLabels);
  const updatedAt = normalizeTimestamp(raw.updated_at, "Issue updated_at");
  const sections = parseSections(body);
  const presentSections = policy.requiredSections.filter((name) => sections.get(name)?.length > 0);
  const missingSections = policy.requiredSections.filter((name) => !presentSections.includes(name));

  const contract = {
    schemaVersion: 1,
    repository: policy.repository,
    issueNumber: raw.number,
    url: expectedUrl,
    title: raw.title.trim(),
    requester,
    labels,
    state,
    stateReason,
    updatedAt,
    bodySha256: sha256(body),
    requiredSectionsPresent: presentSections
  };
  if (state === "closed") {
    return result(contract, policy, {
      decision: "terminal",
      executable: false,
      terminal: true,
      queueDisposition: "ignore-terminal",
      missingSections: [],
      reasons: [`ISSUE_CLOSED:${stateReason ?? "completed"}`]
    });
  }

  const reasons = [];
  if (!policy.trustedRequesters.includes(requester)) reasons.push("UNTRUSTED_REQUESTER");
  if (!labels.includes(policy.executableLabel)) reasons.push("AGENT_READY_LABEL_MISSING");
  reasons.push(...missingSections.map((name) => `REQUIRED_SECTION_MISSING:${name}`));
  const executable = reasons.length === 0;
  return result(contract, policy, {
    decision: executable ? "executable" : "proposal-only",
    executable,
    terminal: false,
    queueDisposition: executable ? "candidate" : "awaiting-contract",
    missingSections,
    reasons
  });
}

export async function readGitHubIssue(repository, issueNumber) {
  const response = await runProcess("gh", [
    "api", `repos/${repository}/issues/${issueNumber}`
  ], {
    env: sanitizedEnvironment({
      NO_COLOR: "1",
      GH_PROMPT_DISABLED: "1",
      GIT_TERMINAL_PROMPT: "0"
    }),
    timeoutMs: 30_000,
    outputLimit: 512 * 1024
  });
  if (response.code !== 0) {
    throw new LoopGatewayError(
      "INTAKE_GITHUB_READ_FAILED",
      `读取 GitHub Issue #${issueNumber} 失败（exit ${response.code}）`,
      { stderr: response.stderr.trim().slice(0, 2048) }
    );
  }
  try {
    return JSON.parse(response.stdout);
  } catch (error) {
    throw new LoopGatewayError(
      "INTAKE_GITHUB_RESPONSE_INVALID",
      `GitHub Issue 响应不是合法 JSON：${error.message}`
    );
  }
}

function result(contract, policy, decision) {
  return {
    ok: true,
    operation: "intake-issue",
    ...decision,
    issue: contract,
    contractDigest: canonicalSha256(contract),
    permissions: { ...policy.permissions }
  };
}

function parseSections(body) {
  const headings = [];
  const pattern = /^#{2,6}[ \t]+(.+?)[ \t]*$/gm;
  for (const match of body.matchAll(pattern)) {
    headings.push({
      name: normalizeHeading(match[1]),
      contentStart: match.index + match[0].length,
      headingStart: match.index
    });
  }
  const sections = new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const current = headings[index];
    const end = headings[index + 1]?.headingStart ?? body.length;
    const content = body.slice(current.contentStart, end).trim();
    if (!sections.has(current.name) || content.length > sections.get(current.name).length) {
      sections.set(current.name, content);
    }
  }
  return sections;
}

function normalizeHeading(value) {
  return value.trim().replace(/[：:]$/, "").trim();
}

function normalizeState(value) {
  const state = String(value ?? "").toLowerCase();
  assert(state === "open" || state === "closed",
    "INTAKE_GITHUB_RESPONSE_INVALID", "Issue state 不是 open/closed");
  return state;
}

function normalizeStateReason(value) {
  if (value === null || value === undefined) return null;
  assert(["completed", "not_planned", "reopened"].includes(value),
    "INTAKE_GITHUB_RESPONSE_INVALID", "Issue state_reason 不受支持");
  return value;
}

function normalizeLabels(raw, maximum) {
  assert(Array.isArray(raw), "INTAKE_GITHUB_RESPONSE_INVALID", "Issue labels 缺失");
  assert(raw.length <= maximum, "INTAKE_LABEL_BUDGET_EXCEEDED", "Issue labels 超过预算");
  const labels = raw.map((item) => typeof item === "string" ? item : item?.name);
  assert(labels.every((item) => typeof item === "string" && item.trim().length > 0),
    "INTAKE_GITHUB_RESPONSE_INVALID", "Issue label 无效");
  return [...new Set(labels.map((item) => item.trim()))].sort();
}

function normalizeTimestamp(value, label) {
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)),
    "INTAKE_GITHUB_RESPONSE_INVALID", `${label} 无效`);
  return new Date(value).toISOString();
}

function assertStringArray(value, code, label) {
  assert(Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0),
    code, `${label} 必须是非空字符串数组`);
}

function assertObject(value, code, message) {
  assert(value && typeof value === "object" && !Array.isArray(value), code, message);
}

function assertExactKeys(value, expected, code, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(JSON.stringify(actual) === JSON.stringify(wanted), code, `${label} 含未知或缺失字段`);
}

function assert(condition, code, message) {
  if (!condition) throw new LoopGatewayError(code, message);
}
