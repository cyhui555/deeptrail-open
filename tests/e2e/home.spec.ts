import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

/**
 * 辅助函数：注册并注入认证 cookie。
 * 注意：先导航到首页建立域名上下文，然后注入 cookie。
 */
async function loginWithCookie(page: any): Promise<string> {
  // 先导航到首页建立域名上下文
  await page.goto('/');
  const username = `home_e2e_${Date.now()}`;
  const regResp = await page.context().request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username, password: 'Test123456' },
  });
  const regBody = await regResp.json();
  const token = regBody.data.token;
  await page.context().addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' },
  ]);
  return token;
}

test.beforeEach(async ({ page }) => {
  // 首页功能回归不依赖真实付费模型配置，AI 就绪状态使用确定性响应。
  await page.route('**/api/ai/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      message: 'ok',
      data: { available: true, message: 'AI 规划服务已就绪' },
    }),
  }));
});

test.describe('首页', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithCookie(page);
    await page.goto('/');
  });

  test('页面标题和头部', async ({ page }) => {
    await expect(page).toHaveTitle(/旅迹/);
    await expect(page.getByRole('link', { name: '返回旅迹首页' })).toBeVisible();
  });

  test('三个Tab切换', async ({ page }) => {
    const tabs = ['生成行程', '优化行程', '小红书'];
    for (const label of tabs) {
      const btn = page.getByRole('tab', { name: label, exact: true });
      await btn.click();
      // 分段控制使用标准 Tab 语义，并与统一选中态样式保持同步。
      await expect(btn).toHaveClass(/app-segmented__item--active/);
      await expect(btn).toHaveAttribute('role', 'tab');
      await expect(btn).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('最近任务区域显示', async ({ page }) => {
    await expect(page.locator('text=最近任务')).toBeVisible();
  });

  test('任务列表数据展示', async ({ page }) => {
    // 等待 API 响应
    await page.waitForResponse(
      (res) => res.url().includes('/api/itineraries/tasks') && res.status() === 200,
      { timeout: 10000 },
    );

    // 检查任务卡片或空状态
    const taskCards = page.locator('a[href*="/itineraries/"]');
    const emptyState = page.locator('text=暂无任务');

    await expect.poll(async () => {
      if (await emptyState.isVisible()) return true;
      return (await taskCards.count()) > 0;
    }, { timeout: 5000 }).toBe(true);
  });

  test('分页控件在有足够任务时显示', async ({ page, request }) => {
    // 检查后端任务数量
    const resp = await request.get(`${BACKEND_URL}/api/itineraries/tasks?page=1&size=10`);
    const body = await resp.json();
    const total = body?.data?.total ?? 0;

    if (total > 10) {
      await page.waitForResponse(
        (res) => res.url().includes('/api/itineraries/tasks') && res.status() === 200,
      );
      await expect(page.locator('text=共')).toBeVisible();
      await expect(page.locator('text=上一页')).toBeVisible();
      await expect(page.locator('text=下一页')).toBeVisible();
    }
  });
});

test.describe('生成行程表单', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithCookie(page);
    await page.goto('/');
  });

  test('填写并提交生成行程', async ({ page }) => {
    await page.fill('input[placeholder="例如：北京"]', '上海');
    await page.fill('input[type="datetime-local"]', '2026-07-01T09:00');
    await page.fill('input[placeholder="例如：西安"]', '杭州');

    await page.getByRole('button', { name: '下一步 →' }).click();
    await page.getByRole('button', { name: '下一步 →' }).click();
    await page.click('button:has-text("开始生成行程")');
    await page.getByRole('button', { name: '确认提交' }).click();

    await expect(page.locator('text=任务已提交')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=查看任务')).toBeVisible();
  });

  test('提交后任务列表刷新', async ({ page }) => {
    await page.fill('input[placeholder="例如：北京"]', '广州');
    await page.fill('input[type="datetime-local"]', '2026-07-15T08:00');
    await page.fill('input[placeholder="例如：西安"]', '深圳');

    await page.getByRole('button', { name: '下一步 →' }).click();
    await page.getByRole('button', { name: '下一步 →' }).click();
    await page.click('button:has-text("开始生成行程")');
    const taskListRefreshed = page.waitForResponse(
      (response) => response.request().method() === 'GET'
        && response.url().includes('/api/itineraries/tasks?')
        && response.status() === 200,
    );
    await page.getByRole('button', { name: '确认提交' }).click();
    await expect(page.locator('text=任务已提交')).toBeVisible({ timeout: 10000 });
    await taskListRefreshed;

    // 任务列表不应再显示加载骨架屏
    const recentTasks = page.getByRole('region', { name: '最近任务' });
    await expect(recentTasks.locator('div.animate-pulse')).not.toBeVisible({ timeout: 5000 });
  });

  test('空字段验证', async ({ page }) => {
    // 第一步缺少必填的出发地与目的地时，不允许进入后续步骤。
    await expect(page.getByRole('button', { name: '下一步 →' })).toBeDisabled();
  });
});

