import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { AMAP_MOCK_JS } from './lib/amap-mock';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

/** 为任务所属用户注入认证 cookie，避免跨用户访问被安全层拒绝。 */
async function useToken(page: Page, token: string): Promise<void> {
  await page.context().addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' },
  ]);
}

/**
 * 节点修正用例固定操作时间线首节点，顺序本身是保存后继续删除同一修正的业务前提。
 * 先按按钮可访问名称收敛候选，再明确选择首节点，避免依赖样式 title。
 */
function firstNodeEditButton(page: Page) {
  return page.getByRole('button', { name: /^修正.+的坐标或交通$/ }).first();
}

/**
 * 通过 API 创建一个已完成 GENERATE 任务并返回 taskId。
 */
async function createCompletedTask(
  request: APIRequestContext,
): Promise<{ taskId: string; token: string }> {
  const regResp = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username: `node_rev_create_${Date.now()}`, password: 'Test123456' },
  });
  const token = (await regResp.json()).data.token as string;

  const genResp = await request.post(`${BACKEND_URL}/api/itineraries/generate`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      departureLocation: '上海',
      departureTime: '2026-08-01 09:00:00',
      destination: '杭州',
      days: 2,
      peopleCount: 2,
      budget: '2000',
      preferences: ['休闲游'],
      specialRequirements: 'none',
    },
  });
  expect(genResp.ok()).toBeTruthy();
  const taskId = (await genResp.json()).data.taskId as string;

  // 轮询直到任务完成（最多 60 秒）
  for (let i = 0; i < 30; i++) {
    const statusResp = await request.get(`${BACKEND_URL}/api/itineraries/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statusBody = await statusResp.json();
    if (statusBody.data?.status === 'COMPLETED') {
      return { taskId, token };
    }
    if (statusBody.data?.status === 'FAILED') {
      throw new Error('Task failed');
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Task did not complete in time');
}

/**
 * 通过 API 删除节点修正（清理测试数据）。
 */
async function cleanupRevisions(request: APIRequestContext, taskId: string, token: string) {
  const listResp = await request.get(
    `${BACKEND_URL}/api/itineraries/tasks/${taskId}/node-revisions`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const listBody = await listResp.json();
  for (const rev of listBody.data ?? []) {
    await request.delete(
      `${BACKEND_URL}/api/itineraries/tasks/${taskId}/node-revisions/${rev.dayIndex}/${rev.itemIndex}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }
}

