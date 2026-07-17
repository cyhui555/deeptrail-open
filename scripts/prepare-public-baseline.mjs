import { execFile } from "node:child_process";
import { access, lstat, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const maxBuffer = 64 * 1024 * 1024;

export async function preparePublicBaseline({
  sourceRoot,
  outputRoot,
  validate = true,
  validationRoot = sourceRoot,
}) {
  if (!path.isAbsolute(outputRoot)) throw new Error("--output 必须是绝对路径");
  const source = path.resolve(sourceRoot);
  const output = path.resolve(outputRoot);
  validateOutputBoundary(source, output);
  await assertMissing(output);

  const parent = path.dirname(output);
  const parentMetadata = await stat(parent);
  if (!parentMetadata.isDirectory()) throw new Error(`输出父路径不是目录：${parent}`);

  const status = await gitOutput(["status", "--porcelain=v1", "--untracked-files=all"], source);
  if (status.trim()) throw new Error("源工作树必须 clean；请先提交或处理全部跟踪与未跟踪变更");

  const sourceRevision = (await gitOutput(["rev-parse", "HEAD"], source)).trim();
  const sourceTree = (await gitOutput(["rev-parse", "HEAD^{tree}"], source)).trim();
  const sourceBranch = (await gitOutput(["symbolic-ref", "--quiet", "--short", "HEAD"], source)).trim();
  const sourceDate = (await gitOutput(["show", "-s", "--format=%cI", "HEAD"], source)).trim();
  const prefix = `.${path.basename(output)}.staging-`;
  const staging = await mkdtemp(path.join(parent, prefix));
  let published = false;

  try {
    await git([
      "clone",
      "--no-local",
      "--no-checkout",
      "--single-branch",
      "--no-tags",
      "--branch",
      sourceBranch,
      source,
      staging,
    ], parent);

    const commitEnvironment = {
      ...process.env,
      GIT_AUTHOR_NAME: "Deeptrail Public Baseline",
      GIT_AUTHOR_EMAIL: "deeptrail-baseline@example.invalid",
      GIT_COMMITTER_NAME: "Deeptrail Public Baseline",
      GIT_COMMITTER_EMAIL: "deeptrail-baseline@example.invalid",
      GIT_AUTHOR_DATE: sourceDate,
      GIT_COMMITTER_DATE: sourceDate,
    };
    const commitMessage = "chore(TASK-LOOP-003): establish sanitized public baseline";
    const publicRevision = (await gitOutput([
      "commit-tree",
      sourceTree,
      "-m",
      commitMessage,
      "-m",
      `Source-Revision: ${sourceRevision}`,
    ], staging, commitEnvironment)).trim();

    await git(["remote", "remove", "origin"], staging);
    await git(["update-ref", "refs/heads/main", publicRevision], staging);
    await git(["symbolic-ref", "HEAD", "refs/heads/main"], staging);
    const refs = (await gitOutput(["for-each-ref", "--format=%(refname)"], staging))
      .split(/\r?\n/)
      .filter(Boolean);
    for (const ref of refs) {
      if (ref !== "refs/heads/main") await git(["update-ref", "-d", ref], staging);
    }
    await removeOptionalConfigSection(`branch.${sourceBranch}`, staging);

    // 旧私有历史即使不可达也不保留，避免输出目录被整体打包时泄露旧对象。
    await git(["reflog", "expire", "--expire=now", "--expire-unreachable=now", "--all"], staging);
    await git(["gc", "--prune=now"], staging);
    await git(["reset", "--hard", "main"], staging);
    // Clone 的本机路径、旧分支和拉取记录不属于公开证据，输出目录中也不保留。
    await rm(path.join(staging, ".git", "logs"), { recursive: true, force: true, maxRetries: 3 });
    await rm(path.join(staging, ".git", "FETCH_HEAD"), { force: true });
    await rm(path.join(staging, ".git", "ORIG_HEAD"), { force: true });

    await verifyBaseline({
      baselineRoot: staging,
      sourceTree,
      validate,
      validationRoot: path.resolve(validationRoot),
    });
    await rename(staging, output);
    published = true;
    return { outputRoot: output, publicRevision, sourceRevision, sourceTree };
  } finally {
    if (!published) await removeStagingSafely(staging, parent, prefix);
  }
}

async function verifyBaseline({ baselineRoot, sourceTree, validate, validationRoot }) {
  const rootCount = (await gitOutput(["rev-list", "--max-parents=0", "--all", "--count"], baselineRoot)).trim();
  const revisionCount = (await gitOutput(["rev-list", "--all", "--count"], baselineRoot)).trim();
  const baselineTree = (await gitOutput(["rev-parse", "HEAD^{tree}"], baselineRoot)).trim();
  const status = (await gitOutput(["status", "--porcelain=v1"], baselineRoot)).trim();
  const remotes = (await gitOutput(["remote"], baselineRoot)).trim();
  const repositoryConfig = await readFile(path.join(baselineRoot, ".git", "config"), "utf8");
  const unreachable = (await gitOutput([
    "fsck",
    "--full",
    "--unreachable",
    "--no-reflogs",
    "--no-progress",
  ], baselineRoot)).trim();

  if (rootCount !== "1" || revisionCount !== "1") throw new Error("公开基线必须只有一个根提交和一个可达提交");
  if (baselineTree !== sourceTree) throw new Error("公开基线 Tree 与源 Revision 不一致");
  if (status) throw new Error("公开基线生成后工作树不 clean");
  if (remotes) throw new Error("公开基线不得预置远端地址");
  if (/^\[(?:remote|branch)\s+"/m.test(repositoryConfig)) throw new Error("公开基线仍包含 Clone 远端或旧分支配置");
  if (unreachable) throw new Error("公开基线仍包含不可达的旧 Git 对象");

  if (validate) {
    await runNode(path.join(validationRoot, "scripts", "check-public-readiness.mjs"), baselineRoot);
    await runNode(path.join(validationRoot, "scripts", "check-public-history.mjs"), baselineRoot, {
      DEEPTRAIL_REPOSITORY_PRIVATE: "false",
    });
  }
}

function validateOutputBoundary(source, output) {
  if (isWithin(output, source) || isWithin(source, output)) {
    throw new Error("输出目录不得等于、位于源仓库内或包含源仓库");
  }
  if (path.parse(output).root === output) throw new Error("输出目录不得是文件系统根目录");
}

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertMissing(target) {
  try {
    await access(target);
    throw new Error(`输出路径已存在，拒绝覆盖：${target}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function removeStagingSafely(staging, parent, prefix) {
  const resolved = path.resolve(staging);
  if (path.dirname(resolved) !== path.resolve(parent) || !path.basename(resolved).startsWith(prefix)) {
    throw new Error("拒绝清理未通过边界校验的公开基线 staging 目录");
  }
  try {
    const metadata = await lstat(resolved);
    if (!metadata.isDirectory()) throw new Error("公开基线 staging 目标不是目录");
    await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function git(args, cwd, environment = process.env) {
  await run("git", args, { cwd, env: environment, maxBuffer, windowsHide: true });
}

async function removeOptionalConfigSection(section, cwd) {
  try {
    await git(["config", "--local", "--remove-section", section], cwd);
  } catch (error) {
    const missingSection = /no such section/i.test(error.stderr ?? "");
    if (!missingSection && ![1, 5].includes(error.code)) throw error;
  }
}

async function gitOutput(args, cwd, environment = process.env) {
  const { stdout } = await run("git", args, {
    cwd,
    env: environment,
    encoding: "utf8",
    maxBuffer,
    windowsHide: true,
  });
  return stdout;
}

async function runNode(script, cwd, extraEnvironment = {}) {
  const result = await run(process.execPath, [script], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnvironment },
    maxBuffer,
    windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function parseArguments(argv) {
  if (argv.includes("--help")) return { help: true };
  if (argv.length !== 2 || argv[0] !== "--output" || !argv[1]) {
    throw new Error("用法：pnpm security:public-prepare -- --output <绝对且不存在的目录>");
  }
  if (!path.isAbsolute(argv[1])) throw new Error("--output 必须是绝对路径");
  return { outputRoot: argv[1] };
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (arguments_.help) {
    console.log("用法：pnpm security:public-prepare -- --output <绝对且不存在的目录>");
    console.log("只生成无远端、单根提交的脱敏公开基线；不会创建 GitHub 仓库或 Push。");
    return;
  }
  const result = await preparePublicBaseline({
    sourceRoot: process.cwd(),
    outputRoot: arguments_.outputRoot,
  });
  console.log(`公开基线准备通过：来源 ${result.sourceRevision.slice(0, 12)}，公开提交 ${result.publicRevision.slice(0, 12)}。`);
  console.log(`输出目录：${result.outputRoot}`);
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(`公开基线准备失败：${error.message}`);
    process.exitCode = 1;
  });
}
