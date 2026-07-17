import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { isWithin, sha256, toPortablePath } from "./fs-safe.mjs";
import { requireSuccess, runProcess } from "./process.mjs";

export async function resolveShadowInput(config, requested) {
  if (!requested) throw new LoopGatewayError("MISSING_WORK_ITEM", "shadow 需要 --work-item");
  await assertCleanWorktree(config);

  const candidate = path.resolve(config.repoRoot, requested);
  const info = await lstat(candidate).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink()) {
    throw new LoopGatewayError("INVALID_WORK_ITEM", `Work Item 不是普通文件：${candidate}`);
  }
  const resolved = await realpath(candidate);
  if (!isWithin(config.repoRoot, resolved)) {
    throw new LoopGatewayError("WORK_ITEM_PATH_ESCAPE", "Work Item 逃逸出 Git 工作树");
  }
  const relative = toPortablePath(path.relative(config.repoRoot, resolved));
  const pattern = new RegExp(config.shadowPolicy.workItemPattern);
  if (!pattern.test(relative)) {
    throw new LoopGatewayError(
      "WORK_ITEM_SCOPE_DENIED",
      "仅允许已提交的 docs/issues/(TASK|BUG|SPIKE)-*.md（文件名大小写均兼容）"
    );
  }

  requireSuccess(
    await runProcess("git", ["ls-files", "--error-unmatch", "--", relative], { cwd: config.repoRoot }),
    "确认 Work Item 已被 Git 跟踪"
  );
  const state = await readGitState(config);
  const content = await readFile(resolved);
  const committed = requireSuccess(
    await runProcess("git", ["show", `${state.gitCommit}:${relative}`], {
      cwd: config.repoRoot,
      outputLimit: config.shadowPolicy.maxOutputBytes
    }),
    "读取已提交 Work Item"
  ).stdout;
  if (sha256(content) !== sha256(committed)) {
    throw new LoopGatewayError("WORK_ITEM_REVISION_MISMATCH", "Work Item 内容不等于当前 Commit");
  }

  return {
    absolute: resolved,
    relative,
    workItemHash: sha256(content),
    ...state,
    trackedMtimeDigest: await trackedMtimeDigest(config)
  };
}

export async function readGitState(config) {
  const [commit, tree, branch, status] = await Promise.all([
    runProcess("git", ["rev-parse", "HEAD"], { cwd: config.repoRoot }),
    runProcess("git", ["rev-parse", "HEAD^{tree}"], { cwd: config.repoRoot }),
    runProcess("git", ["branch", "--show-current"], { cwd: config.repoRoot }),
    runProcess("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
      cwd: config.repoRoot,
      outputLimit: 4 * 1024 * 1024
    })
  ]);
  return {
    gitCommit: requireSuccess(commit, "读取 Git Commit").stdout.trim(),
    gitTree: requireSuccess(tree, "读取 Git Tree").stdout.trim(),
    gitBranch: requireSuccess(branch, "读取 Git 分支").stdout.trim() || "(detached)",
    gitStatus: requireSuccess(status, "读取 Git 工作树状态").stdout
  };
}

export async function assertCleanWorktree(config) {
  const state = await readGitState(config);
  if (config.shadowPolicy.requireCleanWorktree && state.gitStatus.length > 0) {
    throw new LoopGatewayError(
      "WORKTREE_NOT_CLEAN",
      "Shadow 只接受 clean worktree；请先审阅并提交当前变更"
    );
  }
  return state;
}

export async function confirmGitStateUnchanged(config, expected) {
  const actual = await readGitState(config);
  const mtimeDigest = await trackedMtimeDigest(config);
  const changed = actual.gitCommit !== expected.gitCommit
    || actual.gitTree !== expected.gitTree
    || actual.gitStatus.length > 0
    || mtimeDigest !== expected.trackedMtimeDigest;
  if (changed) {
    throw new LoopGatewayError("WORKTREE_CHANGED_DURING_SHADOW", "Shadow 执行期间 Git 事实或跟踪文件 mtime 发生变化", {
      expectedCommit: expected.gitCommit,
      actualCommit: actual.gitCommit,
      expectedTree: expected.gitTree,
      actualTree: actual.gitTree,
      dirty: actual.gitStatus.length > 0,
      mtimeChanged: mtimeDigest !== expected.trackedMtimeDigest
    });
  }
  return { ...actual, trackedMtimeDigest: mtimeDigest };
}

async function trackedMtimeDigest(config) {
  const result = requireSuccess(
    await runProcess("git", ["ls-files", "-z"], {
      cwd: config.repoRoot,
      outputLimit: 4 * 1024 * 1024
    }),
    "读取跟踪文件集合"
  );
  const files = result.stdout.split("\0").filter(Boolean).sort();
  const metadata = [];
  for (const relative of files) {
    const file = path.join(config.repoRoot, ...relative.split("/"));
    const info = await lstat(file, { bigint: true });
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new LoopGatewayError("TRACKED_FILE_TYPE_DENIED", `跟踪路径不是普通文件：${relative}`);
    }
    metadata.push({ path: relative, size: String(info.size), mtimeNs: String(info.mtimeNs) });
  }
  return canonicalSha256(metadata);
}
