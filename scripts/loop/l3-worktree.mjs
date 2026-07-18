import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import {
  assertDisjoint,
  assertOutside,
  canonicalizePlannedPath,
  sha256,
  toPortablePath
} from "./fs-safe.mjs";
import { readGitState } from "./git-state.mjs";
import { loadL3ChangePlan, loadL3Policy, validateL3Policy } from "./l3-plan.mjs";
import { requireSuccess, runProcess } from "./process.mjs";
import { sanitizedEnvironment } from "./runtime.mjs";
import { treeDigest } from "./tree.mjs";

export async function resolveL3Paths(config, env = process.env) {
  const requested = env.DEEPTRAIL_LOOP_MUTATION_ROOT;
  if (!requested || !path.isAbsolute(requested)) {
    throw new LoopGatewayError(
      "L3_MUTATION_ROOT_MISSING",
      "必须显式设置绝对路径 DEEPTRAIL_LOOP_MUTATION_ROOT"
    );
  }
  const mutationRoot = await canonicalizePlannedPath(requested, "L3 Mutation Root");
  const proposalRoot = await canonicalizePlannedPath(
    path.join(config.loopHome, "proposals"), "L3 Proposal Root"
  );
  assertOutside(config.repoRoot, mutationRoot, "L3 Mutation Root");
  assertDisjoint(config.loopHome, mutationRoot, ["DEEPTRAIL_LOOP_HOME", "L3 Mutation Root"]);
  if (config.backupRoot) {
    assertDisjoint(config.backupRoot, mutationRoot, ["Backup Root", "L3 Mutation Root"]);
  }
  return { mutationRoot, proposalRoot };
}

export async function preflightL3Change(config, options = {}) {
  const policy = validateL3Policy(options.policy ?? await loadL3Policy());
  const paths = await resolveL3Paths(config, options.env);
  const loaded = await loadL3ChangePlan(options.planFile, paths.proposalRoot, policy);
  const { plan } = loaded;
  const sourceBefore = await readGitState(config);
  assert(sourceBefore.gitStatus.length === 0,
    "L3_SOURCE_DIRTY", "L3 只接受 clean 的规范源工作树");
  const repositoryBefore = await readL3RepositoryControls(config.repoRoot);

  const remote = (await git(config.repoRoot, ["remote", "get-url", "origin"], "读取 origin")).trim();
  assert(normalizeGitHubRepository(remote) === policy.repository,
    "L3_REMOTE_MISMATCH", `origin 不是 ${policy.repository}`);
  const localBase = (await git(config.repoRoot, [
    "rev-parse", `refs/remotes/origin/${policy.baseBranch}`
  ], "读取 origin/main")).trim();
  const remoteBaseLine = (await git(config.repoRoot, [
    "ls-remote", "origin", `refs/heads/${policy.baseBranch}`
  ], "核对远程 main")).trim();
  const remoteBase = remoteBaseLine.split(/\s+/, 1)[0];
  assert(localBase === plan.baseRevision && remoteBase === plan.baseRevision,
    "L3_BASE_STALE", "ChangePlan baseRevision 不等于本地与远程 origin/main");
  let approval = null;
  if (policy.activation.enabled) {
    const verifyApproval = options.verifyApproval ?? defaultApprovalVerifier;
    approval = validateL3ApprovalEvidence(policy, await verifyApproval(policy));
    assert(await gitSucceeds(config.repoRoot, [
      "merge-base", "--is-ancestor", policy.activation.mergedRevision, plan.baseRevision
    ]), "L3_ADMISSION_REVISION_INVALID", "L3 准入合入 Revision 不是 ChangePlan 基线祖先");
  }

  const workItem = await git(config.repoRoot, [
    "show", `${plan.baseRevision}:${plan.workItem}`
  ], "读取基线 Work Item");
  assert(new RegExp(`^#\\s+${escapeRegExp(plan.workItemId)}\\b`, "m").test(workItem),
    "L3_WORK_ITEM_REVISION_MISMATCH", "基线 Work Item 标题 ID 与 ChangePlan 不一致");
  assert(!(await gitSucceeds(config.repoRoot, [
    "show-ref", "--verify", `refs/heads/${plan.sourceBranch}`
  ])), "L3_BRANCH_EXISTS", `本地分支已存在：${plan.sourceBranch}`);
  for (const branch of [plan.sourceBranch, plan.pullRequest.targetBranch]) {
    const found = await git(config.repoRoot, [
      "ls-remote", "--heads", "origin", `refs/heads/${branch}`
    ], "检查远程 L3 分支");
    assert(!found.trim(), "L3_BRANCH_EXISTS", `远程分支已存在：${branch}`);
  }

  const verifyCohort = options.verifyCohort ?? defaultCohortVerifier;
  const cohort = await verifyCohort(config);
  assert(cohort.report?.cohortReady === true,
    "L3_L2_COHORT_NOT_READY", "L3 前置 L2 Cohort 未通过");
  if (policy.activation.enabled) {
    assert(cohort.digest === policy.activation.l2CohortDigest,
      "L3_L2_COHORT_DRIFT", "当前严格 L2 Cohort 与 L3 activation 摘要不一致");
  }

  return {
    policy,
    paths,
    ...loaded,
    remoteUrl: remote,
    sourceBefore,
    repositoryBefore,
    approval,
    cohortDigest: cohort.digest,
    planDigest: canonicalSha256(plan),
    patchDigest: sha256(loaded.patch)
  };
}

