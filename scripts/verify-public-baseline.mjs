import { execFile } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readlink, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const run = promisify(execFile);
const sourceRoot = process.cwd();
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "deeptrail-public-baseline-"));
const baselineRoot = path.join(temporaryRoot, "repo");

try {
  await mkdir(baselineRoot);
  const { stdout: fileOutput } = await run(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: sourceRoot, encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  const files = fileOutput.toString("utf8").split("\0").filter(Boolean);
  let copiedFiles = 0;
  for (const relativePath of files) {
    const source = path.join(sourceRoot, ...relativePath.split("/"));
    const target = path.join(baselineRoot, ...relativePath.split("/"));
    let metadata;
    try {
      metadata = await lstat(source);
    } catch (error) {
      // Index 中待删除的路径不属于当前候选 Tree；提交前模拟应跳过而不是因 ENOENT 中止。
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    await mkdir(path.dirname(target), { recursive: true });
    if (metadata.isSymbolicLink()) {
      await symlink(await readlink(source), target);
    } else if (metadata.isFile()) {
      await copyFile(source, target);
    } else {
      throw new Error(`公开基线只接受文件或符号链接：${relativePath}`);
    }
    copiedFiles += 1;
  }

  await git(["init", "-b", "main"], baselineRoot);
  await git(["config", "user.name", "Deeptrail Public Baseline Verifier"], baselineRoot);
  await git(["config", "user.email", "deeptrail-baseline@example.invalid"], baselineRoot);
  await git(["add", "--all"], baselineRoot);
  await git(["commit", "-m", "chore(TASK-LOOP-003): establish sanitized public baseline"], baselineRoot);

  await runNode("scripts/check-public-readiness.mjs", baselineRoot);
  await runNode("scripts/check-public-history.mjs", baselineRoot, {
    DEEPTRAIL_REPOSITORY_PRIVATE: "false",
  });
  const { stdout: rootCount } = await run("git", ["rev-list", "--max-parents=0", "--all", "--count"], {
    cwd: baselineRoot,
    encoding: "utf8",
  });
  if (rootCount.trim() !== "1") throw new Error("公开基线必须只有一个根提交");

  const { stdout: sourceRevision } = await run("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
  });
  const { stdout: sourceStatus } = await run("git", ["status", "--porcelain=v1"], {
    cwd: sourceRoot,
    encoding: "utf8",
  });
  console.log(
    `公开基线模拟通过：${copiedFiles} 个文件，单根提交；来源 ${sourceRevision.trim().slice(0, 12)}，dirty=${Boolean(sourceStatus.trim())}。`,
  );
} finally {
  const expectedRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(temporaryRoot);
  if (!resolved.startsWith(`${expectedRoot}${path.sep}`)
      || !path.basename(resolved).startsWith("deeptrail-public-baseline-")) {
    throw new Error("拒绝清理非系统临时公开基线目录");
  }
  await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
}

async function git(args, cwd) {
  await run("git", args, { cwd, windowsHide: true });
}

async function runNode(script, cwd, extraEnvironment = {}) {
  const result = await run(process.execPath, [path.join(cwd, ...script.split("/"))], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnvironment },
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}
