import {
  test,
  expect,
  type APIRequestContext,
  type Page,
  type Request,
} from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const pendingFrontendApiRequests = new WeakMap<Page, Set<Request>>();

function isFrontendApiRequest(request: Request): boolean {
  const requestUrl = new URL(request.url());
  const frontendUrl = new URL(FRONTEND_URL);
  return requestUrl.origin === frontendUrl.origin && requestUrl.pathname.startsWith('/api/');
}

test.beforeEach(({ page }) => {
  const pending = new Set<Request>();
  pendingFrontendApiRequests.set(page, pending);
  page.on('request', (request) => {
    if (isFrontendApiRequest(request)) pending.add(request);
  });
  const settle = (request: Request) => pending.delete(request);
  page.on('requestfinished', settle);
  page.on('requestfailed', settle);
});

test.afterEach(async ({ page, request }) => {
  if (!page.isClosed()) await page.goto('about:blank');
  const pending = pendingFrontendApiRequests.get(page);
  await expect.poll(() => pending?.size ?? 0, {
    message: '页面卸载后仍有前端 API 请求未终结',
    timeout: 10_000,
  }).toBe(0);

  // 通过同一 Next 代理建立收尾屏障，确保先前的请求已在代理层完成后再关闭测试上下文。
  const proxyBarrier = await request.get(`${FRONTEND_URL}/api/health`);
  expect(proxyBarrier.ok()).toBeTruthy();
});

function waitForTaskList(page: Page) {
  return page.waitForResponse((response) => (
    response.request().method() === 'GET'
      && response.url().includes('/api/itineraries/tasks?')
  ));
}

async function gotoHomeAndWaitForTasks(page: Page): Promise<void> {
  const taskList = waitForTaskList(page);
  await page.goto('/');
  expect((await taskList).ok()).toBeTruthy();
}