export async function stageL3Change(config, options) {
  return await stagePreparedL3Change(config, await preflightL3Change(config, options), options);
}

export async function stagePreparedL3Change(config, context, options = {}) {
  const { policy, plan, patchFile, paths, sourceBefore, repositoryBefore } = context;
  assert(policy.stage === "l3a-draft-pr" && policy.activation.enabled === true
      && policy.permissions.isolatedWorktreeMutation === true
      && policy.permissions.localCommit === true,
    "L3_MUTATION_DISABLED", "L3 Worktree Mutation 尚未由受保护准入合同启用");

  await mkdir(paths.mutationRoot, { recursive: true });
  const mutationInfo = await lstat(paths.mutationRoot);
  const mutationReal = await realpath(paths.mutationRoot);
  assert(mutationInfo.isDirectory() && !mutationInfo.isSymbolicLink()
      && path.relative(paths.mutationRoot, mutationReal) === "",
    "L3_MUTATION_ROOT_DRIFT", "L3 Mutation Root 在预检后发生漂移");
  const worktreePath = path.join(paths.mutationRoot,
    `${plan.changeId}-${plan.baseRevision.slice(0, 12)}`);
  const runtimePath = `${worktreePath}-runtime`;
  assert(!(await lstat(worktreePath).catch(() => null)),
    "L3_WORKTREE_EXISTS", `L3 Worktree 已存在，必须先按恢复流程核验：${worktreePath}`);
  assert(!(await lstat(runtimePath).catch(() => null)),
    "L3_RUNTIME_EXISTS", `L3 Runtime 已存在，必须先按恢复流程核验：${runtimePath}`);

  let worktreeCreated = false;
  let runtimeCreated = false;
  try {
    await mkdir(path.join(runtimePath, "hooks"), { recursive: true });
    runtimeCreated = true;
    await git(config.repoRoot, [
      "-c", `core.hooksPath=${path.join(runtimePath, "hooks")}`,
      "worktree", "add", "--detach", "--", worktreePath, plan.baseRevision
    ], "创建隔离 L3 Worktree", 120_000);
    worktreeCreated = true;
    await git(worktreePath, [
      "apply", "--check", "--whitespace=error-all", "--", patchFile
    ], "预检 L3 Patch", 120_000);
    await git(worktreePath, [
      "apply", "--index", "--whitespace=error-all", "--", patchFile
    ], "应用 L3 Patch", 120_000);

    const diff = await inspectStagedDiff(worktreePath, policy);
    assert(canonicalSha256(diff.changedPaths) === canonicalSha256(plan.patch.changedPaths),
      "L3_PATCH_PATH_MISMATCH", "Patch 实际改动路径与 ChangePlan 不一致");
    await git(worktreePath, ["diff", "--cached", "--check"], "检查 L3 Patch 空白错误");
    await git(worktreePath, [
      "-c", `core.hooksPath=${path.join(runtimePath, "hooks")}`,
      "-c", "user.name=Deeptrail Loop L3",
      "-c", "user.email=loop-l3@users.noreply.github.com",
      "-c", "commit.gpgSign=false",
      "commit", "--no-verify", "--no-gpg-sign", "-m", plan.commitMessage
    ], "创建隔离 L3 Commit", 120_000);
    const commit = (await git(worktreePath, ["rev-parse", "HEAD"], "读取 L3 Commit")).trim();
    const tree = (await git(worktreePath, ["rev-parse", "HEAD^{tree}"], "读取 L3 Tree")).trim();

    const verifyProfile = options.verifyProfile ?? defaultProfileVerifier;
    const verification = await verifyProfile({
      config, policy, plan, worktreePath, runtimePath
    });
    const staged = {
      ok: true,
      operation: "l3:stage",
      published: false,
      planDigest: context.planDigest,
      patchDigest: context.patchDigest,
      cohortDigest: context.cohortDigest,
      worktreePath,
      runtimePath,
      sourceBranch: plan.sourceBranch,
      targetBranch: plan.pullRequest.targetBranch,
      baseRevision: plan.baseRevision,
      commit,
      tree,
      diff,
      verification,
      permissions: policy.permissions
    };
    await verifyStagedL3State(staged);
    await assertSourceUnchanged(config, sourceBefore);
    await assertRepositoryControlsUnchanged(config.repoRoot, repositoryBefore);
    return staged;
  } catch (error) {
    if ((worktreeCreated || runtimeCreated) && error && typeof error === "object") {
      error.details = {
        ...(error.details ?? {}),
        recovery: {
          worktreePath,
          runtimePath,
          worktreeCreated,
          runtimeCreated,
          preserved: policy.failurePolicy.preserveWorktree
        }
      };
    }
    throw error;
  }
}

