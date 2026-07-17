import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { startMockAiServer } from './mock-ai-server.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.join(root, 'apps/server');
const webRoot = path.join(root, 'apps/web');
const mavenRunner = path.join(root, 'scripts/run-maven.mjs');
const testWebServer = path.join(root, 'scripts/start-test-web.mjs');
const testArgs = process.argv.slice(2);
const backendHealthUrl = process.env.BACKEND_HEALTH_URL || 'http://127.0.0.1:8080/api/health';
const frontendHealthUrl = process.env.FRONTEND_HEALTH_URL || 'http://127.0.0.1:3000/login';
const reuseExisting = process.env.PLAYWRIGHT_REUSE_SERVER === 'true';
const children = [];
let mockAiServer;

async function isAvailable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
    return response.status >= 200 && response.status < 404;
  } catch {
    return false;
  }
}

async function waitForService(name, url, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isAvailable(url)) {
      console.log(`${name} 已就绪：${url}`);
      return;
    }
    if (child.exitCode !== null) {
      throw new Error(`${name} 启动进程提前退出，退出码 ${child.exitCode}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} 在 ${timeoutMs}ms 内未就绪：${url}`);
}

function startService(name, command, args, cwd, extraEnv = {}, useIpc = false) {
  console.log(`启动 ${name}：${[command, ...args].join(' ')}`);
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    shell: false,
    stdio: useIpc ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit',
    windowsHide: true,
  });
  child.serviceName = name;
  child.on('exit', (code, signal) => {
    console.log(`E2E_SERVICE_EXIT name=${name} code=${code} signal=${signal} at=${new Date().toISOString()}`);
  });
  children.push(child);
  return child;
}

async function waitForUnavailable(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isAvailable(url))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function runCommand(name, command, args, cwd, extraEnv = {}) {
  console.log(`执行 ${name}：${[command, ...args].join(' ')}`);
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    shell: false,
    stdio: 'inherit',
    windowsHide: true,
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (value) => resolve(value ?? 1));
  });
  if (code !== 0) {
    throw new Error(`${name} 失败，退出码 ${code}`);
  }
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    // Windows 需终止 cmd、Maven/Next 及其孙进程，否则端口会污染下一轮测试。
    const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    spawnSync(taskkill, ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  child.kill('SIGTERM');
}

async function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) {
    return true;
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function requestIpcShutdown(child, timeoutMs) {
  if (!child?.connected) return false;
  const ready = new Promise((resolve) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
    };
    const onMessage = (message) => {
      if (message?.type !== 'shutdown-complete') return;
      cleanup();
      resolve(true);
    };
    const onExit = () => {
      cleanup();
      resolve(false);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    child.on('message', onMessage);
    child.once('exit', onExit);
  });
  child.send({ type: 'shutdown' });
  return await ready;
}

async function stopProcessTreeGracefully(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  if (await requestIpcShutdown(child, 10_000)) {
    if (process.platform === 'win32') {
      // app.close() 不会回收所有 Windows Next Worker；父进程仍存活时按树统一终止。
      stopProcessTree(child);
    } else {
      child.disconnect();
      child.kill('SIGTERM');
    }
    await waitForExit(child, 5_000);
    return;
  }
  if (process.platform === 'win32') {
    // 先请求整棵进程树正常退出，给 Next 足够时间排空 keep-alive 请求；超时后才强制清理。
    const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    spawnSync(taskkill, ['/pid', String(child.pid), '/t'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (!(await waitForExit(child, 5_000))) {
      stopProcessTree(child);
      await waitForExit(child, 5_000);
    }
    return;
  }
  child.kill('SIGTERM');
  await waitForExit(child, 5_000);
}

let exitCode = 1;
try {
  const [backendReady, frontendReady] = await Promise.all([
    isAvailable(backendHealthUrl),
    isAvailable(frontendHealthUrl),
  ]);

  if (backendReady || frontendReady) {
    if (!reuseExisting || !backendReady || !frontendReady) {
      throw new Error(
        '测试端口已被占用。请停止现有服务，或确认两个服务均属于当前工程后设置 PLAYWRIGHT_REUSE_SERVER=true。',
      );
    }
    console.log('复用已运行的 API 与 Web 服务。');
  } else {
    // Next standalone 构建包含 Windows symlink；dev 自清理会误用 scandir 并触发 EPERM。
    // 这里先按固定 workspace 路径删除纯构建产物，不接收外部路径输入。
    await rm(path.join(webRoot, '.next'), { recursive: true, force: true, maxRetries: 3 });
    const nextCli = require.resolve('next/dist/bin/next', { paths: [webRoot] });
    const webEnv = {
      NEXT_PUBLIC_AMAP_SECURITY_CODE: 'deeptrail-e2e-security-code',
      PORT: '3000',
    };
    // E2E 使用 production server，避免 Next dev 把浏览器主动取消请求打印成 uncaughtException 假红。
    await runCommand('Web production build', process.execPath, [nextCli, 'build'], webRoot, webEnv);
    mockAiServer = await startMockAiServer();
    const backend = startService(
      'API',
      process.execPath,
      [
        mavenRunner,
        '-Dspring-boot.run.profiles=test',
        '-Dspring-boot.run.arguments=--app.auth.enabled=true '
          + '--spring.ai.openai.base-url=http://127.0.0.1:18080 '
          + '--app.geocoding.enabled=false --app.geocoding.fallback-enabled=false',
        'spring-boot:run',
      ],
      serverRoot,
    );
    // 必须先确认 API 就绪，再开放 Web 监听；否则端口复用期间的遗留客户端会命中未就绪代理。
    await waitForService('API', backendHealthUrl, backend);
    const web = startService(
      'Web',
      process.execPath,
      [testWebServer],
      webRoot,
      // 仅验证安全密钥初始化时序；地图本身仍由页面级 AMap Mock 隔离，不访问外部 SDK。
      webEnv,
      true,
    );
    await waitForService('Web', frontendHealthUrl, web);
  }

  const playwrightCli = require.resolve('@playwright/test/cli');
  const result = spawn(process.execPath, [playwrightCli, 'test', ...testArgs], {
    cwd: root,
    env: { ...process.env, PLAYWRIGHT_EXTERNAL_SERVERS: 'true' },
    stdio: 'inherit',
    windowsHide: true,
  });
  // Playwright 运行期间，本进程必须继续响应本地 AI Mock 请求，不能使用同步子进程阻塞事件循环。
  exitCode = await new Promise((resolve, reject) => {
    result.once('error', reject);
    result.once('exit', (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  // Playwright 退出时可能仍有短暂的代理 keep-alive 请求，先让连接自然排空。
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const webChild = children.find((child) => child.serviceName === 'Web');
  const apiChild = children.find((child) => child.serviceName === 'API');
  if (webChild) {
    // IPC 关闭完成代表 Web 已排空代理请求，此后才允许终止 API。
    console.log(`E2E_CLEANUP_WEB_START at=${new Date().toISOString()}`);
    await stopProcessTreeGracefully(webChild);
    if (!(await waitForUnavailable(frontendHealthUrl))) {
      console.error(`Web 服务未在清理窗口内退出：${frontendHealthUrl}`);
      exitCode = 1;
    }
  }
  for (const child of children) {
    if (child !== webChild && child !== apiChild) {
      await stopProcessTreeGracefully(child);
    }
  }
  if (apiChild) {
    console.log(`E2E_CLEANUP_API_START at=${new Date().toISOString()}`);
    await stopProcessTreeGracefully(apiChild);
  }
  if (mockAiServer) {
    await new Promise((resolve) => mockAiServer.close(resolve));
  }
}

process.exit(exitCode);
