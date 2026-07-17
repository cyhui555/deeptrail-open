import { test, expect } from '@playwright/test';
import { AMAP_MOCK_JS } from './lib/amap-mock';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/** 注册并登录用户，返回 token。 */
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

/** 提交生成任务并等待完成，返回 taskId。 */
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

/** 创建行程清单，返回 planId。 */
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

/** 开始打卡（幂等）。 */
async function startCheckin(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  planId: string,
): Promise<void> {
  const startResp = await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(startResp.ok()).toBeTruthy();

  // UI 操作依赖已生成的按日任务，先验证前置数据，避免把服务编排失败误报为选择器超时。
  const tasksResp = await request.get(`${BACKEND_URL}/api/trips/${planId}/checkin`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(tasksResp.ok()).toBeTruthy();
  const tasksBody = await tasksResp.json();
  expect(tasksBody.data?.length).toBeGreaterThan(0);
}

test.describe('自定义行程点编辑 E2E', () => {
  test('添加自定义行程点 → 编辑 → 保存 → UI 展示新字段值', async ({ page, request }) => {
    const username = `edit_custom_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Chengdu');
    const planId = await createTripPlan(request, token, 'Edit Custom', taskId);
    await startCheckin(request, token, planId);

    // 1. 导航到行程详情页
    await page.goto(`${FRONTEND_URL}/trips/${planId}`);
    await expect(page.getByText('Edit Custom')).toBeVisible({ timeout: 10000 });

    // 2. 展开第 1 天（点击天标题按钮）
    const dayButton = page.getByRole('button', { name: /第\s*1\s*天/ });
    await expect(dayButton).toBeVisible({ timeout: 5000 });
    await dayButton.click();

    // 3. 点击“添加地点”
    const addBtn = page.getByRole('button', { name: '添加地点' });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();

    // 4. 填写添加表单（placeholder='确认添加' 在 <form> 内，标题在外层 header）
    const addDialog = page.locator('form', { hasText: '确认添加' });
    await expect(addDialog).toBeVisible({ timeout: 5000 });
    await addDialog.getByPlaceholder(/朋友推荐的小店/).fill('朋友推荐的火锅店');
    await addDialog.getByPlaceholder('简单描述这个景点的亮点').fill('辣度可选，当地人常去');
    await addDialog.getByPlaceholder('例如：50元/人').fill('约80元/人');

    // 5. 提交添加
    await addDialog.getByRole('button', { name: '确认添加' }).click();

    // 6. 等待成功关闭 Modal，验证新 POI 展示
    await expect(page.getByText('添加自定义行程点')).toBeHidden({ timeout: 5000 });
    await expect(page.getByText('朋友推荐的火锅店')).toBeVisible({ timeout: 5000 });

    // 7. 验证编辑按钮可见（仅自定义项显示）
    const editBtn = page.getByRole('button', { name: '编辑' });
    await expect(editBtn).toBeVisible({ timeout: 5000 });

    // 8. 点击 ✏️ 编辑
    await editBtn.click();

    // 9. 验证编辑弹窗回填现有值（"保存" button 在 <form> 内，标题在外层）
    const editDialog = page.locator('form', { hasText: '保存' });
    await expect(editDialog).toBeVisible({ timeout: 5000 });
    const editNameInput = editDialog.getByPlaceholder('自定义点名称');
    await expect(editNameInput).toHaveValue('朋友推荐的火锅店');

    // 10. 修改字段
    await editNameInput.fill('改名后的火锅店');
    await editDialog.getByPlaceholder('简单描述这个景点的亮点').fill('更新了描述：特别好吃');
    await editDialog.getByPlaceholder('例如：50元/人').fill('约120元/人');

    // 11. 提交保存
    await editDialog.getByRole('button', { name: '保存' }).click();

    // 12. 验证弹窗关闭 + UI 展示新值（标题 h3 独立定位）
    await expect(page.getByText('编辑自定义行程点')).toBeHidden({ timeout: 5000 });
    await expect(page.getByText('改名后的火锅店')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('更新了描述：特别好吃')).toBeVisible({ timeout: 5000 });
  });

  test('🗺️ 在地图上选点 → 弹窗关闭 → lat/lng 输入框即时更新', async ({ page, request }) => {
    const username = `edit_picker_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.addInitScript(AMAP_MOCK_JS);
    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Beijing');
    const planId = await createTripPlan(request, token, 'Picker Test', taskId);
    await startCheckin(request, token, planId);

    await page.goto(`${FRONTEND_URL}/trips/${planId}`);
    await expect(page.getByText('Picker Test')).toBeVisible({ timeout: 10000 });

    // 展开天 + 添加自定义点
    await page.getByRole('button', { name: /第\s*1\s*天/ }).click();
    await page.getByRole('button', { name: '添加地点' }).click();
    const addDlg = page.locator('form', { hasText: '确认添加' });
    await expect(addDlg).toBeVisible({ timeout: 5000 });
    await addDlg.getByPlaceholder(/朋友推荐的小店/).fill('地图选点测试');
    await addDlg.getByRole('button', { name: '确认添加' }).click();
    await expect(page.locator('text=地图选点测试')).toBeVisible({ timeout: 5000 });

    // 打开编辑弹窗
    await page.getByRole('button', { name: '编辑' }).click();
    const editDlg = page.locator('form', { hasText: '保存' });
    await expect(editDlg).toBeVisible({ timeout: 5000 });

    // 点击当前产品文案中的“地图选点”按钮。
    const pickerBtn = editDlg.getByRole('button', { name: '地图选点' });
    await expect(pickerBtn).toBeVisible({ timeout: 5000 });
    await pickerBtn.click();

    // 地图 mock 在实例创建时标记容器就绪，避免用固定时长猜测 SDK 初始化进度。
    const locationDialog = page.getByRole('dialog', { name: '在地图上选点' });
    await expect(locationDialog).toBeVisible({ timeout: 10000 });
    const readyMap = locationDialog.locator('[data-amap-ready="true"]');
    await expect(readyMap).toBeVisible({ timeout: 10000 });

    // 点击实际地图容器中央，触发 AMap click 事件并放置 marker。
    await readyMap.click();

    // 验证"当前：" 坐标文本不再是 '未选点'
    const coordText = locationDialog.getByText(/^当前：/);
    await expect(coordText).toBeVisible({ timeout: 5000 });
    await expect(coordText).not.toContainText('未选点', { timeout: 3000 });

    // 点击"确认选点"
    await locationDialog.getByRole('button', { name: '确认选点' }).click();

    // 验证地图弹窗关闭（h3 标题消失）+ lat/lng 输入框已有值
    await expect(page.getByRole('heading', { name: '在地图上选点' })).toBeHidden({ timeout: 5000 });

    // 编辑弹窗的 lat 输入框应该已有值（非空）
    const editLatInput = editDlg.getByPlaceholder('例如：30.67');
    await expect(editLatInput).not.toHaveValue('', { timeout: 5000 });
  });

  test('已打卡的自定义项不显示 ✏️ 编辑按钮', async ({ page, request }) => {
    const username = `edit_checked_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Shanghai');
    const planId = await createTripPlan(request, token, 'Checked Test', taskId);
    await startCheckin(request, token, planId);

    await page.goto(`${FRONTEND_URL}/trips/${planId}`);
    await expect(page.getByText('Checked Test')).toBeVisible({ timeout: 10000 });

    // 展开天 + 添加自定义点
    await page.getByRole('button', { name: /第\s*1\s*天/ }).click();
    await page.getByRole('button', { name: '添加地点' }).click();
    const addDialog = page.locator('form', { hasText: '确认添加' });
    await expect(addDialog).toBeVisible({ timeout: 5000 });
    await addDialog.getByPlaceholder(/朋友推荐的小店/).fill('编辑后打卡测试点');
    await addDialog.getByRole('button', { name: '确认添加' }).click();
    await expect(page.getByText('编辑后打卡测试点')).toBeVisible({ timeout: 5000 });

    // 验证 ✏️ 编辑按钮存在
    const editBtn = page.getByRole('button', { name: '编辑' });
    await expect(editBtn).toBeVisible({ timeout: 5000 });

    // 编辑与打卡按钮共享同一操作组，用父容器收敛到同一个自定义行程点。
    const checkinBtn = editBtn.locator('..').getByRole('button', { name: '打卡', exact: true });
    await expect(checkinBtn).toBeVisible({ timeout: 5000 });
    await checkinBtn.click();

    // 等待打卡成功：已打卡角标出现 / ✏️ 编辑按钮消失
    await expect(page.getByText('✓ 已打卡')).toBeVisible({ timeout: 5000 });

    // 验证 ✏️ 编辑按钮消失（已打卡状态不渲染编辑按钮）
    await expect(page.getByRole('button', { name: '编辑' })).toBeHidden({ timeout: 5000 });
  });
});