export async function publishL3Draft(config, context, staged, options = {}) {
  const { policy, plan } = context;
  validateL3Policy(policy);
  assert(policy.stage === "l3a-draft-pr" && policy.activation.enabled === true
      && policy.permissions.remoteBranchPush === true
      && policy.permissions.draftPullRequest === true
      && policy.permissions.autoApprove === false
      && policy.permissions.autoMerge === false
      && policy.permissions.autoDeploy === false,
    "L3_PUBLISH_DISABLED", "L3 Draft PR 发布尚未由受保护准入合同启用");
  await verifyStagedL3State(staged);

  let pushed = false;
  try {
    const disabledHooksPath = path.join(staged.runtimePath, `hooks-disabled-${randomUUID()}`);
    assert(!(await lstat(disabledHooksPath).catch(() => null)),
      "L3_PUSH_HOOK_PATH_EXISTS", "L3 Push 的一次性禁用 Hook 路径已存在");
    await git(staged.worktreePath, [
      "-c", `core.hooksPath=${disabledHooksPath}`,
      "push", "--porcelain", context.remoteUrl ?? "origin",
      `${staged.commit}:refs/heads/${plan.sourceBranch}`
    ], "推送 L3 短期源分支", 120_000);
    pushed = true;
    const publish = options.createDraftPullRequest ?? defaultDraftPullRequestPublisher;
    const pullRequest = await publish({ config, policy, plan, staged });
    assert(pullRequest?.draft === true && pullRequest.author === "github-actions[bot]"
        && pullRequest.head === plan.pullRequest.targetBranch
        && pullRequest.base === plan.baseBranch
        && pullRequest.commit === staged.commit
        && isExpectedPullRequestUrl(pullRequest.url),
      "L3_PR_IDENTITY_INVALID", "远程 Pull Request 的 Draft、作者或分支身份不合法");
    await assertSourceUnchanged(config, context.sourceBefore);
    await assertRepositoryControlsUnchanged(config.repoRoot, context.repositoryBefore);
    return {
      ok: true,
      operation: "l3:publish-draft",
      published: true,
      sourceBranch: plan.sourceBranch,
      targetBranch: plan.pullRequest.targetBranch,
      commit: staged.commit,
      pullRequest,
      autoApprove: false,
      autoMerge: false,
      autoDeploy: false
    };
  } catch (error) {
    if (error && typeof error === "object") {
      error.details = {
        ...(error.details ?? {}),
        recovery: {
          worktreePath: staged.worktreePath,
          commit: staged.commit,
          sourceBranch: plan.sourceBranch,
          targetBranch: plan.pullRequest.targetBranch,
          pushed,
          preserved: true
        }
      };
    }
    throw error;
  }
}

export async function executeL3Draft(config, options) {
  const context = await preflightL3Change(config, options);
  const staged = await stagePreparedL3Change(config, context, options);
  const published = await publishL3Draft(config, context, staged, options);
  return { context, staged, published };
}

