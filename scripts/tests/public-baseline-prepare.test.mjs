import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { preparePublicBaseline } from "../prepare-public-baseline.mjs";

const run = promisify(execFile);

test("公开基线只保留当前 Tree、单根提交且结果可复现", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "deeptrail-public-prepare-test-"));
  const source = path.join(temporaryRoot, "source");
  const outputA = path.join(temporaryRoot, "public-a");
  const outputB = path.join(temporaryRoot, "public-b");
  try {
    await git(["init", "-b", "task/test"], temporaryRoot, source);
    await git(["config", "user.name", "Public Baseline Test"], source);
    await git(["config", "user.email", "public-baseline@example.invalid"], source);
    await writeFile(path.join(source, "legacy.txt"), "legacy-private-history-marker\n", "utf8");
    await git(["add", "legacy.txt"], source);
    await git(["commit", "-m", "legacy"], source);
    await rm(path.join(source, "legacy.txt"));
    await writeFile(path.join(source, "safe.txt"), "safe-current-tree\n", "utf8");
    await git(["add", "--all"], source);
    await git(["commit", "-m", "safe"], source);

    const first = await preparePublicBaseline({ sourceRoot: source, outputRoot: outputA, validate: false });
    const second = await preparePublicBaseline({ sourceRoot: source, outputRoot: outputB, validate: false });
    assert.equal(first.publicRevision, second.publicRevision);
    assert.equal(await gitOutput(["rev-list", "--all", "--count"], outputA), "1");
    assert.equal(await gitOutput(["rev-list", "--max-parents=0", "--all", "--count"], outputA), "1");
    assert.equal(await gitOutput(["rev-parse", "HEAD^{tree}"], outputA), first.sourceTree);
    assert.equal(await gitOutput(["remote"], outputA), "");
    assert.equal(await gitOutput(["status", "--porcelain=v1"], outputA), "");
    assert.equal(await gitOutput(["fsck", "--full", "--unreachable", "--no-reflogs", "--no-progress"], outputA), "");
    assert.doesNotMatch(await readFile(path.join(outputA, ".git", "config"), "utf8"), /^\[(?:remote|branch)\s+"/m);
    await assert.rejects(access(path.join(outputA, ".git", "FETCH_HEAD")), { code: "ENOENT" });
    await assert.rejects(access(path.join(outputA, ".git", "ORIG_HEAD")), { code: "ENOENT" });
    await assert.rejects(access(path.join(outputA, ".git", "logs")), { code: "ENOENT" });
    await access(path.join(outputA, "safe.txt"));
    await assert.rejects(access(path.join(outputA, "legacy.txt")), { code: "ENOENT" });
    await assert.rejects(
      preparePublicBaseline({ sourceRoot: source, outputRoot: outputA, validate: false }),
      /输出路径已存在/,
    );
    await assert.rejects(
      preparePublicBaseline({
        sourceRoot: source,
        outputRoot: path.join(source, "nested-output"),
        validate: false,
      }),
      /输出目录不得/,
    );

    await writeFile(path.join(source, "untracked.txt"), "must-block\n", "utf8");
    await assert.rejects(
      preparePublicBaseline({
        sourceRoot: source,
        outputRoot: path.join(temporaryRoot, "dirty-output"),
        validate: false,
      }),
      /源工作树必须 clean/,
    );
  } finally {
    const resolved = path.resolve(temporaryRoot);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir())
        || !path.basename(resolved).startsWith("deeptrail-public-prepare-test-")) {
      throw new Error("拒绝清理未通过边界校验的测试目录");
    }
    await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
  }
});

async function git(args, cwd, target) {
  if (target) {
    await run("git", [...args, target], { cwd, windowsHide: true });
    return;
  }
  await run("git", args, { cwd, windowsHide: true });
}

async function gitOutput(args, cwd) {
  const { stdout } = await run("git", args, { cwd, encoding: "utf8", windowsHide: true });
  return stdout.trim();
}