// ============================================================
// 测试套件 1：单元级弹窗 UI 交互（无需真实任务）
// 通过直接 URL 访问一个已存在的 COMPLETED 任务页面
// ============================================================
test.describe('节点修正弹窗 - UI 交互', () => {
  let taskId: string;
  let token: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const created = await createCompletedTask(page.context().request);
    taskId = created.taskId;
    token = created.token;
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await useToken(page, token);
    await page.goto(`/itineraries/${taskId}`);
    // 等待时间轴渲染
    await expect(page.getByRole('heading', { name: '行程概览' })).toBeVisible({ timeout: 10000 });
  });

  test('点击行程点编辑按钮打开弹窗', async ({ page }) => {
    // 找第一个编辑按钮（修正坐标或交通）
    const editBtn = firstNodeEditButton(page);
    await editBtn.click();

    // 弹窗标题可见
    await expect(page.locator('text=修正行程节点')).toBeVisible();
    // 两个 Tab 可见
    await expect(page.locator('text=地理坐标')).toBeVisible();
    await expect(page.locator('text=交通衔接')).toBeVisible();
  });

  test('关闭弹窗：点击 × 按钮关闭', async ({ page }) => {
    const editBtn = firstNodeEditButton(page);
    await editBtn.click();
    await expect(page.locator('text=修正行程节点')).toBeVisible();

    await page.locator('button[aria-label="关闭"]').click();
    await expect(page.locator('text=修正行程节点')).not.toBeVisible();
  });

  test('地理 tab：仅填纬度时保存按钮禁用 + 显示错误提示', async ({ page }) => {
    const editBtn = firstNodeEditButton(page);
    await editBtn.click();
    await expect(page.locator('text=修正行程节点')).toBeVisible();

    // 切换到地理 tab（默认就是，但显式点击更稳）
    await page.locator('text=地理坐标').click();

    // 只填纬度
    const latInput = page.getByPlaceholder('例如 30.746500');
    await latInput.fill('30.7465');

    // 保存按钮应禁用（因为 lat/lng 必须同时填写）
    const saveBtn = page.locator('button:has-text("保存")');
    await expect(saveBtn).toBeDisabled();
    // 错误提示可见
    await expect(page.locator('text=纬度与经度必须同时填写')).toBeVisible();
  });

  test('交通 tab：选择交通方式并填写耗时后保存按钮可用', async ({ page }) => {
    const editBtn = firstNodeEditButton(page);
    await editBtn.click();
    await expect(page.locator('text=修正行程节点')).toBeVisible();

    await page.locator('text=交通衔接').click();
    // 选择"驾车"
    await page.locator('button:has-text("驾车")').click();
    // 填写耗时
    await page.getByPlaceholder('例如 10').fill('25');

    const saveBtn = page.locator('button:has-text("保存")');
    await expect(saveBtn).toBeEnabled();
  });

  test('点击"取消"按钮关闭弹窗且不保存', async ({ page }) => {
    const editBtn = firstNodeEditButton(page);
    await editBtn.click();
    await expect(page.locator('text=修正行程节点')).toBeVisible();

    await page.locator('text=地理坐标').click();
    await page.getByPlaceholder('例如 30.746500').fill('30.7465');
    await page.getByPlaceholder('例如 120.755800').fill('120.7558');

    await page.locator('button:has-text("取消")').click();
    await expect(page.locator('text=修正行程节点')).not.toBeVisible();
  });
});

// ============================================================
// 测试套件 2：端到端保存流程（调用真实 API）
// ============================================================
test.describe('节点修正 API 集成', () => {
  let taskId: string;
  let token: string;

  test.beforeAll(async ({ request }) => {
    const created = await createCompletedTask(request);
    taskId = created.taskId;
    token = created.token;
  });

  test.afterAll(async ({ request }) => {
    if (taskId) {
      await cleanupRevisions(request, taskId, token);
    }
  });

  test('保存交通修正 → 行程点显示修正徽章', async ({ page }) => {
    await useToken(page, token);
    await page.goto(`/itineraries/${taskId}`);

    // 等待时间轴渲染
    await expect(page.getByRole('heading', { name: '行程概览' })).toBeVisible({ timeout: 10000 });

    // 点击第一个编辑按钮
    const editBtn = firstNodeEditButton(page);
    await editBtn.click();

    // 切换到交通衔接 tab
    await page.locator('text=交通衔接').click();
    // 选择驾车
    await page.locator('button:has-text("驾车")').click();
    await page.getByPlaceholder('例如 10').fill('25');
    await page.getByPlaceholder('例如：经复兴大桥').fill('经复兴大桥');

    // 保存
    await page.locator('button:has-text("保存")').click();

    // 弹窗关闭
    await expect(page.locator('text=修正行程节点')).not.toBeVisible({ timeout: 5000 });

    // 显示交通修正徽章（🚗 交通）
    await expect(page.getByText('🚗 交通')).toBeVisible({ timeout: 5000 });
  });

  test('删除修正 → 修正徽章消失', async ({ page }) => {
    await useToken(page, token);
    await page.goto(`/itineraries/${taskId}`);

    // 等待修正徽章可见（上个测试已保存）
    await expect(page.getByText('🚗 交通')).toBeVisible({ timeout: 10000 });

    // 找到有修正徽章的行程点，点击它的编辑按钮
    // 已修节点的编辑按钮是常驻绿色（opacity 默认 1），hover 不要求
    const editBtn = firstNodeEditButton(page);
    await editBtn.click();

    // 弹窗打开后切换到交通 tab，确认有"删除修正"按钮
    await expect(page.locator('text=修正行程节点')).toBeVisible();
    await page.locator('text=交通衔接').click();

    const deleteBtn = page.locator('button:has-text("删除修正")');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // 弹窗关闭，修正徽章消失
    await expect(page.locator('text=修正行程节点')).not.toBeVisible({ timeout: 5000 });
    // 使用 web-first 断言等待刷新完成，避免固定时间仍可能早于慢环境的状态提交。
    await expect(page.getByText('🚗 交通')).toHaveCount(0);
  });

  test('半填 lat/lng 时保存按钮保持禁用', async ({ page }) => {
    await useToken(page, token);
    await page.goto(`/itineraries/${taskId}`);

    await expect(page.getByRole('heading', { name: '行程概览' })).toBeVisible({ timeout: 10000 });

    const editBtn = firstNodeEditButton(page);
    await editBtn.click();
    await expect(page.locator('text=修正行程节点')).toBeVisible();

    // 仅填纬度
    await page.getByPlaceholder('例如 30.746500').fill('30.7465');

    const saveBtn = page.locator('button:has-text("保存")');
    await expect(saveBtn).toBeDisabled();
  });
});