export async function verifyStagedL3State(staged) {
  assert(staged?.ok === true && staged.published === false,
    "L3_STAGE_RECEIPT_INVALID", "缺少已验证且未发布的 L3 Stage 结果");
  const info = await lstat(staged.worktreePath).catch(() => null);
  assert(info?.isDirectory() && !info.isSymbolicLink(),
    "L3_STAGE_WORKTREE_MISSING", "L3 Stage Worktree 不存在或类型非法");
  const runtimeInfo = await lstat(staged.runtimePath).catch(() => null);
  assert(runtimeInfo?.isDirectory() && !runtimeInfo.isSymbolicLink(),
    "L3_STAGE_RUNTIME_MISSING", "L3 Stage 隔离 Runtime 不存在或类型非法");
  const commit = (await git(staged.worktreePath, ["rev-parse", "HEAD"], "复核 L3 Commit")).trim();
  const tree = (await git(staged.worktreePath, ["rev-parse", "HEAD^{tree}"], "复核 L3 Tree")).trim();
  const status = await git(staged.worktreePath, [
    "status", "--porcelain=v1", "--untracked-files=all"
  ], "复核 L3 Worktree");
  assert(commit === staged.commit && tree === staged.tree && status.length === 0,
    "L3_STAGE_DRIFT", "L3 Stage Commit、Tree 或 Worktree 已漂移");
  return { ok: true, commit, tree, worktreeClean: true };
}

export async function verifyPublishedL3State(staged, published, options = {}) {
  await verifyStagedL3State(staged);
  assert(published?.ok === true && published.published === true
      && published.commit === staged.commit
      && published.autoApprove === false
      && published.autoMerge === false
      && published.autoDeploy === false,
    "L3_PUBLISH_RECEIPT_INVALID", "L3 Publish 结果缺失或权限状态不合法");
  const verifyPullRequest = options.verifyPullRequest ?? defaultPullRequestVerifier;
  const pullRequest = await verifyPullRequest(published.pullRequest.url);
  assert(pullRequest.draft === true && pullRequest.author === "github-actions[bot]"
      && pullRequest.head === published.targetBranch && pullRequest.base === "main"
      && pullRequest.commit === staged.commit
      && isExpectedPullRequestUrl(pullRequest.url),
    "L3_PR_DRIFT", "L3 Pull Request 已非机器人 Draft 或分支身份漂移");
  return { ok: true, commit: staged.commit, pullRequest };
}

export function validateL3ApprovalEvidence(policy, evidence) {
  validateL3Policy(policy);
  const binding = parseApprovalUrl(policy.activation.approvalUrl);
  assert(policy.activation.enabled === true && evidence
      && evidence.approvalUrl === policy.activation.approvalUrl
      && evidence.pullRequest === binding.pullRequest
      && evidence.reviewId === binding.reviewId
      && evidence.author === policy.activation.humanApprover
      && evidence.state === "APPROVED"
      && evidence.reviewedRevision === policy.activation.approvedRevision
      && evidence.headRevision === policy.activation.approvedRevision
      && evidence.mergedRevision === policy.activation.mergedRevision
      && evidence.merged === true
      && evidence.baseBranch === policy.baseBranch,
    "L3_APPROVAL_EVIDENCE_INVALID",
    "L3 人工批准未绑定最终 Head、已合入 main 的 Revision 或固定所有者");
  return evidence;
}

export async function readL3RepositoryControls(repoRoot) {
  const commonRaw = (await git(repoRoot, [
    "rev-parse", "--path-format=absolute", "--git-common-dir"
  ], "读取 Git Common Dir")).trim();
  const commonDir = await realpath(path.resolve(repoRoot, commonRaw));
  const localConfig = await git(repoRoot, [
    "config", "--local", "--null", "--list"
  ], "读取本地 Git Config");
  return {
    commonDir,
    localConfigDigest: sha256(localConfig),
    hooksDigest: await treeDigest(path.join(commonDir, "hooks")),
    excludeDigest: await optionalFileDigest(path.join(commonDir, "info", "exclude")),
    attributesDigest: await optionalFileDigest(path.join(commonDir, "info", "attributes"))
  };
}

async function defaultCohortVerifier(config) {
  // 动态导入避免 operations -> L3 -> Cohort -> operations 的初始化环。
  const {
    cohortAdmissionDigest,
    loadL2CohortManifest,
    verifyRuntimeCohort
  } = await import("./l2-cohort.mjs");
  const report = await verifyRuntimeCohort(config, await loadL2CohortManifest());
  return { report, digest: cohortAdmissionDigest(report) };
}

