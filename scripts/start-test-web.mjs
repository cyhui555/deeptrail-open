import { createServer } from "node:http";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const next = require(require.resolve("next", { paths: [process.cwd()] }));
let webPhase = "starting";
const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  const recordedAt = new Date().toISOString();
  originalConsoleError(`TEST_WEB_PHASE=${webPhase} TEST_WEB_AT=${recordedAt}`, ...args);
  if (args.some((value) => String(value).includes("Failed to proxy"))) {
    void fetch("http://127.0.0.1:8080/api/health", { signal: AbortSignal.timeout(2_000) })
      .then((response) => originalConsoleError(
        `TEST_WEB_PROXY_BACKEND_HEALTH=${response.status} TEST_WEB_AT=${new Date().toISOString()}`,
      ))
      .catch((error) => originalConsoleError(
        `TEST_WEB_PROXY_BACKEND_HEALTH=unavailable TEST_WEB_AT=${new Date().toISOString()}`,
        error instanceof Error ? error.message : error,
      ));
  }
};

const hostname = "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("测试 Web 端口不合法");
}

const app = next({ dev: false, dir: process.cwd(), hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer((request, response) => handle(request, response));
server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, hostname, resolve);
});
console.log(`测试 Web 已监听：http://${hostname}:${port}`);
webPhase = "running";

let shutdownPromise = null;
async function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    webPhase = "draining";
    // 先停止接收新请求，再等待现有代理请求完成，避免在 API 关闭后产生假红。
    await new Promise((resolve, reject) => {
      const forceClose = setTimeout(() => {
        console.warn("TEST_WEB_FORCE_CLOSE: grace period expired");
        server.closeAllConnections?.();
      }, 2_000);
      server.close((error) => {
        clearTimeout(forceClose);
        if (error) reject(error);
        else resolve();
      });
      server.closeIdleConnections?.();
    });
    await app.close();
    webPhase = "closed";
    console.log("TEST_WEB_IPC_SHUTDOWN_COMPLETE");
    // 保持父进程存活并保留原始父子关系，由运行器统一回收 Next 的子 Worker。
    if (process.send) process.send({ type: "shutdown-complete" });
  })();
  return shutdownPromise;
}

process.on("message", (message) => {
  if (message?.type === "shutdown") {
    void shutdown().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
});
process.on("disconnect", () => {
  void shutdown().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
});
