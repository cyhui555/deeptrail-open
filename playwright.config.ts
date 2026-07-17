import { defineConfig } from '@playwright/test';

const isCi = process.env.CI === 'true';
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER
  ? process.env.PLAYWRIGHT_REUSE_SERVER === 'true'
  : !isCi;
const captureDiagnostics = process.env.PLAYWRIGHT_CAPTURE_DIAGNOSTICS
  ? process.env.PLAYWRIGHT_CAPTURE_DIAGNOSTICS === 'true'
  : !isCi;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 240_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: isCi ? 1 : 0,
  workers: 1,
  reporter: isCi ? [['html', { open: 'never' }], ['line']] : 'list',
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    actionTimeout: 10_000,
    // 公开 CI 不保存可能含会话 Token 或页面数据的 trace/截图；本地诊断可显式开启。
    trace: captureDiagnostics ? 'on-first-retry' : 'off',
    screenshot: captureDiagnostics ? 'only-on-failure' : 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVERS === 'true' ? undefined : [
    {
      command:
        'mvn -Dspring-boot.run.profiles=test "-Dspring-boot.run.arguments=--app.auth.enabled=true" spring-boot:run',
      cwd: 'apps/server',
      // 只检查端口可用性，避免 Windows 上 Node HTTP 探活受地址族影响而悬挂。
      port: 8080,
      timeout: 120_000,
      reuseExistingServer,
    },
    {
      command: 'pnpm dev',
      cwd: 'apps/web',
      port: 3000,
      timeout: 120_000,
      reuseExistingServer,
    },
  ],
});
