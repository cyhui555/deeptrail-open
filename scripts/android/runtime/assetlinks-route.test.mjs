import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const webRoot = resolve(repositoryRoot, 'apps/web');
const nextBin = resolve(webRoot, 'node_modules/next/dist/bin/next');
const validFingerprint = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join(':');

async function getAvailablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  server.close();
  await once(server, 'close');
  if (!port) throw new Error('无法分配本地测试端口');
  return port;
}

async function startWebServer(overrides) {
  const port = await getAvailablePort();
  const environment = { ...process.env, ...overrides };
  if (overrides.DEEPTRAIL_ANDROID_PACKAGE_ID === undefined) {
    delete environment.DEEPTRAIL_ANDROID_PACKAGE_ID;
  }
  if (overrides.DEEPTRAIL_ANDROID_CERT_SHA256 === undefined) {
    delete environment.DEEPTRAIL_ANDROID_CERT_SHA256;
  }

  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: webRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next Server 提前退出：${output.slice(-2000)}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/login`);
      if (response.ok) return { child, port };
    } catch {
      // 启动期间连接失败属于预期，直到期限结束才判定失败。
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  child.kill();
  throw new Error(`Next Server 启动超时：${output.slice(-2000)}`);
}

async function stopWebServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  let timeoutId;
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolveDelay) => {
      timeoutId = setTimeout(resolveDelay, 5_000);
    }),
  ]);
  clearTimeout(timeoutId);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function probeAssetLinks(overrides) {
  const { child, port } = await startWebServer(overrides);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/.well-known/assetlinks.json`, {
      redirect: 'manual',
    });
    return {
      status: response.status,
      cacheControl: response.headers.get('cache-control'),
      contentType: response.headers.get('content-type'),
      body: await response.text(),
    };
  } finally {
    await stopWebServer(child);
  }
}

test('标准路径在未配置时 404，合法配置时公开唯一 Android 关系', async () => {
  const unconfiguredResponse = await probeAssetLinks({
    DEEPTRAIL_ANDROID_PACKAGE_ID: undefined,
    DEEPTRAIL_ANDROID_CERT_SHA256: undefined,
  });
  assert.equal(unconfiguredResponse.status, 404);
  assert.equal(unconfiguredResponse.cacheControl, 'no-store');

  const configuredResponse = await probeAssetLinks({
    DEEPTRAIL_ANDROID_PACKAGE_ID: 'com.deeptrail.app',
    DEEPTRAIL_ANDROID_CERT_SHA256: validFingerprint,
  });
  assert.equal(configuredResponse.status, 200);
  assert.match(configuredResponse.contentType ?? '', /^application\/json/);
  assert.deepEqual(JSON.parse(configuredResponse.body), [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.deeptrail.app',
      sha256_cert_fingerprints: [validFingerprint.toUpperCase()],
    },
  }]);
});
