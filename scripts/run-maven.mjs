import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = path.join(root, "apps", "server");
const wrapper = path.join(serverRoot, "mvnw");
const args = process.argv.slice(2);

// 统一通过 Git Bash 执行 Maven Wrapper，避免 Windows 精简 PATH 缺少 powershell.exe。
const child = spawn(resolveBash(), [wrapper, ...args], {
  cwd: serverRoot,
  env: process.env,
  shell: false,
  stdio: "inherit",
  windowsHide: true
});

child.once("error", (error) => {
  console.error(`无法启动 Maven Wrapper：${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) console.error(`Maven Wrapper 被信号 ${signal} 终止`);
  process.exitCode = code ?? 1;
});

function resolveBash() {
  if (process.platform !== "win32") return "bash";
  const candidates = [
    process.env.GIT_BASH,
    process.env.USERPROFILE && path.join(
      process.env.USERPROFILE, "scoop", "apps", "git", "current", "bin", "bash.exe"
    ),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe")
  ];
  for (const entry of (process.env.Path ?? process.env.PATH ?? "").split(path.delimiter)) {
    if (!entry) continue;
    candidates.push(path.join(entry, "bash.exe"));
    if (path.basename(entry).toLowerCase() === "cmd") {
      candidates.push(path.join(path.dirname(entry), "bin", "bash.exe"));
    }
  }
  const bash = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!bash) throw new Error("未找到 Git Bash，无法执行 Maven Wrapper");
  return bash;
}