async function defaultApprovalVerifier(policy) {
  const binding = parseApprovalUrl(policy.activation.approvalUrl);
  const env = sanitizedEnvironment({ NO_COLOR: "1" });
  const reviewResult = requireSuccess(await runProcess("gh", [
    "api", `repos/${policy.repository}/pulls/${binding.pullRequest}/reviews/${binding.reviewId}`
  ], { env, timeoutMs: 30_000, outputLimit: 1024 * 1024 }), "读取 L3 人工批准 Review");
  const pullResult = requireSuccess(await runProcess("gh", [
    "api", `repos/${policy.repository}/pulls/${binding.pullRequest}`
  ], { env, timeoutMs: 30_000, outputLimit: 1024 * 1024 }), "读取 L3 准入 Pull Request");
  let review;
  let pullRequest;
  try {
    review = JSON.parse(reviewResult.stdout);
    pullRequest = JSON.parse(pullResult.stdout);
  } catch (error) {
    throw new LoopGatewayError(
      "L3_APPROVAL_RESPONSE_INVALID", `GitHub 批准响应不是合法 JSON：${error.message}`
    );
  }
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
    baseBranch: pullRequest.base?.ref
  };
}

async function inspectStagedDiff(worktreePath, policy) {
  const names = (await git(worktreePath, [
    "diff", "--cached", "--name-only", "-z", "--no-renames", "--diff-filter=ACDMRTUXB"
  ], "读取 L3 Patch 路径")).split("\0").filter(Boolean).map(toPortablePath).sort();
  assert(names.length > 0 && names.length <= policy.budgets.maxChangedFiles,
    "L3_DIFF_FILE_BUDGET", "L3 Patch 文件数为空或超出预算");
  const typeChanges = await git(worktreePath, [
    "diff", "--cached", "--name-only", "--diff-filter=T"
  ], "检查 L3 文件类型变化");
  const summary = await git(worktreePath, ["diff", "--cached", "--summary"], "读取 L3 Diff Summary");
  assert(!typeChanges.trim() && !/(?:mode 120000|mode 160000|Subproject commit)/.test(summary),
    "L3_FILE_TYPE_DENIED", "L3 Patch 不允许 Symlink、Submodule 或文件类型变化");

  const numstat = await git(worktreePath, ["diff", "--cached", "--numstat"], "读取 L3 Diff 预算");
  let addedLines = 0;
  let deletedLines = 0;
  for (const line of numstat.split(/\r?\n/).filter(Boolean)) {
    const [added, deleted] = line.split("\t", 3);
    assert(/^\d+$/.test(added) && /^\d+$/.test(deleted),
      "L3_BINARY_PATCH_DENIED", "L3 Patch 不允许二进制变更");
    addedLines += Number(added);
    deletedLines += Number(deleted);
  }
  assert(addedLines <= policy.budgets.maxAddedLines
      && deletedLines <= policy.budgets.maxDeletedLines,
    "L3_DIFF_LINE_BUDGET", "L3 Patch 增删行数超出预算");
  for (const name of names) {
    const info = await lstat(path.join(worktreePath, ...name.split("/"))).catch(() => null);
    assert(!info || (info.isFile() && !info.isSymbolicLink()),
      "L3_FILE_TYPE_DENIED", `L3 目标不是普通文件：${name}`);
  }
  return { changedPaths: names, addedLines, deletedLines };
}

