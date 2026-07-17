import process from "node:process";

const EXPECTED_REPOSITORY = "cyhui555/deeptrail-open";
const EXPECTED_OWNER = "cyhui555";
const DEFAULT_BRANCH = "main";
const BOT_LOGIN = "github-actions[bot]";

export class GitHubApiError extends Error {
  constructor(method, pathname, status, message) {
    super(`${method} ${pathname} 失败（HTTP ${status}）：${message}`);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

export function validateAuthorInputs(environment) {
  const values = {
    token: required(environment.GH_TOKEN, "GH_TOKEN"),
    repository: required(environment.REPOSITORY, "REPOSITORY"),
    owner: required(environment.REPOSITORY_OWNER, "REPOSITORY_OWNER"),
    actor: required(environment.WORKFLOW_ACTOR, "WORKFLOW_ACTOR"),
    runId: required(environment.WORKFLOW_RUN_ID, "WORKFLOW_RUN_ID"),
    sourceRef: required(environment.SOURCE_REF, "SOURCE_REF"),
    expectedSha: required(environment.EXPECTED_SHA, "EXPECTED_SHA"),
    targetBranch: required(environment.TARGET_BRANCH, "TARGET_BRANCH"),
    title: required(environment.PR_TITLE, "PR_TITLE"),
    body: environment.PR_BODY?.trim() ?? "",
  };

  assert(values.repository === EXPECTED_REPOSITORY, "只允许操作固定公开仓库");
  assert(values.owner === EXPECTED_OWNER && values.actor === EXPECTED_OWNER,
    "只允许仓库所有者触发自动化作者");
  assert(/^\d+$/.test(values.runId), "WORKFLOW_RUN_ID 必须是数字");
  assert(isSafeBranch(values.sourceRef, "agent/"), "SOURCE_REF 必须是安全的 agent/* 分支");
  assert(isSafeBranch(values.targetBranch, "automation/"),
    "TARGET_BRANCH 必须是安全的 automation/* 分支");
  assert(values.sourceRef !== values.targetBranch, "源分支与目标分支不能相同");
  assert(/^[a-f0-9]{40}$/.test(values.expectedSha), "EXPECTED_SHA 必须是小写完整 Commit SHA");
  assert(isBoundedText(values.title, 1, 120), "PR_TITLE 长度必须为 1—120 且不能含控制字符");
  assert(isBoundedText(values.body, 0, 4000), "PR_BODY 不能超过 4000 字符或包含控制字符");
  return values;
}

export async function createAutomationPullRequest(environment = process.env, request = githubRequest) {
  const input = validateAuthorInputs(environment);
  const source = await request("GET", refPath(input.repository, input.sourceRef), { token: input.token });
  const sourceSha = source?.object?.sha;
  assert(sourceSha === input.expectedSha,
    `源分支漂移：期望 ${input.expectedSha}，实际 ${sourceSha ?? "unknown"}`);

  const comparison = await request(
    "GET",
    `/repos/${input.repository}/compare/${DEFAULT_BRANCH}...${input.expectedSha}`,
    { token: input.token },
  );
  assert(comparison.status === "ahead" && comparison.behind_by === 0 && comparison.ahead_by > 0,
    `源提交必须严格领先且不落后于 ${DEFAULT_BRANCH}`);

  const target = await request("GET", refPath(input.repository, input.targetBranch), {
    token: input.token,
    allowNotFound: true,
  });
  assert(target === undefined, `目标分支已存在：${input.targetBranch}`);

  let createdRef = false;
  try {
    await request("POST", `/repos/${input.repository}/git/refs`, {
      token: input.token,
      body: { ref: `refs/heads/${input.targetBranch}`, sha: input.expectedSha },
    });
    createdRef = true;

    const pullRequest = await request("POST", `/repos/${input.repository}/pulls`, {
      token: input.token,
      body: {
        base: DEFAULT_BRANCH,
        head: input.targetBranch,
        title: input.title,
        body: buildAuditBody(input),
        draft: true,
        maintainer_can_modify: false,
      },
    });

    if (pullRequest?.user?.login !== BOT_LOGIN) {
      await bestEffortClose(request, input, pullRequest?.number);
      await bestEffortDeleteRef(request, input);
      createdRef = false;
      throw new Error(`PR 作者不是 ${BOT_LOGIN}，已关闭并清理自动化分支`);
    }

    // PR 已由机器人身份建立后不再自动删分支；CI 由受信任的人工身份另行调度。
    createdRef = false;

    const result = {
      pullRequest: pullRequest.html_url,
      number: pullRequest.number,
      author: pullRequest.user.login,
      head: input.targetBranch,
      sha: input.expectedSha,
      ciDispatched: false,
    };
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    if (createdRef) await bestEffortDeleteRef(request, input);
    throw error;
  }
}

function buildAuditBody(input) {
  const prefix = input.body ? `${input.body}\n\n` : "";
  return `${prefix}---\n\n自动化作者审计：\n\n`
    + `- Source: \`${input.sourceRef}@${input.expectedSha}\`\n`
    + `- Target: \`${input.targetBranch}\`\n`
    + `- Triggered by: \`${input.actor}\`\n`
    + `- Workflow run: \`${input.runId}\`\n`
    + "- Mode: Draft PR；CI 由人工身份另行调度；不自动审批、不自动合并、不自动部署。";
}

async function githubRequest(method, pathname, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${options.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "deeptrail-automation-pr-author",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (options.allowNotFound && response.status === 404) return undefined;
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new GitHubApiError(method, pathname, response.status, payload.message ?? "unknown error");
  }
  if (response.status === 204) return undefined;
  return response.json();
}

async function bestEffortClose(request, input, number) {
  if (!Number.isInteger(number)) return;
  await request("PATCH", `/repos/${input.repository}/pulls/${number}`, {
    token: input.token,
    body: { state: "closed" },
  }).catch(() => undefined);
}

async function bestEffortDeleteRef(request, input) {
  await request("DELETE", refPath(input.repository, input.targetBranch), {
    token: input.token,
  }).catch(() => undefined);
}

function refPath(repository, branch) {
  const encoded = branch.split("/").map(encodeURIComponent).join("/");
  return `/repos/${repository}/git/refs/heads/${encoded}`;
}

function isSafeBranch(value, prefix) {
  return value.startsWith(prefix)
    && value.length <= 100
    && /^[a-z0-9][a-z0-9._/-]*[a-z0-9]$/.test(value)
    && !value.includes("..")
    && !value.includes("//")
    && !value.includes("@{")
    && !value.endsWith(".lock");
}

function isBoundedText(value, minimum, maximum) {
  return value.length >= minimum && value.length <= maximum
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function required(value, name) {
  assert(typeof value === "string" && value.trim().length > 0, `${name} 不能为空`);
  return value.trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/github/automation-pr-author.mjs")) {
  createAutomationPullRequest().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
