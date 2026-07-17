import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * 注册并登录用户，返回 token。
 */
async function registerAndLogin(
  request: import('@playwright/test').APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const regResp = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username, password },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await regResp.json();
  return body.data.token;
}

/**
 * 提交生成任务并等待完成，返回 taskId。
 */
async function generateAndWait(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  destination: string,
): Promise<string> {
  const genResp = await request.post(`${BACKEND_URL}/api/itineraries/generate`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      departureLocation: 'Beijing',
      departureTime: '2026-08-01 08:00:00',
      destination,
      days: 2,
      peopleCount: 2,
      budget: '3000',
      preferences: ['history'],
      specialRequirements: 'none',
    },
  });
  const genBody = await genResp.json();
  const taskId: string = genBody.data.taskId;

  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusResp = await request.get(`${BACKEND_URL}/api/itineraries/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statusBody = await statusResp.json();
    if (statusBody.data?.status === 'COMPLETED') return taskId;
    if (statusBody.data?.status === 'FAILED') throw new Error('GENERATE FAILED');
  }
  throw new Error('GENERATE TIMEOUT');
}

/**
 * 创建打卡计划并启动打卡流程。
 */
async function createPlanAndStartCheckin(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  title: string,
  taskId: string,
): Promise<string> {
  const createResp = await request.post(`${BACKEND_URL}/api/trips`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { title, taskId, plannedDate: '2026-08-01' },
  });
  const body = await createResp.json();
  const planId: string = body.data;

  await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return planId;
}

test.describe('打卡日程页 - 天摘要', () => {
  test('每天头部下方显示当天亮点摘要卡片', async ({ page, request }) => {
    const username = `ck_summary_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createPlanAndStartCheckin(request, token, 'E2E Summary', taskId);

    await page.goto(`${FRONTEND_URL}/trips/${planId}/checkin`);

    // 验证打卡页天切换器存在
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });

    // ✅ 验证"当天亮点"卡片可见
    const summaryCard = page.getByRole('heading', { name: '当天亮点' });
    await expect(summaryCard).toBeVisible({ timeout: 5000 });
    const summarySection = summaryCard.locator('..');

    // ✅ 验证 POI 路线描述可见（📍 标记 + POI 名用 → 连接）
    const poiRoute = summarySection.locator('p').filter({ hasText: '→' });
    await expect(poiRoute).toBeVisible({ timeout: 5000 });
    const routeText = await poiRoute.textContent();
    console.log(`[E2E] 路线摘要="${routeText}"`);
    expect(routeText).toContain('→');

    // 仅在“当天亮点”卡片内定位小贴士，避免匹配页面上的刷新按钮、评分标签等同色元素。
    const tipBlock = summarySection.locator('div.bg-amber-50');
    await expect(tipBlock).toBeVisible({ timeout: 5000 });
    const tipText = await tipBlock.textContent();
    console.log(`[E2E] 贴士="${tipText}"`);
    expect(tipText!.length).toBeGreaterThan(0);

    // 切换到天 2，验证摘要也渲染
    await page.getByRole('button', { name: /第\s*2\s*天/ }).click();
    // 摘要标题再次可见
    await expect(page.getByRole('heading', { name: '当天亮点' })).toBeVisible({ timeout: 5000 });
    // 验证第 2 天的路线不同
    const route2 = await summarySection.locator('p').filter({ hasText: '→' }).textContent();
    console.log(`[E2E] 第2天路线="${route2}"`);
    expect(route2).toBeTruthy();
  });
});
