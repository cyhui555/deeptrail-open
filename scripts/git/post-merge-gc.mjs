import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { formatError, LoopGatewayError } from "../loop/errors.mjs";
import { runProcess } from "../loop/process.mjs";

const EXPECTED_REPOSITORY = "cyhui555/deeptrail-open";
const BASE_BRANCH = "main";
const DEFAULT_MIN_AGE_HOURS = 24;
const fullShaPattern = /^[a-f0-9]{40}$/;
const shortLivedBranchPattern = /^(?:agent|automation|bug|fix)\/[a-z0-9][a-z0-9._/-]{1,98}[a-z0-9]$/;

export function parsePostMergeGcArgs(rawArgs) {
  const args = rawArgs.filter((item) => item !== "--");
  const options = {
    pullRequest: null,
    expectedHead: null,
    apply: false,
    removeWorktrees: false,
    includeAliases: [],
    minAgeHours: DEFAULT_MIN_AGE_HOURS,
  };
  const seen = new Set();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") {
      assert(!seen.has(argument), "USAGE", "--apply 不能重复");
      seen.add(argument);
      options.apply = true;
      continue;
    }
    if (argument === "--remove-worktrees") {
      assert(!seen.has(argument), "USAGE", "--remove-worktrees 不能重复");
      seen.add(argument);
      options.removeWorktrees = true;
      continue;
    }

    const value = args[index + 1];
    assert(value !== undefined, "USAGE", `${argument} 缺少值`);
    index += 1;
    if (argument === "--pr") {
      assert(!seen.has(argument) && /^[1-9]\d*$/.test(value),
        "USAGE", "--pr 必须是唯一的正整数");
      seen.add(argument);
      options.pullRequest = Number(value);
    } else if (argument === "--expected-head") {
      assert(!seen.has(argument) && fullShaPattern.test(value),
        "USAGE", "--expected-head 必须是唯一的 40 位小写 Commit SHA");
      seen.add(argument);
      options.expectedHead = value;
    } else if (argument === "--include-alias") {
      validateShortLivedBranch(value, "--include-alias");
      assert(!options.includeAliases.includes(value), "USAGE", `重复别名：${value}`);
      options.includeAliases.push(value);
    } else if (argument === "--min-age-hours") {
      assert(!seen.has(argument) && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value),
        "USAGE", "--min-age-hours 必须是唯一的非负数");
      seen.add(argument);
      options.minAgeHours = Number(value);
      assert(Number.isFinite(options.minAgeHours) && options.minAgeHours <= 24 * 365,
        "USAGE", "--min-age-hours 超出允许范围");
    } else {
      throw new LoopGatewayError("USAGE", `未知参数：${argument}`);
    }
  }

  assert(Number.isSafeInteger(options.pullRequest), "USAGE", usage());
  assert(!options.removeWorktrees || options.apply,
    "USAGE", "--remove-worktrees 只能与 --apply 一起使用");
  assert(!options.apply || options.expectedHead,
    "USAGE", "--apply 必须显式提供 --expected-head <40位SHA>");
  return options;
}

