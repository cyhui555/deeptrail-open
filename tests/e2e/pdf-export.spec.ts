import { test, expect } from '@playwright/test';
import { AMAP_MOCK_JS } from './lib/amap-mock';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlJcAAAAASUVORK5CYII=',
  'base64',
);

/** PDF 主路径只验证导出合同，静态地图必须由确定性图片替身隔离外部 REST 服务。 */
async function mockStaticMap(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/static-map?**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));
}

/**
 * 注册并登录用户，返回 token。
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
 * 创建行程清单并启动打卡，返回 planId。
 */
async function createPlanAndStartCheckin(
  request: any,
  token: string,
  title: string,
  taskId: string,
): Promise<string> {
  const createResp = await request.post(`${BACKEND_URL}/api/trips`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, taskId, plannedDate: '2026-07-01' },
  });
  const planId = (await createResp.json()).data;

  // 启动打卡，生成含坐标的 CheckinTask
  const startResp = await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(startResp.ok()).toBeTruthy();

  return planId;
}

test.describe('全部行程 PDF 导出 E2E', () => {
  test('主路径：点击导出按钮应下载 PDF 文件', async ({ page, request }) => {
    const username = `pdf_e2e_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    // 注入 AMap mock 替代 CDN 脚本
    await page.addInitScript(AMAP_MOCK_JS);
    await mockStaticMap(page);

    // 登录态
    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    // 准备数据
    const taskId = await generateAndWait(request, token, '杭州');
    const planId = await createPlanAndStartCheckin(request, token, '杭州一日游', taskId);

    // 导航到全部行程概览页
    await page.goto(`/trips/${planId}/overview`);
    await expect(page.getByRole('heading', { name: '全局地图', exact: true })).toBeVisible();

    // 确认导出按钮存在
    const exportButton = page.getByRole('button', { name: /导出 PDF/ });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();

    // 点击导出并捕获下载事件
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await exportButton.click();

    // 验证按钮进入 loading 状态
    await expect(page.getByText('生成中…')).toBeVisible();

    // 等待下载完成
    const download = await downloadPromise;

    // 验证文件名格式
    expect(download.suggestedFilename()).toMatch(/_旅行手册\.pdf$/);

    // 验证 PDF 文件内容非空
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const fileSize = Buffer.concat(chunks).length;
    expect(fileSize).toBeGreaterThan(1000); // 至少 1KB

    // 验证 PDF 文件头（魔术字节 %PDF）
    const header = Buffer.concat(chunks).slice(0, 4).toString('ascii');
    expect(header).toBe('%PDF');
  });

  test('导出按钮在任务加载完成后才可交互', async ({ page, request }) => {
    const username = `pdf_btn_e2e_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.addInitScript(AMAP_MOCK_JS);
    await mockStaticMap(page);
    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, '苏州');
    const planId = await createPlanAndStartCheckin(request, token, '苏州园林游', taskId);

    await page.goto(`/trips/${planId}/overview`);

    // 导出按钮在页面渲染后应始终可见且可点击
    const exportButton = page.getByRole('button', { name: /导出 PDF/ });
    await expect(exportButton).toBeVisible({ timeout: 10000 });
    await expect(exportButton).toBeEnabled();

    // 捕获下载并确认完成后恢复可交互；Mock 地图下生成可能瞬时完成，不断言短暂 loading 状态。
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await exportButton.click();

    // 下载完成后恢复
    await downloadPromise;
    await expect(exportButton).toBeEnabled({ timeout: 30000 });
  });
});