// ============================================================
// 测试套件 3：行程点表单地图选点集成（高德 Mock）
// ============================================================
test.describe('节点修正弹窗 - 地图选点', () => {
  let taskId: string;
  let token: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const created = await createCompletedTask(page.context().request);
    taskId = created.taskId;
    token = created.token;
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await useToken(page, token);
    await page.addInitScript(AMAP_MOCK_JS);
    await page.route('**/api/geocode?**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ address: '中国 (30.6700, 104.0600)' }),
    }));
    await page.goto(`/itineraries/${taskId}`);
  });

  test('地理 tab 出现地图选点按钮 → 点击 → 地图弹窗打开 → 选中后 lat/lng/地址回填', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '行程概览' })).toBeVisible({ timeout: 10000 });

    const editBtn = firstNodeEditButton(page);
    await editBtn.click();
    await expect(page.locator('text=修正行程节点')).toBeVisible();

    // 地理 tab 下应出现"地图选点"按钮
    const pickerBtn = page.getByRole('button', { name: '地图选点' });
    await expect(pickerBtn).toBeVisible({ timeout: 5000 });

    // 点击"地图选点"打开弹窗
    await pickerBtn.click();
    await expect(page.getByRole('heading', { name: '在地图上选点' })).toBeVisible({ timeout: 10000 });

    // 等待 mock 地图实例创建，再点击实际地图容器中央放置 marker。
    const locationDialog = page.getByRole('dialog', { name: '在地图上选点' });
    const readyMap = locationDialog.locator('[data-amap-ready="true"]');
    await expect(readyMap).toBeVisible({ timeout: 10000 });
    await readyMap.click();

    // "当前：" 不再是 '未选点'
    const coordText = locationDialog.getByText(/^当前：/);
    await expect(coordText).toBeVisible({ timeout: 5000 });
    await expect(coordText).not.toContainText('未选点', { timeout: 3000 });
    await expect(locationDialog.getByText(/中国 \(/)).toBeVisible({ timeout: 5000 });

    // 点击"确认选点"
    await locationDialog.getByRole('button', { name: '确认选点' }).click();
    await expect(page.getByRole('heading', { name: '在地图上选点' })).toBeHidden({ timeout: 5000 });

    // 验证 lat 输入框已填充
    const latInput = page.getByPlaceholder('例如 30.746500');
    await expect(latInput).not.toHaveValue('', { timeout: 5000 });

    // 验证 lng 输入框已填充
    const lngInput = page.getByPlaceholder('例如 120.755800');
    await expect(lngInput).not.toHaveValue('', { timeout: 5000 });

    // 验证地址已自动回填（逆地理编码）：按钮文案从"地图选点"变为"重新选点"
    await expect(page.getByRole('button', { name: '重新选点' })).toBeVisible({ timeout: 5000 });

    // 逆地理编码是该用例声明的结果，确认后仍应在修正表单中可见。
    await expect(page.getByText(/中国 \(/)).toBeVisible({ timeout: 5000 });
  });
});