async function defaultProfileVerifier({ config, policy, plan, worktreePath, runtimePath }) {
  const commands = config.profiles?.[plan.profile];
  assert(Array.isArray(commands) && commands.length > 0,
    "L3_PROFILE_UNKNOWN", `未知 L3 Profile：${plan.profile}`);
  const pnpmEntry = process.env.npm_execpath;
  assert(pnpmEntry && path.isAbsolute(pnpmEntry),
    "L3_PNPM_ENTRY_MISSING", "L3 验证必须从根 pnpm Script 启动");
  const pnpmInfo = await lstat(pnpmEntry).catch(() => null);
  assert(pnpmInfo?.isFile() && !pnpmInfo.isSymbolicLink(),
    "L3_PNPM_ENTRY_INVALID", "L3 pnpm Entry 不是普通文件");
  const storeResult = requireSuccess(await runProcess(process.execPath, [
    pnpmEntry, "--silent", "store", "path"
  ], {
    cwd: config.repoRoot,
    env: sanitizedEnvironment({ NO_COLOR: "1" }),
    timeoutMs: 30_000,
    outputLimit: 1024 * 1024
  }), "定位固定 pnpm Store");
  const requestedStorePath = storeResult.stdout.trim();
  assert(path.isAbsolute(requestedStorePath),
    "L3_PNPM_STORE_INVALID", "L3 pnpm Store 必须是绝对路径");
  const storePath = await canonicalizePlannedPath(requestedStorePath, "L3 pnpm Store");
  assertOutside(config.repoRoot, storePath, "L3 pnpm Store");
  assertDisjoint(worktreePath, storePath, ["L3 Worktree", "L3 pnpm Store"]);
  assertDisjoint(runtimePath, storePath, ["L3 Runtime", "L3 pnpm Store"]);
  assertDisjoint(config.loopHome, storePath, ["Loop Home", "L3 pnpm Store"]);
  if (config.backupRoot) {
    assertDisjoint(config.backupRoot, storePath, ["Backup Root", "L3 pnpm Store"]);
  }
  // 新 CI Runner 可能尚未物化 Store；空目录可创建，但缺失包仍由 --offline 失败关闭。
  await mkdir(storePath, { recursive: true });
  const storeInfo = await lstat(storePath).catch(() => null);
  assert(storeInfo?.isDirectory() && !storeInfo.isSymbolicLink()
      && path.relative(storePath, await realpath(storePath)) === "",
    "L3_PNPM_STORE_INVALID", "L3 pnpm Store 不存在或类型非法");

  // Profile 代码不继承用户 Home、AppData、GitHub CLI、SSH 或 Provider 凭据目录。
  const isolatedHome = path.join(runtimePath, "home");
  const isolatedAppData = path.join(runtimePath, "appdata");
  const isolatedLocalAppData = path.join(runtimePath, "localappdata");
  const isolatedTemp = path.join(runtimePath, "temp");
  await Promise.all([
    mkdir(isolatedHome, { recursive: true }),
    mkdir(isolatedAppData, { recursive: true }),
    mkdir(isolatedLocalAppData, { recursive: true }),
    mkdir(isolatedTemp, { recursive: true })
  ]);
  const npmUserConfig = path.join(runtimePath, "empty-npmrc");
  await writeFile(npmUserConfig, "", { flag: "wx" });
  const env = sanitizedEnvironment({
    CI: "1",
    NODE_ENV: "test",
    NO_COLOR: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    TURBO_TELEMETRY_DISABLED: "1",
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    APPDATA: isolatedAppData,
    LOCALAPPDATA: isolatedLocalAppData,
    TEMP: isolatedTemp,
    TMP: isolatedTemp,
    TMPDIR: isolatedTemp,
    NPM_CONFIG_USERCONFIG: npmUserConfig,
    npm_config_userconfig: npmUserConfig,
    npm_config_offline: "true",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
    npm_execpath: pnpmEntry,
    npm_node_execpath: process.execPath
  });
  requireSuccess(await runProcess(process.execPath, [
    pnpmEntry, "install", "--offline", "--frozen-lockfile", "--ignore-scripts",
    "--store-dir", storePath
  ], {
    cwd: worktreePath,
    env,
    timeoutMs: Math.min(policy.budgets.maxProfileSeconds * 1000, 300_000),
    outputLimit: policy.budgets.maxOutputBytes
  }), "离线安装 L3 Worktree 依赖");
  const results = [];
  for (const command of commands) {
    assert(Array.isArray(command) && command.length === 2 && command[0] === "pnpm",
      "L3_PROFILE_COMMAND_DENIED", "L3 Profile 只允许固定 pnpm Script");
    const result = await runProcess(process.execPath, [pnpmEntry, command[1]], {
      cwd: worktreePath,
      env,
      timeoutMs: policy.budgets.maxProfileSeconds * 1000,
      outputLimit: policy.budgets.maxOutputBytes
    });
    requireSuccess(result, `执行 L3 Profile ${command[1]}`);
    results.push({ script: command[1], exitCode: result.code, stdoutSha256: sha256(result.stdout) });
  }
  requireSuccess(await runProcess(process.execPath, [pnpmEntry, "security:public-readiness"], {
    cwd: worktreePath,
    env,
    timeoutMs: 180_000,
    outputLimit: policy.budgets.maxOutputBytes
  }), "执行 L3 公开安全复核");
  return { ok: true, profile: plan.profile, commands: results };
}