test.describe('小红书表单', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithCookie(page);
    await page.goto('/');
    await page.click('button:has-text("小红书")');
  });

  test('粘贴笔记内容提交', async ({ page }) => {
    await page.fill(
      'textarea[placeholder="直接复制粘贴小红书笔记的正文内容到这里..."]',
      '周末青岛两日游，打卡栈桥、八大关、啤酒博物馆',
    );

    await page.click('button:has-text("从小红书生成行程")');
    await expect(page.locator('text=任务已提交')).toBeVisible({ timeout: 5000 });
  });

  test('切换至链接模式并提交', async ({ page }) => {
    await page.click('button:has-text("粘贴笔记链接")');
    await page.fill('input[type="url"]', 'https://www.xiaohongshu.com/explore/test123');
    await page.click('button:has-text("从小红书生成行程")');
    await expect(page.locator('text=任务已提交')).toBeVisible({ timeout: 5000 });
  });

  test('可选字段填写', async ({ page }) => {
    await page.fill(
      'textarea[placeholder="直接复制粘贴小红书笔记的正文内容到这里..."]',
      '三亚三日游攻略',
    );

    await page.getByRole('spinbutton', { name: /天数/ }).fill('3');
    await page.getByRole('spinbutton', { name: /人数/ }).fill('4');

    await page.click('button:has-text("从小红书生成行程")');
    await expect(page.locator('text=任务已提交')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('优化行程表单', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithCookie(page);
    await page.goto('/');
    await page.click('button:has-text("优化行程")');
  });

  test('优化表单显示', async ({ page }) => {
    await expect(page.locator('button:has-text("开始优化行程")')).toBeVisible();
  });

  test('当无可用行程时显示提示', async ({ page }) => {
    // 检查是否有可选行程
    const hasDropdown = await page.getByRole('combobox').isVisible().catch(() => false);
    if (!hasDropdown) {
      await expect(page.locator('text=暂无可选取的行程')).toBeVisible();
    }
  });
});

test.describe('中文文案完整性', () => {
  test('首页所有中文文案', async ({ page }) => {
    await loginWithCookie(page);
    await page.goto('/');

    const firstStepTexts = [
      '生成行程', '优化行程', '小红书',
      '最近任务',
    ];

    for (const text of firstStepTexts) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }

    // 必填字段的可访问名称包含星号，按真实表单语义验证中文标签。
    await expect(page.getByRole('textbox', { name: /出发地/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /目的地/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /出发时间/ })).toBeVisible();

    await page.fill('input[placeholder="例如：北京"]', '上海');
    await page.fill('input[placeholder="例如：西安"]', '杭州');
    await page.getByRole('button', { name: '下一步 →' }).click();
    await expect(page.getByRole('spinbutton', { name: /天数/ })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: /人数/ })).toBeVisible();
  });

  test('无残留英文文案', async ({ page }) => {
    await loginWithCookie(page);
    await page.goto('/');
    const bodyText = await page.textContent('body');

    const unwanted = ['Departure', 'Destination', 'Generate', 'Submit'];
    for (const word of unwanted) {
      expect(bodyText, `"${word}" 不应出现在页面上`).not.toContain(word);
    }
  });
});
