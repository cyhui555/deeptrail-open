import path from "node:path";

import { LoopGatewayError } from "./errors.mjs";
import { assertDirectory, assertRegularFile } from "./fs-safe.mjs";
import { requireSuccess, runProcess } from "./process.mjs";

const ALLOWED_COMMANDS = new Set([
  "init",
  "doctor",
  "kind list",
  "artifact create",
  "artifact get",
  "artifact list",
  "artifact append",
  "artifact status",
  "artifact set",
  "refs add",
  "refs query",
  "domain list",
  "domain enable"
]);

export function assertAllowedLoopAnyArgs(args) {
  if (!Array.isArray(args) || args.length === 0 || args.some((item) => typeof item !== "string")) {
    throw new LoopGatewayError("INVALID_LOOPANY_ARGS", "LoopAny 参数必须是非空字符串数组");
  }
  const grouped = new Set(["kind", "artifact", "domain"]);
  const command = grouped.has(args[0])
    ? `${args[0]} ${args[1] ?? ""}`.trim()
    : args[0] === "refs" && args[1] === "add"
      ? "refs add"
      : args[0] === "refs"
        ? "refs query"
        : args[0];
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new LoopGatewayError("LOOPANY_COMMAND_DENIED", `未允许的 LoopAny 命令：${args.join(" ")}`);
  }
}

export async function verifyRuntime(config) {
  const sourceRoot = await assertDirectory(config.sourceRoot, "LOOPANY_SOURCE_ROOT");
  const bun = await assertRegularFile(config.bun, "LOOPANY_BUN");
  const cli = await assertRegularFile(config.loopanyCli, "LoopAny CLI");
  if (path.dirname(path.dirname(cli)) !== sourceRoot) {
    throw new LoopGatewayError("RUNTIME_PATH_ESCAPE", "LoopAny CLI 不属于固定源码目录");
  }

  const head = requireSuccess(
    await runProcess("git", ["-C", sourceRoot, "rev-parse", "HEAD"]),
    "校验 LoopAny Commit"
  ).stdout.trim();
  if (head !== config.loopany.commit) {
    throw new LoopGatewayError(
      "LOOPANY_COMMIT_MISMATCH",
      `LoopAny Commit 不匹配：期望 ${config.loopany.commit}，实际 ${head}`
    );
  }
  const dirty = requireSuccess(
    await runProcess("git", ["-C", sourceRoot, "status", "--porcelain"]),
    "校验 LoopAny 工作树"
  ).stdout.trim();
  if (dirty) {
    throw new LoopGatewayError("LOOPANY_SOURCE_DIRTY", "LoopAny 固定源码工作树存在未提交改动");
  }

  const bunVersion = requireSuccess(await runProcess(bun, ["--version"]), "校验 Bun").stdout.trim();
  if (bunVersion !== config.loopany.bunVersion) {
    throw new LoopGatewayError(
      "BUN_VERSION_MISMATCH",
      `Bun 版本不匹配：期望 ${config.loopany.bunVersion}，实际 ${bunVersion}`
    );
  }
  const cliVersion = requireSuccess(
    await runProcess(bun, [cli, "--version"], { env: runtimeEnvironment(config) }),
    "校验 LoopAny CLI"
  ).stdout.trim();
  if (cliVersion !== `loopany ${config.loopany.cliVersion}`) {
    throw new LoopGatewayError(
      "LOOPANY_VERSION_MISMATCH",
      `LoopAny CLI 版本不匹配：${cliVersion}`
    );
  }
  return { sourceRoot, bun, cli, head, bunVersion, cliVersion };
}

export async function runLoopAny(config, args, options = {}) {
  assertAllowedLoopAnyArgs(args);
  const result = await runProcess(config.bun, [config.loopanyCli, ...args], {
    cwd: config.repoRoot,
    env: runtimeEnvironment(config),
    timeoutMs: options.timeoutMs ?? 30_000
  });
  if (options.allowFailure !== true) requireSuccess(result, `LoopAny ${args.join(" ")}`);
  if (options.json === true && result.stdout.trim()) {
    try {
      return { ...result, json: JSON.parse(result.stdout) };
    } catch (error) {
      throw new LoopGatewayError(
        "INVALID_LOOPANY_JSON",
        `LoopAny ${args.join(" ")} 未返回合法 JSON：${error.message}`
      );
    }
  }
  return result;
}

function runtimeEnvironment(config) {
  return {
    ...sanitizedEnvironment(),
    LOOPANY_HOME: config.workspace,
    BUN_INSTALL_CACHE_DIR: path.join(config.loopHome, "cache", "bun-install"),
    HF_HOME: path.join(config.loopHome, "cache", "huggingface")
  };
}

export function sanitizedEnvironment(additions = {}) {
  const allowed = [
    "PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT",
    "TEMP", "TMP", "TMPDIR", "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA",
    "LANG", "LC_ALL", "TERM", "CI"
  ];
  const env = {};
  for (const key of allowed) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return { ...env, ...additions };
}
