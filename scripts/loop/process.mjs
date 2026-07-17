import { spawn } from "node:child_process";

import { LoopGatewayError } from "./errors.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_OUTPUT_LIMIT = 1024 * 1024;

export async function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const outputLimit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT;

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const collect = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > outputLimit) {
        child.kill();
        finish(() => reject(new LoopGatewayError(
          "OUTPUT_LIMIT_EXCEEDED",
          `子进程输出超过 ${outputLimit} bytes`
        )));
      }
      return next;
    };

    child.stdout.on("data", (chunk) => { stdout = collect(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = collect(stderr, chunk); });
    child.on("error", (error) => finish(() => reject(new LoopGatewayError(
      "PROCESS_START_FAILED",
      `无法启动 ${command}：${error.message}`
    ))));
    child.on("close", (code, signal) => finish(() => resolve({
      command,
      args,
      code: code ?? -1,
      signal,
      stdout,
      stderr
    })));

    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new LoopGatewayError(
        "PROCESS_TIMEOUT",
        `${command} 超过 ${timeoutMs}ms 未完成`
      )));
    }, timeoutMs);
  });
}

export function requireSuccess(result, label) {
  if (result.code !== 0) {
    throw new LoopGatewayError("PROCESS_FAILED", `${label} 失败（exit ${result.code}）`, {
      stderr: result.stderr.trim().slice(0, 4096),
      stdout: result.stdout.trim().slice(0, 4096)
    });
  }
  return result;
}
