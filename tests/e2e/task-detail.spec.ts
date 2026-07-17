import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

interface OwnedTask {
  taskId: string;
  token: string;
}

/** 注册独立测试用户，避免任务数据在规格之间互相污染。 */
async function register(request: APIRequestContext, prefix: string): Promise<string> {
  const response = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username: `${prefix}_${Date.now()}`, password: 'Test123456' },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data.token as string;
}

/** 注入任务所属用户的登录态。 */
async function useToken(page: Page, token: string): Promise<void> {
  await page.context().addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' },
  ]);
}

async function submitTask(
  request: APIRequestContext,
  token: string,
  path: string,
  data: Record<string, unknown>,
): Promise<string> {
  const response = await request.post(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data.taskId as string;
}

/** 等待异步 AI 任务完成；E2E 启动器使用本地确定性 AI 替身。 */
async function waitForCompleted(
  request: APIRequestContext,
  token: string,
  taskId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await request.get(`${BACKEND_URL}/api/itineraries/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    if (body.data?.status === 'COMPLETED') return;
    if (body.data?.status === 'FAILED') {
      throw new Error(`任务失败：${body.data?.errorMessage || '未知错误'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('任务在 30 秒内未完成');
}

async function createGenerateTask(request: APIRequestContext, prefix = 'detail'): Promise<OwnedTask> {
  const token = await register(request, prefix);
  const taskId = await submitTask(request, token, '/api/itineraries/generate', {
    departureLocation: '上海',
    departureTime: '2026-08-01 09:00:00',
    destination: '杭州',
    days: 2,
    peopleCount: 2,
    budget: '2000',
    preferences: ['历史', '美食'],
    specialRequirements: 'none',
  });
  await waitForCompleted(request, token, taskId);
  return { taskId, token };
}

test.describe('行程详情页 - 基础信息', () => {
  let owned: OwnedTask;

  test.beforeAll(async ({ request }) => {
    owned = await createGenerateTask(request, 'detail_base');
  });

  test.beforeEach(async ({ page }) => {
    await useToken(page, owned.token);
    await page.goto(`/itineraries/${owned.taskId}`);
    await expect(page.getByRole('heading', { name: '行程概览' })).toBeVisible({ timeout: 10000 });
  });

  test('页面包含返回链接', async ({ page }) => {
    await expect(page.getByRole('link', { name: /返回任务列表/ })).toBeVisible();
  });

  test('显示任务ID和提交时间', async ({ page }) => {
    await expect(page.getByText('任务 ID', { exact: true })).toBeVisible();
    await expect(page.getByText('提交时间', { exact: true })).toBeVisible();
    await expect(page.getByText(owned.taskId, { exact: true })).toBeVisible();
  });

  test('显示状态标签', async ({ page }) => {
    await expect(page.getByText('已完成', { exact: true })).toBeVisible();
  });

  test('任务摘要用于标题', async ({ page }) => {
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).not.toHaveText('');
  });
});

test('已完成任务显示写入的审计数据', async ({ page, request }) => {
  const owned = await createGenerateTask(request, 'detail_audit');
  await useToken(page, owned.token);
  await page.goto(`/itineraries/${owned.taskId}`);

  await expect(page.getByText('Token 消耗', { exact: true })).toBeVisible();
  await expect(page.getByText('AI 耗时', { exact: true })).toBeVisible();
});

test('小红书任务显示解析笔记内容', async ({ page, request }) => {
  const token = await register(request, 'detail_xhs');
  const noteContent = '周末青岛两日游，打卡栈桥、八大关和啤酒博物馆。';
  const taskId = await submitTask(request, token, '/api/itineraries/from-xiaohongshu', {
    noteContent,
    days: 2,
    peopleCount: 2,
    preferences: ['美食'],
  });
  await waitForCompleted(request, token, taskId);
  await useToken(page, token);
  await page.goto(`/itineraries/${taskId}`);

  await expect(page.getByText('AI 收到的笔记内容', { exact: true })).toBeVisible();
  await expect(page.getByText(noteContent, { exact: true })).toBeVisible();
});

test('尚未完成的任务可取消', async ({ page, request }) => {
  const token = await register(request, 'detail_cancel');
  const taskId = await submitTask(request, token, '/api/itineraries/generate', {
    departureLocation: '上海',
    departureTime: '2026-08-01 09:00:00',
    destination: '苏州',
    days: 1,
    peopleCount: 1,
    preferences: [],
  });
  const cancelResponse = await request.delete(`${BACKEND_URL}/api/itineraries/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(cancelResponse.ok()).toBeTruthy();

  await useToken(page, token);
  await page.goto(`/itineraries/${taskId}`);
  await expect(page.getByText('已取消', { exact: true })).toBeVisible({ timeout: 10000 });
});

test('已完成任务不显示取消按钮', async ({ page, request }) => {
  const owned = await createGenerateTask(request, 'detail_no_cancel');
  await useToken(page, owned.token);
  await page.goto(`/itineraries/${owned.taskId}`);
  await expect(page.getByRole('button', { name: /取消任务/ })).toHaveCount(0);
});

test('已完成生成任务显示行程结果', async ({ page, request }) => {
  const owned = await createGenerateTask(request, 'detail_generate');
  await useToken(page, owned.token);
  await page.goto(`/itineraries/${owned.taskId}`);
  await expect(page.getByRole('heading', { name: '行程概览' })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-day="1"]')).toBeVisible();
});

test('已完成优化任务显示优化结果', async ({ page, request }) => {
  const token = await register(request, 'detail_optimize');
  const taskId = await submitTask(request, token, '/api/itineraries/optimize', {
    currentItinerary: JSON.stringify({ summary: '杭州两日游', days: [] }),
    optimizationGoal: '减少奔波',
    constraints: '优先公共交通',
  });
  await waitForCompleted(request, token, taskId);
  await useToken(page, token);
  await page.goto(`/itineraries/${taskId}`);

  const optimizeSignals = ['优化思路', '变更项', '优化后的行程'].map((text) => page.getByText(text));
  await expect.poll(async () => {
    const visibility = await Promise.all(optimizeSignals.map((locator) => locator.isVisible()));
    return visibility.some(Boolean);
  }, { timeout: 10000 }).toBe(true);
});

test('不存在任务显示提示', async ({ page, request }) => {
  const token = await register(request, 'detail_missing');
  await useToken(page, token);
  await page.goto('/itineraries/nonexistent-task-id-12345');
  await expect(page.getByText(/无法加载行程数据/)).toBeVisible({ timeout: 10000 });
});
