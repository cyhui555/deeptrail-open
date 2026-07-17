import { expect, test, type Page } from '@playwright/test';

const emptyPage = {
  records: [],
  total: 0,
  page: 1,
  size: 10,
  totalPages: 0,
};

async function mockAuthenticatedSession(page: Page) {
  await page.context().addCookies([
    { name: 'token', value: 'ai-readiness-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: {
        userId: 1,
        username: '体验验收用户',
        wechatBound: false,
        createdAt: '2026-07-15T10:00:00',
      },
    }),
  }));
}

function apiSuccess(data: unknown) {
  return JSON.stringify({ success: true, message: 'ok', data });
}

test('AI 不可用时保留草稿并可重新检测', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthenticatedSession(page);

  let statusRequests = 0;
  let aiAvailable = false;
  await page.route('**/api/ai/status', (route) => {
    statusRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: apiSuccess({
        available: aiAvailable,
        message: aiAvailable ? 'AI 规划服务已就绪' : 'AI 规划服务尚未配置',
      }),
    });
  });
  await page.route('**/api/itineraries/tasks?**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiSuccess(emptyPage),
  }));

  await page.goto('/');
  await expect(page.getByText('AI 规划暂不可用')).toBeVisible();
  await expect(page.getByText('现有行程、地图、打卡和 PDF 导出仍可使用。')).toBeVisible();

  const generateTab = page.getByRole('tab', { name: '生成行程' });
  const optimizeTab = page.getByRole('tab', { name: '优化行程' });
  const xiaohongshuTab = page.getByRole('tab', { name: '小红书' });
  await expect(generateTab).toHaveAttribute('aria-selected', 'true');

  const departure = page.getByRole('textbox', { name: '出发地' });
  await departure.fill('成都');
  await optimizeTab.click();
  await generateTab.click();
  await expect(departure).toHaveValue('成都');

  await generateTab.press('End');
  await expect(xiaohongshuTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'AI 服务暂不可用' })).toBeDisabled();

  const initialStatusRequests = statusRequests;
  expect(initialStatusRequests).toBeGreaterThanOrEqual(1);
  aiAvailable = true;
  await page.getByRole('button', { name: '重新检测' }).click();
  await expect(page.getByText('AI 规划暂不可用')).toBeHidden();
  await expect(page.getByRole('button', { name: '从小红书生成行程' })).toBeEnabled();
  expect(statusRequests).toBe(initialStatusRequests + 1);

  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
});

test('后台轮询期间保留已有任务且不闪回骨架', async ({ page }) => {
  await mockAuthenticatedSession(page);
  await page.route('**/api/ai/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiSuccess({ available: true, message: 'AI 规划服务已就绪' }),
  }));

  let taskRequests = 0;
  let releasePoll: (() => void) | undefined;
  let notifyPollStarted: (() => void) | undefined;
  const pollStarted = new Promise<void>((resolve) => {
    notifyPollStarted = resolve;
  });
  await page.route('**/api/itineraries/tasks?**', async (route) => {
    taskRequests += 1;
    if (taskRequests > 1) {
      notifyPollStarted?.();
      await new Promise<void>((release) => {
        releasePoll = release;
      });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: apiSuccess({
        ...emptyPage,
        records: [{
          taskId: 'pending-task',
          type: 'GENERATE',
          status: taskRequests > 1 ? 'COMPLETED' : 'PENDING',
          submittedAt: '2026-07-15T10:00:00',
          summary: '川西雪山环线',
        }],
        total: 1,
        totalPages: 1,
      }),
    });
  });

  await page.goto('/');
  await expect(page.getByText('川西雪山环线')).toBeVisible();
  await pollStarted;
  await expect(page.getByText('川西雪山环线')).toBeVisible();
  await expect(page.locator('.home-recent .animate-pulse')).toHaveCount(0);
  releasePoll?.();
});

test('最近任务加载失败时提供就地重试', async ({ page }) => {
  await mockAuthenticatedSession(page);
  await page.route('**/api/ai/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiSuccess({ available: true, message: 'AI 规划服务已就绪' }),
  }));

  let taskRequests = 0;
  await page.route('**/api/itineraries/tasks?**', (route) => {
    taskRequests += 1;
    if (taskRequests === 1) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: apiSuccess({
        ...emptyPage,
        records: [{
          taskId: 'recovered-task',
          type: 'GENERATE',
          status: 'COMPLETED',
          submittedAt: '2026-07-15T10:00:00',
          summary: '新疆公路旅行',
        }],
        total: 1,
        totalPages: 1,
      }),
    });
  });

  await page.goto('/');
  const taskAlert = page.locator('.home-recent [role="alert"]');
  await expect(taskAlert).toContainText('最近任务暂时加载失败');
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.getByText('新疆公路旅行')).toBeVisible();
  await expect(taskAlert).toBeHidden();
});