async function defaultDraftPullRequestPublisher({ plan, staged }) {
  const env = sanitizedEnvironment({ NO_COLOR: "1" });
  requireSuccess(await runProcess("gh", [
    "workflow", "run", "automation-pr-author.yml",
    "--repo", plan.repository,
    "--ref", "main",
    "-f", `source_ref=${plan.sourceBranch}`,
    "-f", `expected_sha=${staged.commit}`,
    "-f", `target_branch=${plan.pullRequest.targetBranch}`,
    "-f", `title=${plan.pullRequest.title}`,
    "-f", `body=${plan.pullRequest.body}`
  ], { env, timeoutMs: 60_000, outputLimit: 1024 * 1024 }), "触发机器人作者工作流");

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = requireSuccess(await runProcess("gh", [
      "pr", "list", "--repo", plan.repository, "--state", "open",
      "--head", plan.pullRequest.targetBranch,
      "--json", "url,isDraft,author,headRefName,headRefOid,baseRefName"
    ], { env, timeoutMs: 30_000, outputLimit: 1024 * 1024 }), "等待 L3 Draft PR");
    const items = JSON.parse(result.stdout);
    if (items.length === 1) {
      const item = items[0];
      const author = item.author?.login === "app/github-actions"
        ? "github-actions[bot]" : item.author?.login;
      return {
        url: item.url,
        draft: item.isDraft,
        author,
        head: item.headRefName,
        base: item.baseRefName,
        commit: item.headRefOid
      };
    }
    await delay(2_000);
  }
  throw new LoopGatewayError("L3_PR_TIMEOUT", "机器人作者工作流未在 120 秒内创建 Draft PR");
}

async function defaultPullRequestVerifier(url) {
  const env = sanitizedEnvironment({ NO_COLOR: "1" });
  const result = requireSuccess(await runProcess("gh", [
    "pr", "view", url,
    "--json", "url,isDraft,author,headRefName,headRefOid,baseRefName"
  ], { env, timeoutMs: 30_000, outputLimit: 1024 * 1024 }), "复核 L3 Draft PR");
  const item = JSON.parse(result.stdout);
  const author = item.author?.login === "app/github-actions"
    ? "github-actions[bot]" : item.author?.login;
  return {
    url: item.url,
    draft: item.isDraft,
    author,
    head: item.headRefName,
    base: item.baseRefName,
    commit: item.headRefOid
  };
}

async function assertSourceUnchanged(config, expected) {
  const actual = await readGitState(config);
  assert(actual.gitCommit === expected.gitCommit && actual.gitTree === expected.gitTree
      && actual.gitStatus === expected.gitStatus,
    "L3_SOURCE_CHANGED", "隔离 L3 操作修改了规范源工作树");
}

async function assertRepositoryControlsUnchanged(repoRoot, expected) {
  const actual = await readL3RepositoryControls(repoRoot);
  assert(canonicalSha256(actual) === canonicalSha256(expected),
    "L3_REPOSITORY_CONTROL_CHANGED", "L3 执行期间共享 Git Config、Hooks 或排除规则发生变化");
}

async function optionalFileDigest(file) {
  const info = await lstat(file).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return null;
  assert(info.isFile() && !info.isSymbolicLink(),
    "L3_REPOSITORY_CONTROL_INVALID", `Git 控制文件不是普通文件：${file}`);
  return sha256(await readFile(file));
}

async function git(cwd, args, label, timeoutMs = 30_000) {
  return requireSuccess(await runProcess("git", args, {
    cwd,
    timeoutMs,
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

function parseApprovalUrl(url) {
  const match = /^https:\/\/github\.com\/cyhui555\/deeptrail-open\/pull\/(\d+)#pullrequestreview-(\d+)$/.exec(
    url ?? ""
  );
  assert(match, "L3_APPROVAL_URL_INVALID", "L3 approvalUrl 必须指向固定仓库的 Review");
  return { pullRequest: Number(match[1]), reviewId: Number(match[2]) };
}

function isExpectedPullRequestUrl(url) {
  return /^https:\/\/github\.com\/cyhui555\/deeptrail-open\/pull\/\d+$/.test(url ?? "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assert(condition, code, message) {
  if (!condition) throw new LoopGatewayError(code, message);
}
