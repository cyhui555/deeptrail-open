import process from "node:process";

const EXPECTED_REPOSITORY = "cyhui555/deeptrail-open";
const EXPECTED_OWNER = "cyhui555";
const EXPECTED_WORKFLOW = "CI";
const DEFAULT_BRANCH = "main";
const BOT_LOGIN = "github-actions[bot]";
const GITHUB_ACTIONS_APP_ID = 15368;
const REQUIRED_CHECKS = [
  "Governance and Loop quality",
  "Backend quality",
  "Backend E2E",
  "Frontend quality and Eval",
  "Frontend smoke",
];
const CONTROL_FILES = new Set([
  "docs/issues/board.md",
  "docs/memory/project-state.md",
  "docs/requirements/registry.md",
]);
const ARCHIVE_PATTERN = /^docs\/archive\/((?:bug-\d{8}-\d{3}|task-[a-z0-9]+-\d{3})-[a-z0-9][a-z0-9-]{2,79})\.md$/;

export class GitHubApiError extends Error {
  constructor(method, pathname, status, message) {
    super(`${method} ${pathname} 失败（HTTP ${status}）：${message}`);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

export function validateFinalizerInputs(environment) {
  const values = {
    token: required(environment.GH_TOKEN, "GH_TOKEN"),
    repository: required(environment.REPOSITORY, "REPOSITORY"),
    runId: required(environment.WORKFLOW_RUN_ID, "WORKFLOW_RUN_ID"),
    expectedHeadSha: required(environment.EXPECTED_HEAD_SHA, "EXPECTED_HEAD_SHA"),
  };
  assert(values.repository === EXPECTED_REPOSITORY, "只允许操作固定公开仓库");
  assert(/^\d+$/.test(values.runId), "WORKFLOW_RUN_ID 必须是数字");
  assert(/^[a-f0-9]{40}$/.test(values.expectedHeadSha),
    "EXPECTED_HEAD_SHA 必须是小写完整 Commit SHA");
  return values;
}

export function validateArchiveFiles(files) {
  assert(Array.isArray(files) && files.length >= 4 && files.length <= 6,
    "归档 PR 必须包含 4—6 个受控文档文件");
  assert(new Set(files.map((file) => file.filename)).size === files.length,
    "归档 PR 不能包含重复文件");

  let archive;
  let issue;
  let plan;
  let totalChanges = 0;
  const controls = new Set();

  for (const file of files) {
    assert(typeof file.filename === "string" && !file.filename.includes("\\")
      && !file.filename.includes(".."), "归档 PR 包含不安全路径");
    assert(Number.isSafeInteger(file.changes) && file.changes >= 0,
      `文件变更计数无效：${file.filename}`);
    assert(typeof file.patch === "string" && file.patch.length <= 20_000,
      `文件必须提供受限文本 Patch：${file.filename}`);
    totalChanges += file.changes;

    const archiveMatch = ARCHIVE_PATTERN.exec(file.filename);
    if (archiveMatch) {
      assert(!archive && file.status === "added" && file.deletions === 0
        && file.additions > 0 && file.additions <= 200,
      "归档摘要必须是唯一、受限大小的新增 Markdown");
      archive = { file, stem: archiveMatch[1] };
      continue;
    }

    if (CONTROL_FILES.has(file.filename)) {
      assert(file.status === "modified" && file.changes <= 120,
        `归档控制文件状态无效：${file.filename}`);
      controls.add(file.filename);
      continue;
    }

    if (/^docs\/issues\/.+\.md$/.test(file.filename)) {
      assert(!issue && file.status === "removed" && file.additions === 0,
        "活动 Work Item 必须且只能删除一份");
      issue = file;
      continue;
    }

    if (/^docs\/plans\/.+\.md$/.test(file.filename)) {
      assert(!plan && file.status === "removed" && file.additions === 0,
        "ExecPlan 只能删除一份");
      plan = file;
      continue;
    }

    assert(false, `归档 PR 包含越界文件：${file.filename}`);
  }

  assert(totalChanges <= 500, "归档 PR 总变更量超过 500 行");
  assert(archive && issue, "归档 PR 必须新增摘要并删除同名 Work Item");
  assert(issue.filename === `docs/issues/${archive.stem}.md`,
    "归档摘要与删除的 Work Item 必须同名");
  if (plan) {
    assert(plan.filename === `docs/plans/${archive.stem}.md`
      || plan.filename === `docs/plans/${archive.stem}-exec-plan.md`,
    "删除的 ExecPlan 必须与归档 Work Item 同名");
  }
  assert(controls.has("docs/issues/board.md")
    && controls.has("docs/memory/project-state.md"),
  "归档 PR 必须同步看板与项目状态");

  return {
    stem: archive.stem,
    workItemId: workItemIdFromStem(archive.stem),
    archivePath: archive.file.filename,
    issuePath: issue.filename,
    planPath: plan?.filename ?? null,
  };
}

export async function finalizeArchivePullRequest(
  environment = process.env,
  request = githubRequest,
) {
  const input = validateFinalizerInputs(environment);
  const run = await request("GET", `/repos/${input.repository}/actions/runs/${input.runId}`, {
    token: input.token,
  });
  const pullNumber = validateWorkflowRun(run, input);

  let pullRequest = await request("GET", `/repos/${input.repository}/pulls/${pullNumber}`, {
    token: input.token,
  });
  validatePullRequest(pullRequest, input);

  const comparison = await request(
    "GET",
    `/repos/${input.repository}/compare/${DEFAULT_BRANCH}...${input.expectedHeadSha}`,
    { token: input.token },
  );
  assert(comparison.status === "ahead" && comparison.behind_by === 0
    && comparison.ahead_by === 1, "归档 Head 必须以单提交严格领先最新 main");

  const files = await request(
    "GET",
    `/repos/${input.repository}/pulls/${pullNumber}/files?per_page=100`,
    { token: input.token },
  );
  assert(files.length === pullRequest.changed_files, "归档文件列表不完整");
  const archive = validateArchiveFiles(files);
  assert(pullRequest.head.ref === `agent/archive/${archive.stem}`,
    "归档分支必须与归档摘要同名");
  assert(pullRequest.title.includes(archive.workItemId)
    && /归档|archive/i.test(pullRequest.title), "归档 PR 标题必须包含 Work Item ID 和归档语义");

  await validateArchiveContents(request, input, archive);
  await validateRequiredChecks(request, input);

  const reviewsPath = `/repos/${input.repository}/pulls/${pullNumber}/reviews?per_page=100`;
  const reviews = await request("GET", reviewsPath, { token: input.token });
  let approval = latestBotApproval(reviews, input.expectedHeadSha);
  if (!approval) {
    approval = await request("POST", `/repos/${input.repository}/pulls/${pullNumber}/reviews`, {
      token: input.token,
      body: {
        body: `${archive.workItemId} 严格归档合同通过：精确 Head、受控文档差异与必需检查均已验证。`,
        event: "APPROVE",
        commit_id: input.expectedHeadSha,
      },
    });
    assert(approval?.user?.login === BOT_LOGIN && approval.state === "APPROVED"
      && approval.commit_id === input.expectedHeadSha, "机器人审批未绑定精确 Head");
  }

  pullRequest = await request("GET", `/repos/${input.repository}/pulls/${pullNumber}`, {
    token: input.token,
  });
  validatePullRequest(pullRequest, input);

  const merge = await request("PUT", `/repos/${input.repository}/pulls/${pullNumber}/merge`, {
    token: input.token,
    body: {
      sha: input.expectedHeadSha,
      merge_method: "squash",
      commit_title: `${archive.workItemId}：归档交付记录 (#${pullNumber})`,
      commit_message: "严格归档合同、精确 Head、五项必需检查与机器人作者外审批均已通过；不触发部署。",
    },
  });
  assert(merge?.merged === true && /^[a-f0-9]{40}$/.test(merge.sha ?? ""),
    `归档 PR 未合并：${merge?.message ?? "unknown"}`);

  const result = {
    pullRequest: pullRequest.html_url,
    number: pullNumber,
    workItemId: archive.workItemId,
    head: input.expectedHeadSha,
    reviewId: approval.id,
    mergeCommit: merge.sha,
    deployed: false,
  };
  console.log(JSON.stringify(result));
  return result;
}

function validateWorkflowRun(run, input) {
  assert(run?.name === EXPECTED_WORKFLOW && run.event === "pull_request",
    "只接受 CI 的 pull_request 运行");
  assert(run.status === "completed" && run.conclusion === "success",
    "CI 必须完整成功");
  assert(run.head_sha === input.expectedHeadSha, "Workflow Run Head 与输入不一致");
  assert(run.head_repository?.full_name === input.repository,
    "只接受同仓库分支的 CI");
  assert(Array.isArray(run.pull_requests) && run.pull_requests.length === 1,
    "Workflow Run 必须唯一绑定一个 PR");
  const binding = run.pull_requests[0];
  assert(Number.isSafeInteger(binding.number) && binding.number > 0
    && binding.base?.ref === DEFAULT_BRANCH
    && binding.head?.sha === input.expectedHeadSha,
  "Workflow Run 的 PR 绑定无效");
  return binding.number;
}

function validatePullRequest(pullRequest, input) {
  assert(pullRequest?.state === "open" && pullRequest.merged_at === null
    && pullRequest.draft === false, "归档 PR 必须为 Open 且非 Draft");
  assert(pullRequest.user?.login === EXPECTED_OWNER,
    "归档 PR 必须由仓库所有者创建，机器人作者不能自审");
  assert(pullRequest.base?.ref === DEFAULT_BRANCH
    && pullRequest.base?.repo?.full_name === input.repository,
  "归档 PR 必须指向固定仓库 main");
  assert(pullRequest.head?.sha === input.expectedHeadSha
    && pullRequest.head?.repo?.full_name === input.repository,
  "归档 PR Head 已漂移或来自外部仓库");
  assert(/^agent\/archive\/[a-z0-9][a-z0-9-]{8,95}$/.test(pullRequest.head.ref),
    "归档 PR 分支不符合 agent/archive/* 合同");
  assert(pullRequest.commits === 1 && pullRequest.changed_files >= 4
    && pullRequest.changed_files <= 6, "归档 PR 必须是单提交且仅含受控文件");
}

async function validateArchiveContents(request, input, archive) {
  const archiveContent = await readTextFile(
    request,
    input,
    archive.archivePath,
    input.expectedHeadSha,
  );
  assert(archiveContent.includes(archive.workItemId)
    && /(?:状态|结论)[^\r\n]{0,40}(?:Closed|已完成|关闭|G3)/i.test(archiveContent),
  "归档摘要缺少 Work Item ID 或关闭结论");

  const board = await readTextFile(
    request,
    input,
    "docs/issues/board.md",
    input.expectedHeadSha,
  );
  const archiveLink = `../archive/${archive.stem}.md`;
  assert(board.includes(archiveLink) && board.indexOf(archiveLink) > board.indexOf("## Closed"),
    "看板必须在 Closed 区引用归档摘要");

  const projectState = await readTextFile(
    request,
    input,
    "docs/memory/project-state.md",
    input.expectedHeadSha,
  );
  const activeLine = projectState.split(/\r?\n/).find((line) => line.startsWith("- 活动工作项："));
  assert(activeLine && !activeLine.includes(archive.workItemId),
    "项目状态仍把归档 Work Item 标为活动项");

  await assertMissingFile(request, input, archive.issuePath);
  if (archive.planPath) await assertMissingFile(request, input, archive.planPath);
}

async function validateRequiredChecks(request, input) {
  const payload = await request(
    "GET",
    `/repos/${input.repository}/commits/${input.expectedHeadSha}/check-runs?per_page=100`,
    { token: input.token },
  );
  assert(Array.isArray(payload?.check_runs), "无法读取 Head Check Runs");
  for (const name of REQUIRED_CHECKS) {
    const latest = payload.check_runs
      .filter((check) => check.name === name && check.app?.id === GITHUB_ACTIONS_APP_ID)
      .sort((left, right) => right.id - left.id)[0];
    assert(latest?.status === "completed" && latest.conclusion === "success"
      && latest.head_sha === input.expectedHeadSha, `必需检查未成功：${name}`);
  }
}

function latestBotApproval(reviews, expectedHeadSha) {
  assert(Array.isArray(reviews), "无法读取 PR Reviews");
  return reviews
    .filter((review) => review.user?.login === BOT_LOGIN
      && review.state === "APPROVED" && review.commit_id === expectedHeadSha)
    .sort((left, right) => right.id - left.id)[0];
}

async function readTextFile(request, input, relativePath, ref) {
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  const payload = await request(
    "GET",
    `/repos/${input.repository}/contents/${encoded}?ref=${ref}`,
    { token: input.token },
  );
  assert(payload?.type === "file" && payload.encoding === "base64"
    && Number.isSafeInteger(payload.size) && payload.size <= 20_000,
  `归档控制文件无效：${relativePath}`);
  const content = Buffer.from(payload.content, "base64").toString("utf8");
  assert(!content.includes("\u0000"), `归档控制文件不是纯文本：${relativePath}`);
  return content;
}

async function assertMissingFile(request, input, relativePath) {
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  const payload = await request(
    "GET",
    `/repos/${input.repository}/contents/${encoded}?ref=${input.expectedHeadSha}`,
    { token: input.token, allowNotFound: true },
  );
  assert(payload === undefined, `活动文件仍存在：${relativePath}`);
}

async function githubRequest(method, pathname, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${options.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "deeptrail-archive-pr-finalizer",
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

function workItemIdFromStem(stem) {
  const match = /^(bug-\d{8}-\d{3}|task-[a-z0-9]+-\d{3})-/.exec(stem);
  assert(match, "归档文件名缺少 Work Item ID");
  return match[1].toUpperCase();
}

function required(value, name) {
  assert(typeof value === "string" && value.trim().length > 0, `${name} 不能为空`);
  return value.trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/github/archive-pr-finalizer.mjs")) {
  finalizeArchivePullRequest().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
