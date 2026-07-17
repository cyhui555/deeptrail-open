import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * 注册并返回 token + 注入 cookie。
 */
async function registerAndLogin(page: import('@playwright/test').Page): Promise<string> {
  const username = `sum_e2e_${Date.now()}`;
  const regResp = await page.context().request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username, password: 'Test123456' },
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  });
  const regBody = await regResp.json();
  const token: string = regBody.data.token;
  await page.context().addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' },
  ]);
  return token;
}

/**
 * 通过 API 提交一个生成任务，等待完成，返回 taskId。
 */
async function createCompletedGenerateTask(page: import('@playwright/test').Page, token: string): Promise<string> {
  // 提交任务
  const submitResp = await page.context().request.post(`${BACKEND_URL}/api/itineraries/generate`, {
    data: {
      departureLocation: '北京',
      departureTime: '2026-07-10 08:00:00',
      destination: '西安',
      days: 5,
      peopleCount: 2,
      budget: '5000',
      preferences: ['历史', '美食'],
      specialRequirements: '不要起太早',
    },
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  });
  const submitBody = await submitResp.json();
  if (!submitBody.success) {
    throw new Error(`提交失败: ${submitBody.message}`);
  }
  const taskId: string = submitBody.data.taskId;
  console.log(`[E2E] taskId=${taskId}`);

  // 轮询任务终态；间隔由 Playwright 调度，不占用浏览器时钟，也不依赖固定睡眠。
  await expect.poll(async () => {
    const detailResp = await page.context().request.get(
      `${BACKEND_URL}/api/itineraries/tasks/${taskId}`,
    );
    const detail = await detailResp.json();
    const task = detail?.data;
    if (task?.status === 'COMPLETED') {
      console.log(`[E2E] 任务完成, days=${task.result?.days?.length}`);
      return 'COMPLETED';
    }
    if (task?.status === 'FAILED') {
      throw new Error(`任务失败: ${task.errorMessage}`);
    }
    return task?.status ?? 'UNKNOWN';
  }, {
    timeout: 120_000,
    intervals: [500, 1_000, 2_000],
    message: '生成任务应在 120 秒内完成',
  }).toBe('COMPLETED');
  return taskId;
}

/** 页面加载后等待天卡片出现 */
async function waitForDayCards(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-day="1"]')).toBeVisible({ timeout: 15000 });
}

test.describe('行程详情页 - 折叠天摘要', () => {
  test('每个折叠的天卡片下方显示摘要文本', async ({ page }) => {
    const token = await registerAndLogin(page);
    const taskId = await createCompletedGenerateTask(page, token);

    await page.goto(`${FRONTEND_URL}/itineraries/${taskId}`);
    await waitForDayCards(page);

    // 抓取每天的业务编号，后续按 data-day 精确定位，避免用位置掩盖重复结构。
    const dayCards = page.locator('[data-day]');
    const count = await dayCards.count();
    console.log(`[E2E] 天卡片数量=${count}`);
    expect(count).toBeGreaterThan(0);

    // 检查天总数 > 3 → 默认折叠（第 2 天起折叠）
    // 验证：折叠的卡片下方有摘要段落
    // 多天（>3）时至少第 2、3…天是折叠的，应该有摘要
    if (count > 3) {
      // 折叠的天 = 总天数 - 展开的第一天
      const expectedCollapsedMin = count - 1;
      // 检查 summary 段落的个数（查找"当天亮点"标签后的段落）
      const summaryParagraphs = page.locator('[data-day] p.text-sm.text-gray-700.line-clamp-2');
      const summaryCount = await summaryParagraphs.count();
      console.log(`[E2E] 折叠天摘要段落数量=${summaryCount}`);
      expect(summaryCount).toBeGreaterThanOrEqual(expectedCollapsedMin);
    }

    // 更精准：遍历每个天，验证折叠态有摘要、展开态没有
    const dayNumbers = await dayCards.evaluateAll((cards) => cards
      .slice(0, 5)
      .map((card) => card.getAttribute('data-day'))
      .filter((day): day is string => day !== null));
    for (const dayNum of dayNumbers) {
      const card = page.locator(`[data-day="${dayNum}"]`);

      // 检查标题是否折叠：通过"当天亮点"标签是否存在来判断
      const highlightLabel = card.locator('p.text-xs.font-medium.text-gray-500', { hasText: '当天亮点' });
      const isCollapsed = await highlightLabel.count() > 0;

      if (isCollapsed) {
        // 折叠态：必须有摘要段落
        const summaryP = card.locator('p.text-sm.text-gray-700.line-clamp-2');
        const pCount = await summaryP.count();
        console.log(`[E2E] 第${dayNum}天折叠, 摘要段落数=${pCount}`);
        expect(pCount).toBeGreaterThanOrEqual(1);

        // 摘要不应为空
        const summaryTexts = await summaryP.allTextContents();
        console.log(`[E2E] 第${dayNum}天摘要="${summaryTexts.join(' | ')}"`);
        expect(summaryTexts.every((text) => text.length > 5)).toBeTruthy();
      }
    }
  });

  test('展开后的天卡片同时显示摘要与完整行程', async ({ page }) => {
    const token = await registerAndLogin(page);
    const taskId = await createCompletedGenerateTask(page, token);
    await page.goto(`${FRONTEND_URL}/itineraries/${taskId}`);

    await waitForDayCards(page);

    // 默认第一天是展开的，检查是否有完整 schedule 内容
    const firstCard = page.locator('[data-day="1"]');
    const expandedContent = firstCard.locator('.page-enter');
    await expect(expandedContent).toBeVisible();

    // 当前交互保留摘要作为上下文，同时在下方展示完整日程。
    await expect(firstCard.getByText('当天亮点', { exact: true })).toBeVisible();
    await expect(firstCard.locator('p.text-sm.text-gray-700.line-clamp-2')).toBeVisible();
  });
});