async function registerAndSetCookie(
  page: Page,
  request: APIRequestContext,
): Promise<void> {
  await page.goto('/login');
  const username = `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const response = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username, password: 'Test123456' },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body?.data?.token).toBeTruthy();

  await page.context().addCookies([
    { name: 'token', value: body.data.token, domain: 'localhost', path: '/' },
  ]);
}

test.describe('CI smoke without external AI', () => {
  test.describe.configure({ timeout: 45_000 });

  test.beforeEach(async ({ page, request }) => {
    await registerAndSetCookie(page, request);
  });

  test('opens authenticated home with a test fixture account', async ({ page }) => {
    await gotoHomeAndWaitForTasks(page);

    await expect(page).toHaveTitle(/旅迹/);
    await expect(page.getByRole('banner')).toContainText('旅迹');
  });

  test('shows install action only after the browser reports app installability', async ({ page }) => {
    await gotoHomeAndWaitForTasks(page);
    const installButton = page.getByRole('button', { name: '安装旅迹 App' });
    await expect(installButton).toHaveCount(0);

    await page.evaluate(() => {
      const installState = window as unknown as { __deeptrailInstallPromptCalled?: boolean };
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.defineProperties(event, {
        prompt: {
          value: async () => { installState.__deeptrailInstallPromptCalled = true; },
        },
        userChoice: {
          value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
        },
      });
      window.dispatchEvent(event);
    });

    await expect(installButton).toBeVisible();
    await installButton.click();
    await expect.poll(() => page.evaluate(() => (
      window as unknown as { __deeptrailInstallPromptCalled?: boolean }
    ).__deeptrailInstallPromptCalled)).toBe(true);
    await expect(installButton).toHaveCount(0);
  });

  test('switches three planner tabs without external calls', async ({ page }) => {
    await gotoHomeAndWaitForTasks(page);

    for (const name of ['生成行程', '优化行程', '小红书']) {
      const tab = page.getByRole('tab', { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('正文框粘贴短链时自动按链接提交', async ({ page }) => {
    const shortUrl = 'http://xhslink.com/o/example';
    let submittedPayload: Record<string, unknown> | undefined;
    await page.route('**/api/itineraries/from-xiaohongshu', async (route) => {
      submittedPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'ok',
          data: { taskId: 'xhs-auto-detected-url' },
        }),
      });
    });
    await gotoHomeAndWaitForTasks(page);
    await page.getByRole('tab', { name: '小红书', exact: true }).click();

    await page.getByPlaceholder('直接复制粘贴小红书笔记的正文内容到这里...').fill(shortUrl);
    await page.getByRole('button', { name: '从小红书生成行程' }).click();

    await expect(page.getByText('任务已提交')).toBeVisible({ timeout: 5000 });
    expect(submittedPayload).toMatchObject({ url: shortUrl });
    expect(submittedPayload).not.toHaveProperty('noteContent');
  });

  test('completed task with invalid days fails closed without exposing raw model text', async ({ page }) => {
    const taskId = 'smoke-invalid-structured-result';
    const rawModelText = '{invalid model payload that must stay hidden}';
    await page.route(`**/api/itineraries/tasks/${taskId}/node-revisions`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'ok', data: [] }),
      }));
    await page.route(`**/api/itineraries/tasks/${taskId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'ok',
          data: {
            taskId,
            type: 'GENERATE',
            status: 'COMPLETED',
            submittedAt: '2026-07-17T04:00:00Z',
            completedAt: '2026-07-17T04:00:01Z',
            summary: '北京行程生成任务',
            requestJson: '{"destination":"北京","days":2}',
            result: { summary: rawModelText, days: null },
          },
        }),
      }));

    await page.goto(`/itineraries/${taskId}`);

    await expect(page.getByRole('heading', { name: '行程结构无效' })).toBeVisible();
    await expect(page.getByRole('link', { name: '返回首页重试' })).toBeVisible();
    await expect(page.getByText(rawModelText, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /加入行程清单/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /优化/ })).toHaveCount(0);
  });

  test('mobile pages fit the viewport and keep navigation reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHomeAndWaitForTasks(page);

    const mobileNav = page.locator('nav.app-bottom-nav');
    await expect(mobileNav).toBeVisible();

    const assertNoHorizontalOverflow = async () => {
      const metrics = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    };

    await assertNoHorizontalOverflow();
    const dock = await mobileNav.locator('.app-bottom-nav__panel').boundingBox();
    expect(dock).not.toBeNull();
    expect(dock!.x).toBeGreaterThanOrEqual(0);
    expect(dock!.x + dock!.width).toBeLessThanOrEqual(390);

    await mobileNav.getByRole('link', { name: '行程', exact: true }).click();
    await expect(page.getByRole('heading', { name: '我的行程' })).toBeVisible();
    await assertNoHorizontalOverflow();

    await mobileNav.getByRole('link', { name: '我的', exact: true }).click();
    await expect(page.getByRole('heading', { name: '个人资料' })).toBeVisible();
    await assertNoHorizontalOverflow();
  });

  test('same-origin proxy login accepts loopback host aliases', async ({ request }) => {
    const username = `loopback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const password = 'Test123456';
    const registerResponse = await request.post(`${BACKEND_URL}/api/auth/register`, {
      data: { username, password },
    });
    expect(registerResponse.ok()).toBeTruthy();

    const loginResponse = await request.post('http://127.0.0.1:3000/api/auth/login', {
      headers: { Origin: 'http://127.0.0.1:3000' },
      data: { username, password },
    });
    expect(loginResponse.ok()).toBeTruthy();
    expect((await loginResponse.json())?.success).toBe(true);
  });

  test('creates blank trip and opens it from trip list', async ({ page }) => {
    const title = `Smoke Trip ${Date.now()}`;
    await page.goto('/trips');
    await page.getByRole('button', { name: /新建行程/ }).click();
    await page.getByPlaceholder('例如：云南七日游').fill(title);
    await page.getByRole('button', { name: '创建行程' }).click();

    await expect(page).toHaveURL(/\/trips\/[a-zA-Z0-9-]+$/);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();

    await page.goto('/trips');
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();

    await gotoHomeAndWaitForTasks(page);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('link', { name: /查看行程/ })).toBeVisible();
  });

  test('ordinary account cannot open the admin route', async ({ page }) => {
    const taskList = waitForTaskList(page);
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/$/);
    expect((await taskList).ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: '快速规划' })).toBeVisible();
  });
});

test('public registration is closed in the Web experience', async ({ page }) => {
  const meRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/me')) meRequests.push(request.url());
  });
  await page.goto('/login');
  await expect(page.getByText('账号由管理员统一分配')).toBeVisible();
  await expect(page.getByRole('link', { name: '创建账号' })).toHaveCount(0);
  expect(meRequests).toEqual([]);

  await page.goto('/register');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '登录旅迹' })).toBeVisible();
});

test('browser auth uses HttpOnly cookie and logout clears it', async ({ page, request }) => {
  const failedAuthNavigations: string[] = [];
  page.on('requestfailed', (failedRequest) => {
    if (failedRequest.url().includes('/login?redirect=') && failedRequest.url().includes('_rsc=')) {
      failedAuthNavigations.push(failedRequest.url());
    }
  });
  const username = `cookie_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const registration = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username, password: 'Test123456' },
  });
  expect(registration.ok()).toBeTruthy();

  await page.goto('/login');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill('Test123456');
  const firstTaskList = waitForTaskList(page);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await firstTaskList).ok()).toBeTruthy();

  const tokenCookie = (await page.context().cookies())
    .find((cookie) => cookie.name === 'token');
  expect(tokenCookie).toBeDefined();
  expect(tokenCookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain('token=');

  await page.goto('/profile');
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'token')).toBe(false);
  expect(failedAuthNavigations).toEqual([]);
});

