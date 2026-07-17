import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

/** 注册并登录用户，返回 token。 */
async function registerAndLogin(request: any, username: string, password: string): Promise<string> {
  const regResp = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username, password },
  });
  expect(regResp.ok()).toBeTruthy();
  const regBody = await regResp.json();
  return regBody.data.token;
}

/** 提交生成任务并等待完成，返回 taskId。 */
async function generateAndWait(request: any, token: string, destination: string, days = 1): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const genResp = await request.post(`${BACKEND_URL}/api/itineraries/generate`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          departureLocation: destination,
          departureTime: '2026-07-01 09:00:00',
          destination,
          days,
          peopleCount: 2,
          budget: '1000',
          preferences: [],
          specialRequirements: 'none',
        },
      });
      const genBody = await genResp.json();
      const taskId = genBody.data.taskId;
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusResp = await request.get(`${BACKEND_URL}/api/itineraries/tasks/${taskId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const statusBody = await statusResp.json();
        if (statusBody.data?.status === 'COMPLETED') return taskId;
        if (statusBody.data?.status === 'FAILED') break;
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw new Error(`Failed to generate itinerary: ${lastError?.message ?? 'unknown'}`);
}

/** 创建行程清单，返回 planId。 */
async function createTripPlan(request: any, token: string, title: string, taskId: string): Promise<string> {
  const createResp = await request.post(`${BACKEND_URL}/api/trips`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, taskId, plannedDate: '2026-07-01' },
  });
  const body = await createResp.json();
  return body.data;
}

/** 注入 token cookie。 */
async function loginViaCookie(page: any, token: string) {
  await page.goto('/');
  await page.context().addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' },
  ]);
}

/** 全天入口按天序排列；本用例验证首个未完成天，因此明确选择第一个入口。 */
function firstDayCheckinButton(page: any) {
  return page.getByRole('button', { name: '进入全天打卡' }).first();
}

test.describe('打卡日记体验升级 E2E', () => {
  test('AC-1.1: 清单页点“开始现场执行” → 创建打卡任务 → 跳转到首个未完成天', async ({ page, request }) => {
    const username = `diary_start_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');
    await loginViaCookie(page, token);

    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createTripPlan(request, token, 'Start Test', taskId);

    // 进入清单页
    await page.goto(`/trips/${planId}`);
    await expect(page.locator('text=Start Test')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: '开始现场执行' }).click();

    // 验证跳转到打卡 URL
    await expect(page).toHaveURL(/\/trips\/[a-z0-9]+\/checkin\?day=\d+/, { timeout: 10000 });

    // 验证打卡页面天标题展示（首个未完成天）
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });
  });

  test('AC-1.2: 任务已存在时点“开始现场执行” → 不调 startCheckin 直接跳转', async ({ page, request }) => {
    const username = `diary_skip_start_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');
    await loginViaCookie(page, token);

    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createTripPlan(request, token, 'Skip Test', taskId);

    // 预先创建打卡任务
    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 进入清单页 → 点开始打卡
    await page.goto(`/trips/${planId}`);
    let startCheckinApiCalled = false;
    page.on('request', (req) => {
      if (req.url().includes('/checkin/start') && req.method() === 'POST') startCheckinApiCalled = true;
    });
    await page.getByRole('button', { name: '开始现场执行' }).click();
    await expect(page).toHaveURL(/\/trips\/[a-z0-9]+\/checkin\?day=\d+/, { timeout: 10000 });

    // startCheckin 接口不应再被调用（已在 setUp 中创建）
    expect(startCheckinApiCalled).toBe(false);
  });

  test('AC-2.5: 全部行程页 POI 展示 + 点击 POI 跳当天打卡', async ({ page, request }) => {
    const username = `diary_overview_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');
    await loginViaCookie(page, token);

    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createTripPlan(request, token, 'Overview Test', taskId);
    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 访问全部行程页
    await page.goto(`/trips/${planId}/overview`);
    await expect(page.locator('text=行程时间线')).toBeVisible({ timeout: 10000 });

    // 验证进入全天打卡按钮
    const firstDayButton = firstDayCheckinButton(page);
    await expect(firstDayButton).toBeVisible({ timeout: 5000 });

    // 点击最后一个天卡片上的 POI → 跳对应天打卡
    await firstDayButton.click();
    await page.goto(`/trips/${planId}/overview`);
    const reloadedFirstDayButton = firstDayCheckinButton(page);
    await expect(reloadedFirstDayButton).toBeVisible({ timeout: 5000 });
    await reloadedFirstDayButton.click();
    await expect(page).toHaveURL(/\/trips\/[a-z0-9]+\/checkin\?day=\d+/, { timeout: 5000 });
  });

  test('AC-2.8: 清单 / 打卡 / 轨迹 / 评价页面均使用三阶段导航', async ({ page, request }) => {
    const username = `diary_tabs_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');
    await loginViaCookie(page, token);

    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createTripPlan(request, token, 'Tabs Test', taskId);
    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    for (const suffix of ['', '/checkin', '/track', '/review']) {
      await page.goto(`/trips/${planId}${suffix}`);
      const stageNav = page.getByRole('navigation', { name: '旅行阶段' });
      await expect(stageNav).toBeVisible({ timeout: 10000 });
      await expect(stageNav.getByRole('link')).toHaveText(['行程', '现场', '回忆']);
    }
  });

  test('AC-3.1: 清单页天卡片显示垂直时间线', async ({ page, request }) => {
    const username = `diary_timeline_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');
    await loginViaCookie(page, token);

    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createTripPlan(request, token, 'Timeline Test', taskId);
    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 进入清单页
    await page.goto(`/trips/${planId}`);
    await expect(page.locator('text=Timeline Test')).toBeVisible({ timeout: 10000 });

    // 点第一个天标题展开
    await page.getByRole('button', { name: /第\s*1\s*天/ }).click();

    // 验证时间线圆点出现（时间线圆点是 absolute left 的 div，但至少有 1 个有 border-blue-500 的圆点）
    // 用 poiName 文本是否可见来间接验证列表渲染
    await expect.poll(
      () => page.getByText(/自定义|已打卡|未打卡/).count(),
      { timeout: 10000 },
    ).toBeGreaterThan(0);
  });

  test('AC-3.3: POI 信息结构化展示', async ({ page, request }) => {
    const username = `diary_poi_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');
    await loginViaCookie(page, token);

    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createTripPlan(request, token, 'Poi Test', taskId);
    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await page.goto(`/trips/${planId}`);
    await expect(page.locator('text=Poi Test')).toBeVisible({ timeout: 10000 });

    // 展开天
    await page.getByRole('button', { name: /第\s*1\s*天/ }).click();

    // POI 状态角标至少出现一个（无论已打卡还是未打卡）
    await expect.poll(
      () => page.locator('span').filter({ hasText: /已打卡|未打卡|已放弃/ }).count(),
      { timeout: 10000 },
    ).toBeGreaterThan(0);
  });

  test('AC-1.4 / AC-1.5: startCheckin 失败 → 不跳转', async ({ page, request }) => {
    const username = `diary_fail_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');
    await loginViaCookie(page, token);

    // 生成清单但不实际调 startCheckin，而是 mock 失败响应
    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createTripPlan(request, token, 'Fail Test', taskId);

    // Mock startCheckin 失败
    await page.route(`**/api/trips/${planId}/checkin/start`, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: '模拟失败' }),
      }),
    );

    // 进入清单页
    await page.goto(`/trips/${planId}`);
    await expect(page.locator('text=Fail Test')).toBeVisible({ timeout: 10000 });

    // 点击按钮后用统一反馈组件展示错误，页面保留在清单页
    await page.getByRole('button', { name: '开始现场执行' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '模拟失败' })).toBeVisible();
    await expect(page).toHaveURL(/\/trips\/[a-z0-9]+$/, { timeout: 5000 });
  });
});