export function parseAuditSource(body, expectedHead) {
  if (typeof body !== "string" || !fullShaPattern.test(expectedHead ?? "")) return null;
  const matches = [...body.matchAll(/^- Source: `([^`@]+)@([a-f0-9]{40})`[ \t]*$/gm)];
  if (matches.length !== 1) return null;
  const [, branch, sha] = matches[0];
  if (!branch.startsWith("agent/") || !isShortLivedBranch(branch) || sha !== expectedHead) return null;
  return { branch, sha };
}

export async function collectPostMergeFacts(options, dependencies = {}) {
  const run = dependencies.run ?? runProcess;
  const workingDirectory = dependencies.cwd ?? process.cwd();
  const repositoryRoot = (await checked(run, "git", ["rev-parse", "--show-toplevel"], {
    cwd: workingDirectory,
  }, "读取 Git 根目录")).trim();
  const gitCommonDir = (await checked(run, "git", [
    "rev-parse", "--path-format=absolute", "--git-common-dir",
  ], { cwd: repositoryRoot }, "读取 Git Common Dir")).trim();
  const remote = (await checked(run, "git", ["remote", "get-url", "origin"], {
    cwd: repositoryRoot,
  }, "读取 origin")).trim();
  const repository = normalizeGitHubRepository(remote);
  assert(repository === EXPECTED_REPOSITORY, "REPOSITORY_MISMATCH",
    `只允许清理 ${EXPECTED_REPOSITORY}`);

  const pullRequestRaw = await checkedJson(run, "gh", [
    "pr", "view", String(options.pullRequest), "--repo", repository,
    "--json", [
      "number", "state", "isDraft", "mergedAt", "headRefName", "headRefOid",
      "baseRefName", "mergeCommit", "body", "url", "closingIssuesReferences",
    ].join(","),
  ], { cwd: repositoryRoot }, "读取 Pull Request");
  const pullRequest = normalizePullRequest(pullRequestRaw);
  const auditSource = parseAuditSource(pullRequestRaw.body, pullRequest.headSha);

  const remoteHeads = parseRemoteHeads(await checked(run, "git", [
    "ls-remote", "--heads", "origin",
  ], { cwd: repositoryRoot }, "读取实时远端分支"));
  const localBranches = parseLocalBranches(await checked(run, "git", [
    "for-each-ref", "refs/heads", "--format=%(refname:short)%09%(objectname)",
  ], { cwd: repositoryRoot }, "读取本地分支"));
  const worktrees = parseWorktrees(await checked(run, "git", [
    "worktree", "list", "--porcelain",
  ], { cwd: repositoryRoot }, "读取 linked worktree"));

  const candidateBranches = unique([
    pullRequest.headBranch,
    ...(auditSource ? [auditSource.branch] : []),
    ...options.includeAliases,
  ]);
  const currentDirectory = normalizePath(await realpath(repositoryRoot));
  for (const worktree of worktrees) {
    if (!worktree.branch || !candidateBranches.includes(worktree.branch)) continue;
    const status = await checked(run, "git", [
      "status", "--porcelain=v1", "-z", "--untracked-files=all",
    ], { cwd: worktree.path }, `检查 worktree ${worktree.branch}`);
    worktree.dirty = status.length > 0;
    worktree.current = normalizePath(await realpath(worktree.path)) === currentDirectory;
  }

  const openPullRequests = {};
  for (const branch of candidateBranches) {
    validateShortLivedBranch(branch, "候选分支");
    const open = await checkedJson(run, "gh", [
      "pr", "list", "--repo", repository, "--state", "open", "--head", branch,
      "--json", "number,headRefName,url",
    ], { cwd: repositoryRoot }, `检查 ${branch} 的 Open PR`);
    openPullRequests[branch] = open.map((item) => ({
      number: item.number,
      url: item.url,
    }));
  }

  const sourceStatus = await checked(run, "git", [
    "status", "--porcelain=v1", "-z", "--untracked-files=all",
  ], { cwd: repositoryRoot }, "检查调用工作树");
  const sourceHead = (await checked(run, "git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
  }, "读取调用工作树 HEAD")).trim();
  const originMain = (await checked(run, "git", ["rev-parse", `refs/remotes/origin/${BASE_BRANCH}`], {
    cwd: repositoryRoot,
  }, "读取 origin/main")).trim();
  const remoteMain = remoteHeads[BASE_BRANCH];
  assert(fullShaPattern.test(remoteMain ?? ""), "REMOTE_MAIN_MISSING", "实时远端 main 不存在");
  let mergeReachable = false;
  if (pullRequest.mergeCommit) {
    const mergeReachability = await run("git", [
      "merge-base", "--is-ancestor", pullRequest.mergeCommit, remoteMain,
    ], { cwd: repositoryRoot, timeoutMs: 30_000 });
    assert([0, 1].includes(mergeReachability.code),
      "PROCESS_FAILED", "无法核验 merge commit 与 main 的祖先关系");
    mergeReachable = mergeReachability.code === 0;
  }

  return {
    repository,
    repositoryRoot,
    gitCommonDir,
    pullRequest,
    auditSource,
    remoteHeads,
    localBranches,
    worktrees,
    openPullRequests,
    invocation: {
      clean: sourceStatus.length === 0,
      head: sourceHead,
      originMain,
      remoteMain,
      mergeReachable,
    },
  };
}

export function buildPostMergePlan(facts, options, now = new Date()) {
  validateFacts(facts);
  const blockers = [];
  const pullRequest = facts.pullRequest;
  if (pullRequest.state !== "MERGED" || !pullRequest.mergedAt) {
    blockers.push(reason("pr-not-merged", "PR 尚未合并"));
  }
  if (pullRequest.baseBranch !== BASE_BRANCH) {
    blockers.push(reason("base-branch-mismatch", `PR base 不是 ${BASE_BRANCH}`));
  }
  if (!facts.invocation.clean) blockers.push(reason("invocation-dirty", "调用工作树不是 clean"));
  if (facts.invocation.originMain !== facts.invocation.remoteMain) {
    blockers.push(reason("origin-main-stale", "本地 origin/main 与实时远端 main 不一致，请先 fetch --prune"));
  }
  if (facts.invocation.head !== facts.invocation.remoteMain) {
    blockers.push(reason("invocation-not-main", "调用工作树未精确位于实时 main"));
  }
  if (!facts.invocation.mergeReachable) {
    blockers.push(reason("merge-not-reachable", "PR merge commit 不是实时 main 的祖先"));
  }
  if (!options.expectedHead) {
    blockers.push(reason("expected-head-required", "apply 必须绑定完整 PR head SHA"));
  } else if (options.expectedHead !== pullRequest.headSha) {
    blockers.push(reason("expected-head-mismatch", "显式 head SHA 与 PR head 不一致"));
  }

  const mergedAt = Date.parse(pullRequest.mergedAt ?? "");
  const ageHours = Number.isFinite(mergedAt) ? (now.getTime() - mergedAt) / 3_600_000 : -1;
  if (ageHours < options.minAgeHours) {
    blockers.push(reason("retention-window", `PR 合并未满 ${options.minAgeHours} 小时`));
  }

  const specs = uniqueCandidateSpecs([
    { branch: pullRequest.headBranch, role: "pr-head" },
    ...(facts.auditSource ? [{ branch: facts.auditSource.branch, role: "audit-source" }] : []),
    ...options.includeAliases.map((branch) => ({ branch, role: "explicit-alias" })),
  ]);
  const candidates = specs.map((spec) => buildCandidate(facts, options, spec));
  const candidateNames = new Set(candidates.map(({ branch }) => branch));
  const sameShaAliases = Object.entries(facts.remoteHeads)
    .filter(([branch, sha]) => branch !== BASE_BRANCH
      && sha === pullRequest.headSha
      && !candidateNames.has(branch))
    .map(([branch]) => ({ branch, disposition: "manual-review" }))
    .sort((left, right) => left.branch.localeCompare(right.branch));
  const actions = candidates.flatMap(({ actions }) => actions)
    .sort((left, right) => actionRank(left.type) - actionRank(right.type)
      || left.branch.localeCompare(right.branch));
  const candidateBlockers = candidates.flatMap(({ branch, blockers: items }) =>
    items.map((item) => ({ branch, ...item })));
  const readyForApply = blockers.length === 0 && candidateBlockers.length === 0 && actions.length > 0;

  return {
    schemaVersion: 1,
    operation: "post-merge-gc",
    mode: options.apply ? "apply" : "dry-run",
    generatedAt: now.toISOString(),
    repository: facts.repository,
    repositoryRoot: facts.repositoryRoot,
    gitCommonDir: facts.gitCommonDir,
    pullRequest: {
      number: pullRequest.number,
      url: pullRequest.url,
      state: pullRequest.state,
      baseBranch: pullRequest.baseBranch,
      headBranch: pullRequest.headBranch,
      headSha: pullRequest.headSha,
      mergeCommit: pullRequest.mergeCommit,
      mergedAt: pullRequest.mergedAt,
      closingIssues: pullRequest.closingIssues,
    },
    retention: {
      minimumHours: options.minAgeHours,
      ageHours: Math.max(0, Number(ageHours.toFixed(3))),
    },
    invocation: { ...facts.invocation },
    removeWorktrees: options.removeWorktrees,
    blockers,
    candidates,
    sameShaAliases,
    actions,
    summary: {
      candidates: candidates.length,
      eligible: candidates.filter(({ disposition }) => disposition === "eligible").length,
      blocked: candidates.filter(({ disposition }) => disposition === "blocked").length,
      absent: candidates.filter(({ disposition }) => disposition === "absent").length,
      actions: actions.length,
      sameShaAliases: sameShaAliases.length,
    },
    readyForApply,
    writesPerformed: false,
  };
}

export async function applyPostMergePlan(plan, dependencies = {}) {
  assert(plan?.mode === "apply" && plan.readyForApply === true,
    "POST_MERGE_GC_BLOCKED", "计划未通过 apply 门禁", {
      blockers: plan?.blockers ?? [],
      candidates: plan?.candidates?.map(({ branch, blockers }) => ({ branch, blockers })) ?? [],
    });
  const run = dependencies.run ?? runProcess;
  const receiptRoot = dependencies.receiptRoot
    ?? path.join(plan.gitCommonDir, "deeptrail-gc-receipts");
  await mkdir(receiptRoot, { recursive: true, mode: 0o700 });
  const receiptPath = path.join(receiptRoot,
    `${safeTimestamp(plan.generatedAt)}-pr-${plan.pullRequest.number}-${randomUUID()}.jsonl`);
  const planDigest = sha256(JSON.stringify(plan));
  const startedAt = new Date().toISOString();
  await writeReceiptEvent(receiptPath, {
    schemaVersion: 1,
    phase: "prepared",
    operation: plan.operation,
    repository: plan.repository,
    pullRequest: plan.pullRequest.number,
    expectedHead: plan.pullRequest.headSha,
    planDigest,
    startedAt,
    actions: plan.actions,
  }, true);

  const failedBranches = new Set();
  const results = [];
  for (const action of plan.actions) {
    if (failedBranches.has(action.branch)) {
      const skipped = { ...action, status: "skipped", reason: "previous-action-failed" };
      results.push(skipped);
      await writeReceiptEvent(receiptPath, { phase: "action", ...skipped });
      continue;
    }
    const result = await executeAction(run, plan.repositoryRoot, action);
    results.push(result);
    await writeReceiptEvent(receiptPath, { phase: "action", ...result });
    if (result.status === "failed") failedBranches.add(action.branch);
  }

  const failed = results.filter(({ status }) => status === "failed");
  const completedAt = new Date().toISOString();
  const phase = failed.length === 0 ? "completed" : "partial";
  await writeReceiptEvent(receiptPath, {
    phase,
    completedAt,
    succeeded: results.filter(({ status }) => status === "succeeded").length,
    failed: failed.length,
    skipped: results.filter(({ status }) => status === "skipped").length,
  });
  return {
    ...plan,
    writesPerformed: true,
    ok: failed.length === 0,
    outcome: phase,
    receiptPath,
    results,
  };
}

export async function runPostMergeGc(options, dependencies = {}) {
  const facts = await collectPostMergeFacts(options, dependencies);
  const plan = buildPostMergePlan(facts, options, dependencies.now ?? new Date());
  if (!options.apply) return plan;
  return await applyPostMergePlan(plan, dependencies);
}

function buildCandidate(facts, options, spec) {
  validateShortLivedBranch(spec.branch, "候选分支");
  const expected = facts.pullRequest.headSha;
  const remoteSha = facts.remoteHeads[spec.branch] ?? null;
  const localSha = facts.localBranches[spec.branch] ?? null;
  const worktrees = facts.worktrees.filter(({ branch }) => branch === spec.branch);
  const blockers = [];
  if ((facts.openPullRequests[spec.branch] ?? []).length > 0) {
    blockers.push(reason("open-pr", "分支仍被 Open PR 引用"));
  }
  if (remoteSha && remoteSha !== expected) blockers.push(reason("remote-sha-drift", "远端分支 SHA 已漂移"));
  if (localSha && localSha !== expected) blockers.push(reason("local-sha-drift", "本地分支 SHA 已漂移"));
  for (const worktree of worktrees) {
    if (worktree.head !== expected) blockers.push(reason("worktree-sha-drift", "worktree HEAD 已漂移"));
    if (worktree.dirty) blockers.push(reason("dirty-worktree", `worktree 非 clean：${worktree.path}`));
    if (worktree.current) blockers.push(reason("current-worktree", "不能移除当前调用 worktree"));
  }
  if (worktrees.length > 0 && !options.removeWorktrees) {
    blockers.push(reason("worktree-removal-not-approved", "分支仍被 worktree 占用，缺少 --remove-worktrees"));
  }

  const actions = [];
  if (blockers.length === 0) {
    for (const worktree of worktrees) {
      actions.push({ type: "remove-worktree", branch: spec.branch, path: worktree.path, beforeSha: expected });
    }
    if (localSha) actions.push({ type: "delete-local-branch", branch: spec.branch, beforeSha: localSha });
    if (remoteSha) actions.push({ type: "delete-remote-branch", branch: spec.branch, beforeSha: remoteSha });
  }
  const disposition = blockers.length > 0 ? "blocked" : actions.length > 0 ? "eligible" : "absent";
  return {
    branch: spec.branch,
    role: spec.role,
    remoteSha,
    localSha,
    worktrees: worktrees.map(({ path: worktreePath, head, dirty, current }) => ({
      path: worktreePath, head, dirty: dirty ?? false, current: current ?? false,
    })),
    openPullRequests: facts.openPullRequests[spec.branch] ?? [],
    blockers,
    actions,
    disposition,
  };
}

async function executeAction(run, repositoryRoot, action) {
  let args;
  if (action.type === "remove-worktree") {
    const head = await run("git", ["rev-parse", "HEAD"], {
      cwd: action.path,
      timeoutMs: 30_000,
    });
    const status = await run("git", [
      "status", "--porcelain=v1", "-z", "--untracked-files=all",
    ], { cwd: action.path, timeoutMs: 30_000 });
    if (head.code !== 0 || head.stdout.trim() !== action.beforeSha
        || status.code !== 0 || status.stdout.length > 0) {
      return failedAction(action, "worktree 在 apply 前发生漂移");
    }
    args = ["worktree", "remove", "--", action.path];
  } else if (action.type === "delete-local-branch") {
    const head = await run("git", [
      "show-ref", "--verify", "--hash", `refs/heads/${action.branch}`,
    ], { cwd: repositoryRoot, timeoutMs: 30_000 });
    const worktrees = await run("git", ["worktree", "list", "--porcelain"], {
      cwd: repositoryRoot,
      timeoutMs: 30_000,
    });
    const occupied = worktrees.code === 0
      && parseWorktrees(worktrees.stdout).some(({ branch }) => branch === action.branch);
    if (head.code !== 0 || head.stdout.trim() !== action.beforeSha
        || worktrees.code !== 0 || occupied) {
      return failedAction(action, "本地分支在 apply 前发生漂移或仍被 worktree 占用");
    }
    args = ["branch", "-D", "--", action.branch];
  } else if (action.type === "delete-remote-branch") {
    // 删除使用 force-with-lease 绑定审计时 SHA；远端一旦漂移，Git 必须拒绝写入。
    args = [
      "push", `--force-with-lease=refs/heads/${action.branch}:${action.beforeSha}`,
      "origin", `:refs/heads/${action.branch}`,
    ];
  } else {
    throw new LoopGatewayError("ACTION_UNKNOWN", `未知 GC 动作：${action.type}`);
  }
  const result = await run("git", args, { cwd: repositoryRoot, timeoutMs: 120_000 });
  return {
    ...action,
    status: result.code === 0 ? "succeeded" : "failed",
    exitCode: result.code,
    ...(result.code === 0 ? {} : { error: `git ${action.type} 失败` }),
  };
}

function failedAction(action, error) {
  return { ...action, status: "failed", exitCode: 1, error };
}

function normalizePullRequest(raw) {
  const normalized = {
    number: raw?.number,
    state: raw?.state,
    draft: raw?.isDraft,
    mergedAt: raw?.mergedAt ?? null,
    headBranch: raw?.headRefName,
    headSha: raw?.headRefOid,
    baseBranch: raw?.baseRefName,
    mergeCommit: raw?.mergeCommit?.oid ?? null,
    url: raw?.url,
    closingIssues: (raw?.closingIssuesReferences ?? []).map((issue) => ({
      number: issue.number,
      state: issue.state,
      url: issue.url,
    })),
  };
  assert(Number.isSafeInteger(normalized.number)
      && typeof normalized.url === "string"
      && typeof normalized.state === "string"
      && typeof normalized.draft === "boolean"
      && fullShaPattern.test(normalized.headSha ?? "")
      && isShortLivedBranch(normalized.headBranch ?? "")
      && typeof normalized.baseBranch === "string",
  "PR_FACTS_INVALID", "GitHub PR 事实不完整或越界");
  if (normalized.mergeCommit !== null) {
    assert(fullShaPattern.test(normalized.mergeCommit), "PR_FACTS_INVALID", "PR merge commit 不合法");
  }
  return normalized;
}

function parseRemoteHeads(output) {
  const heads = {};
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^([a-f0-9]{40})\s+refs\/heads\/(.+)$/);
    assert(match, "REMOTE_FACTS_INVALID", "远端分支输出不合法");
    heads[match[2]] = match[1];
  }
  return heads;
}

function parseLocalBranches(output) {
  const branches = {};
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [branch, sha, ...extra] = line.split("\t");
    assert(extra.length === 0 && branch && fullShaPattern.test(sha ?? ""),
      "LOCAL_FACTS_INVALID", "本地分支输出不合法");
    branches[branch] = sha;
  }
  return branches;
}

function parseWorktrees(output) {
  return output.trim().split(/\r?\n\r?\n/).filter(Boolean).map((record) => {
    const facts = {};
    for (const line of record.split(/\r?\n/)) {
      const separator = line.indexOf(" ");
      if (separator === -1) {
        facts[line] = true;
        continue;
      }
      facts[line.slice(0, separator)] = line.slice(separator + 1);
    }
    assert(typeof facts.worktree === "string" && fullShaPattern.test(facts.HEAD ?? ""),
      "WORKTREE_FACTS_INVALID", "worktree 输出不合法");
    return {
      path: facts.worktree,
      head: facts.HEAD,
      branch: facts.branch?.replace(/^refs\/heads\//, "") ?? null,
      detached: Object.hasOwn(facts, "detached"),
      dirty: false,
      current: false,
    };
  });
}

function validateFacts(facts) {
  assert(facts?.repository === EXPECTED_REPOSITORY
      && fullShaPattern.test(facts?.pullRequest?.headSha ?? "")
      && typeof facts?.repositoryRoot === "string"
      && typeof facts?.gitCommonDir === "string",
  "GC_FACTS_INVALID", "Post-merge GC 事实不完整");
}

function validateShortLivedBranch(branch, label) {
  assert(isShortLivedBranch(branch), "BRANCH_DENIED", `${label} 不是允许的短期分支：${branch}`);
}

function isShortLivedBranch(branch) {
  return typeof branch === "string"
    && shortLivedBranchPattern.test(branch)
    && !branch.includes("..")
    && !branch.includes("//")
    && !branch.includes("@{")
    && !branch.endsWith(".lock");
}

function normalizeGitHubRepository(remote) {
  return remote.trim()
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/^ssh:\/\/git@github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "");
}

async function checked(run, command, args, options, label) {
  const result = await run(command, args, { ...options, timeoutMs: options.timeoutMs ?? 30_000 });
  if (result.code !== 0) {
    throw new LoopGatewayError("PROCESS_FAILED", `${label}失败（exit ${result.code}）`, {
      command,
      exitCode: result.code,
    });
  }
  return result.stdout;
}

async function checkedJson(run, command, args, options, label) {
  const output = await checked(run, command, args, options, label);
  try {
    return JSON.parse(output);
  } catch {
    throw new LoopGatewayError("REMOTE_JSON_INVALID", `${label}返回无效 JSON`);
  }
}

async function writeReceiptEvent(receiptPath, event, first = false) {
  const line = `${JSON.stringify(event)}\n`;
  if (first) {
    await writeFile(receiptPath, line, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } else {
    await appendFile(receiptPath, line, { encoding: "utf8" });
  }
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueCandidateSpecs(specs) {
  const seen = new Set();
  return specs.filter(({ branch }) => {
    if (seen.has(branch)) return false;
    seen.add(branch);
    return true;
  });
}

function actionRank(type) {
  return { "remove-worktree": 0, "delete-local-branch": 1, "delete-remote-branch": 2 }[type] ?? 99;
}

function reason(code, message) {
  return { code, message };
}

function normalizePath(value) {
  const normalized = path.resolve(value).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function safeTimestamp(value) {
  return value.replace(/[^0-9TZ]/g, "-");
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function usage() {
  return "用法：pnpm git:closeout -- --pr <number> [--expected-head <40位SHA>] "
    + "[--include-alias <branch>] [--min-age-hours <hours>] "
    + "[--apply [--remove-worktrees]]";
}

function assert(condition, code, message, details = undefined) {
  if (!condition) throw new LoopGatewayError(code, message, details);
}

async function main() {
  const options = parsePostMergeGcArgs(process.argv.slice(2));
  const result = await runPostMergeGc(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.writesPerformed && result.ok === false) process.exitCode = 2;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/git/post-merge-gc.mjs")) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(formatError(error), null, 2)}\n`);
    process.exitCode = 1;
  });
}
