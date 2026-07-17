import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

/**
 * 辅助函数：注册并登录用户，返回 token。
 */
async function registerAndLogin(request: any, username: string, password: string): Promise<string> {
  const regResp = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username, password },
  });
  expect(regResp.ok()).toBeTruthy();
  const regBody = await regResp.json();
  return regBody.data.token;
}

/**
 * 提交生成任务并等待完成，返回 taskId。
 */
async function generateAndWait(request: any, token: string, destination: string): Promise<string> {
  const genResp = await request.post(`${BACKEND_URL}/api/itineraries/generate`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      departureLocation: destination,
      departureTime: '2026-07-01 09:00:00',
      destination,
      days: 1,
      peopleCount: 2,
      budget: '1000',
      preferences: ['food'],
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
  throw new Error('Failed to generate itinerary');
}

/**
 * 创建行程清单，返回 planId。
 */
async function createTripPlan(request: any, token: string, title: string, taskId: string): Promise<string> {
  const createResp = await request.post(`${BACKEND_URL}/api/trips`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, taskId, plannedDate: '2026-07-01' },
  });
  const body = await createResp.json();
  return body.data;
}

test.describe('打卡点地图 E2E', () => {
  test('打卡页面应展示地图容器和路线切换控件', async ({ page, request }) => {
    const username = `map_e2e_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(
      request,
      token,
      process.env.LIVE_AMAP === 'true' ? '成都' : 'Chengdu',
    );
    const planId = await createTripPlan(request, token, 'Map Test', taskId);

    // 开始打卡
    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
      // 真实 Provider 验收可能触发坐标纠偏，允许其完成外部地理编码降级。
      timeout: process.env.LIVE_AMAP === 'true' ? 60000 : 10000,
    });

    // 访问打卡页面
    await page.goto(`/trips/${planId}/checkin`);
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({
      timeout: process.env.LIVE_AMAP === 'true' ? 30000 : 10000,
    });

    // 验证地图容器存在（高德地图渲染到 div 中）
    const mapContainer = page.locator('[class*="rounded-xl"][class*="overflow-hidden"]');
    await expect.poll(async () => mapContainer.evaluateAll((elements) => elements.some((element) => {
      const style = window.getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none';
    })), { timeout: 10000 }).toBe(true);

    // 本地或部署验收可显式开启真实高德集成检查；常规 E2E 仍使用确定性 Mock。
    if (process.env.LIVE_AMAP === 'true') {
      await expect(page.getByText('地图暂不可用')).toHaveCount(0);
      await expect(page.locator('.amap-maps')).toBeVisible({ timeout: 15000 });
    }

    // 验证路线切换控件存在
    await expect(page.getByRole('button', { name: '计划路线' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: '实际路线' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'GPS轨迹' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: '全部显示' })).toBeVisible({ timeout: 5000 });
  });

  test('切换路线模式应高亮对应按钮', async ({ page, request }) => {
    const username = `map_route_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Beijing');
    const planId = await createTripPlan(request, token, 'Route Test', taskId);

    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await page.goto(`/trips/${planId}/checkin`);
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });

    // 点击"实际路线"按钮
    const actualBtn = page.getByRole('button', { name: '实际路线' });
    await actualBtn.click();

    await expect(actualBtn).toHaveAttribute('aria-pressed', 'true');

    // 点击"全部显示"
    const allBtn = page.getByRole('button', { name: '全部显示' });
    await allBtn.click();
    await expect(allBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('坐标修正 API 调用后应显示已修正角标', async ({ page, request }) => {
    const username = `map_correct_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createTripPlan(request, token, 'Correct Test', taskId);

    // 开始打卡
    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 获取第一个打卡项 ID
    const tasksResp = await request.get(`${BACKEND_URL}/api/trips/${planId}/checkin`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const tasksBody = await tasksResp.json();
    const firstItem = tasksBody.data[0]?.items[0];

    if (!firstItem) {
      test.skip();
      return;
    }

    // 调用坐标修正 API
    const updateResp = await request.put(
      `${BACKEND_URL}/api/itineraries/checkin/items/${firstItem.id}/coordinates`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { lat: 30.5728, lng: 104.0668 },
      },
    );
    expect(updateResp.ok()).toBeTruthy();

    // 访问打卡页面
    await page.goto(`/trips/${planId}/checkin`);
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });

    // 验证"已修正"角标显示
    const correctedItem = page.getByRole('group', { name: `在地图中查看 ${firstItem.poiName}` });
    await expect(correctedItem.getByText('已修正', { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('坐标修正 API — 无效坐标应返回 errorCode=VALIDATION_FAILED', async ({ request }) => {
    const username = `map_invalid_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createTripPlan(request, token, 'Invalid Test', taskId);

    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const tasksResp = await request.get(`${BACKEND_URL}/api/trips/${planId}/checkin`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const tasksBody = await tasksResp.json();
    const firstItem = tasksBody.data[0]?.items[0];

    if (!firstItem) {
      test.skip();
      return;
    }

    // 发送无效坐标（纬度超出范围）— 后端返回 200 + errorCode
    const updateResp = await request.put(
      `${BACKEND_URL}/api/itineraries/checkin/items/${firstItem.id}/coordinates`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { lat: 999.0, lng: 104.0668 },
      },
    );
    const body = await updateResp.json();
    expect(body.success).toBeFalsy();
    expect(body.errorCode).toBe('VALIDATION_FAILED');
  });

  test('坐标修正 API — 不存在的打卡项应返回 errorCode=CHECKIN_ITEM_NOT_FOUND', async ({ request }) => {
    const username = `map_404_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    const updateResp = await request.put(
      `${BACKEND_URL}/api/itineraries/checkin/items/999999/coordinates`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { lat: 30.5728, lng: 104.0668 },
      },
    );
    const body = await updateResp.json();
    expect(body.success).toBeFalsy();
    expect(body.errorCode).toBe('CHECKIN_ITEM_NOT_FOUND');
  });
});
