import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { requireSuccess, runProcess } from "./loop/process.mjs";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function withTrackedWorkspace(label, callback) {
  const status = requireSuccess(
    await runProcess("git", ["status", "--porcelain"], { cwd: projectRoot }),
    "检查质量 Profile 工作树"
  ).stdout.trim();
  if (status) throw new Error("质量 Profile 只接受 clean worktree");

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `deeptrail-${label}-`));
  const workspace = path.join(temporaryRoot, "repo");
  try {
    await mkdir(workspace);
    const tracked = requireSuccess(
      await runProcess("git", ["ls-files", "-z"], { cwd: projectRoot }),
      "读取已跟踪工程文件"
    ).stdout.split("\0").filter(Boolean);
    for (const relative of tracked) {
      const source = path.join(projectRoot, ...relative.split("/"));
      const target = path.join(workspace, ...relative.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
    }
    await installDependencies(workspace);
    return await callback(workspace);
  } finally {
    const expected = path.resolve(os.tmpdir());
    if (!path.resolve(temporaryRoot).startsWith(`${expected}${path.sep}`)) {
      throw new Error("拒绝清理非临时质量工作区");
    }
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}

export async function runPnpm(workspace, args, timeoutMs = 240_000) {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry || !path.isAbsolute(pnpmEntry)) {
    throw new Error("质量 Profile 必须从根 pnpm 脚本启动");
  }
  return await runCommand(process.execPath, [pnpmEntry, ...args], workspace, timeoutMs);
}

export async function runNode(workspace, args, timeoutMs = 300_000) {
  return await runCommand(process.execPath, args, workspace, timeoutMs);
}

async function runCommand(command, args, cwd, timeoutMs) {
  const child = spawn(command, args, {
    cwd,
    env: profileEnvironment(),
    shell: false,
    stdio: "inherit",
    windowsHide: true
  });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (exitCode) => resolve(exitCode ?? 1));
    });
    if (code !== 0) throw new Error(`质量 Profile 子进程失败（exit ${code}）：${args.join(" ")}`);
  } finally {
    clearTimeout(timer);
  }
}

async function installDependencies(workspace) {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry || !path.isAbsolute(pnpmEntry)) {
    throw new Error("质量 Profile 必须从根 pnpm 脚本启动");
  }
  // 只使用锁文件与本机内容寻址 Store；缺包时直接失败，不访问外网补齐。
  await runCommand(
    process.execPath,
    [pnpmEntry, "install", "--offline", "--frozen-lockfile"],
    workspace,
    180_000
  );
}

function profileEnvironment() {
  const allowed = [
    "PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT",
    "TEMP", "TMP", "TMPDIR", "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA",
    "LANG", "LC_ALL", "TERM", "CI", "JAVA_HOME"
  ];
  const env = {};
  for (const key of allowed) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return {
    ...env,
    CI: "true",
    NO_COLOR: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    TURBO_TELEMETRY_DISABLED: "1",
    // 依赖只在上方显式离线安装；禁止 pnpm 在运行脚本时自动 install/purge。
    pnpm_config_verify_deps_before_run: "false",
    npm_execpath: process.env.npm_execpath,
    npm_node_execpath: process.execPath
  };
}
