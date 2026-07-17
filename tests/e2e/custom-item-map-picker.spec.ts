import { test, expect } from '@playwright/test';
import { AMAP_MOCK_JS } from './lib/amap-mock';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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

async function generateAndWait(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  destination: string,
): Promise<string> {
  const genResp = await request.post(`${BACKEND_URL}/api/itineraries/generate`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      departureLocation: destination,
      departureTime: '2026-08-01 08:00:00',
      destination,
      days: 1,
      peopleCount: 2,
      budget: '1500',
      preferences: ['food'],
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

async function createTripPlan(
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
  return body.data;
}

async function startCheckin(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  planId: string,
): Promise<void> {
  const startResp = await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(startResp.ok()).toBeTruthy();

  // 地图交互依赖已生成的按日任务，先验证前置数据，失败时直接暴露服务侧原因。
  const tasksResp = await request.get(`${BACKEND_URL}/api/trips/${planId}/checkin`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(tasksResp.ok()).toBeTruthy();
  const tasksBody = await tasksResp.json();
  expect(tasksBody.data?.length).toBeGreaterThan(0);
}

test.describe('地图选点 + 逆地理编码 E2E', () => {
  test('添加行程点 → 地图选点 → 自动回填 lat/lng + 地址', async ({ page, request }) => {
    const username = `map_picker_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.addInitScript(AMAP_MOCK_JS);
    await page.route('**/api/geocode?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ address: '四川省成都市测试地址' }),
      });
    });
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Hangzhou');
    const planId = await createTripPlan(request, token, 'Map Picker Test', taskId);
    await startCheckin(request, token, planId);

    await page.goto(`${FRONTEND_URL}/trips/${planId}`);
    // 容错：dev server 偶发"missing required error components"瞬时错误，reload 一次
    if (await page.getByText('missing required error components').isVisible().catch(() => false)) {
      await page.reload();
    }
    await expect(page.getByText('Map Picker Test')).toBeVisible({ timeout: 15000 });

    // 展开第 1 天
    await page.getByRole('button', { name: /第\s*1\s*天/ }).click();

    // 打开"添加行程点"弹窗
    await page.getByRole('button', { name: '添加地点' }).click();
    const addDlg = page.locator('form', { hasText: '确认添加' });
    await expect(addDlg).toBeVisible({ timeout: 5000 });

    // 填地名
    await addDlg.getByPlaceholder(/朋友推荐的小店/).fill('地图选点POI');

    // 验证"地图选点"按钮存在
    const pickerBtn = addDlg.getByRole('button', { name: '地图选点' });
    await expect(pickerBtn).toBeVisible({ timeout: 5000 });

    // 点击打开地图弹窗
    await pickerBtn.click();
    const locationDialog = page.getByRole('dialog', { name: '在地图上选点' });
    await expect(locationDialog).toBeVisible({ timeout: 10000 });

    // 地图实例创建后 mock 会写入就绪标记，直接点击真实地图容器。
    const readyMap = locationDialog.locator('[data-amap-ready="true"]');
    await expect(readyMap).toBeVisible({ timeout: 10000 });
    await readyMap.click();

    // 验证"当前：" 不再是 '未选点'
    const coordText = locationDialog.getByText(/^当前：/);
    await expect(coordText).toBeVisible({ timeout: 5000 });
    await expect(coordText).not.toContainText('未选点', { timeout: 3000 });
    await expect(locationDialog.getByText('四川省成都市测试地址')).toBeVisible({ timeout: 5000 });

    // 点击"确认选点"
    await locationDialog.getByRole('button', { name: '确认选点' }).click();
    await expect(page.getByRole('heading', { name: '在地图上选点' })).toBeHidden({ timeout: 5000 });

    // 验证 lat 输入框已填充（非空）
    const latInput = addDlg.getByPlaceholder('例如：30.67');
    await expect(latInput).not.toHaveValue('', { timeout: 5000 });

    // 验证 lng 输入框已填充（非空）
    const lngInput = addDlg.getByPlaceholder('例如：104.06');
    await expect(lngInput).not.toHaveValue('', { timeout: 5000 });

    // 验证地址字段已自动回填（逆地理编码）
    const addressInput = addDlg.getByPlaceholder('例如：人民南路二段');
    await expect(addressInput).not.toHaveValue('', { timeout: 5000 });
    const addressVal = await addressInput.inputValue();
    expect(addressVal.length).toBeGreaterThan(0);

    // 提交添加
    await addDlg.getByRole('button', { name: '确认添加' }).click();
    await expect(page.locator('text=地图选点POI')).toBeVisible({ timeout: 5000 });
  });

  test('编辑行程点 → 已有坐标时按钮文案变为"重新选点"', async ({ page, request }) => {
    const username = `map_repick_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createTripPlan(request, token, 'Re-Pick Test', taskId);
    await startCheckin(request, token, planId);

    await page.goto(`${FRONTEND_URL}/trips/${planId}`);
    if (await page.getByText('missing required error components').isVisible().catch(() => false)) {
      await page.reload();
    }
    await expect(page.getByText('Re-Pick Test')).toBeVisible({ timeout: 15000 });

    // 展开 + 添加一个带坐标的自定义点
    await page.getByRole('button', { name: /第\s*1\s*天/ }).click();
    await page.getByRole('button', { name: '添加地点' }).click();
    const addDlg = page.locator('form', { hasText: '确认添加' });
    await expect(addDlg).toBeVisible({ timeout: 5000 });

    await addDlg.getByPlaceholder(/朋友推荐的小店/).fill('已有坐标点');
    await addDlg.getByPlaceholder('例如：30.67').fill('30.6700');
    await addDlg.getByPlaceholder('例如：104.06').fill('104.0600');
    await addDlg.getByRole('button', { name: '确认添加' }).click();
    await expect(page.locator('text=已有坐标点')).toBeVisible({ timeout: 5000 });

    // 打开编辑弹窗
    await page.getByRole('button', { name: '编辑' }).click();
    const editDlg = page.locator('form', { hasText: '保存' });
    await expect(editDlg).toBeVisible({ timeout: 5000 });

    // 验证按钮文案变为"重新选点"（因为有坐标）
    const repickBtn = editDlg.getByRole('button', { name: '重新选点' });
    await expect(repickBtn).toBeVisible({ timeout: 5000 });

    // 验证坐标预览文本可见
    await expect(editDlg.locator('text=/30.6700, 104.0600|30\\.6700, 104\\.0600/')).toBeVisible({ timeout: 3000 });
  });
});