test('login and logout survive unavailable IndexedDB', async ({ page, request }) => {
  const username = `storage_fault_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const password = 'Test123456';
  const registration = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username, password },
  });
  expect(registration.ok()).toBeTruthy();

  await page.addInitScript(() => {
    const storageFailure = () => {
      throw new DOMException('Internal error.', 'UnknownError');
    };
    const availableIndexedDb = window.indexedDB;
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: new Proxy(availableIndexedDb, {
        get(target, property) {
          if (property === 'open' || property === 'deleteDatabase') return storageFailure;
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    });
  });

  await page.goto('/login');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill(password);
  const firstTaskList = waitForTaskList(page);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await firstTaskList).ok()).toBeTruthy();

  await page.goto('/profile');
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill(password);
  const secondTaskList = waitForTaskList(page);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await secondTaskList).ok()).toBeTruthy();

  await page.goto('/login');
  const logoutResponse = page.waitForResponse((response) => (
    response.url().includes('/api/auth/logout') && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: '清除当前登录状态' }).click();
  await expect((await logoutResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(async () => (
    (await page.context().cookies()).some((cookie) => cookie.name === 'token')
  )).toBe(false);
});

test('admin can assign and disable a user account', async ({ page, request }) => {
  const loginResponse = await request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { username: 'admin', password: '123123' },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginBody = await loginResponse.json();
  expect(loginBody?.data?.role).toBe('ADMIN');
  await page.context().addCookies([
    { name: 'token', value: loginBody.data.token, domain: 'localhost', path: '/' },
  ]);

  const username = `assigned_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible();
  await page.getByRole('button', { name: '分配账号' }).click();
  await page.locator('#admin-username').fill(username);
  await page.locator('#admin-password').fill('Assigned123');
  await page.locator('#admin-confirm-password').fill('Assigned123');
  await page.getByRole('button', { name: '创建账号' }).click();

  const userRow = page.getByRole('row').filter({ hasText: username });
  await expect(userRow).toContainText('已启用');
  await userRow.getByRole('button', { name: '停用' }).click();
  await page.getByRole('button', { name: '确认停用' }).click();
  await expect(userRow).toContainText('已停用');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  await expect(page.getByRole('article').filter({ hasText: username })).toContainText('已停用');
  const mobileMetrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(mobileMetrics.documentWidth).toBeLessThanOrEqual(mobileMetrics.viewportWidth);
});

test('offline fallback is public and contains no authenticated page data', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3000/offline.html', {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('旅迹');
});
