import { expect, test, type Page, type Route } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const evidenceDirectory = process.env.PLAYWRIGHT_EVIDENCE_DIR;

const apiResponse = (data: unknown) => JSON.stringify({
  success: true,
  message: 'ok',
  requestId: 'task-app-001-mobile-regression',
  data,
  errorCode: null,
});

async function mockAuthenticatedSession(page: Page): Promise<void> {
  await page.context().addCookies([
    { name: 'token', value: 'task-app-001-mobile-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiResponse({
      userId: 1001,
      username: 'App 真机验收用户',
      role: 'ADMIN',
      enabled: true,
      wechatBound: false,
      createdAt: '2026-07-19T08:00:00Z',
    }),
  }));
}

function fulfillApi(route: Route, data: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiResponse(data),
  });
}

function itineraryTask(taskId: string) {
  const dates = [
    '2026-07-26',
    '2026-07-27',
    '2026-07-28',
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
    '2026-08-01',
  ];
  const themes = ['昆明人文', '大理古城', '洱海环游', '丽江古城', '玉龙雪山', '束河慢游', '返程整理'];
  return {
    taskId,
    type: 'GENERATE',
    status: 'COMPLETED',
    summary: '云南七日经典路线',
    requestJson: JSON.stringify({
      departureLocation: '杭州',
      departureTime: '2026-07-26T09:00:00',
      destination: '云南',
      days: 7,
      peopleCount: 11,
      budget: '中等',
      preferences: ['人文', '古城', '自然风光'],
    }),
    submittedAt: '2026-07-19T08:00:00Z',
    startedAt: '2026-07-19T08:00:01Z',
    completedAt: '2026-07-19T08:00:03Z',
    result: {
      summary: '7 天云南经典游，涵盖昆明、大理、丽江，交通以高铁和包车为主。',
      days: dates.map((date, index) => ({
        day: index + 1,
        date,
        theme: themes[index],
        schedule: [
          {
            period: '上午',
            description: `游览${themes[index]}的第一处代表地点`,
            poi: { name: `${themes[index]}起点` },
          },
          {
            period: '下午',
            description: `继续体验${themes[index]}的当地生活`,
            poi: { name: `${themes[index]}街区` },
          },
          {
            period: '晚上',
            description: '晚餐后自由活动',
            poi: { name: '当地夜市' },
          },
        ],
        accommodation: { name: `${themes[index]}精选酒店` },
      })),
    },
  };
}

async function mockItineraryPage(page: Page, taskId: string): Promise<void> {
  await mockAuthenticatedSession(page);
  await page.route(`**/api/itineraries/tasks/${taskId}/node-revisions`, (route) => fulfillApi(route, []));
  await page.route(`**/api/itineraries/tasks/${taskId}`, (route) => fulfillApi(route, itineraryTask(taskId)));
}

async function captureVisualEvidence(page: Page, width: number): Promise<void> {
  if (!evidenceDirectory) return;
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await mkdir(evidenceDirectory, { recursive: true });
  // 证据只来自本文件的固定夹具，并在全部可见行为断言通过后生成，避免把失败现场或真实数据上传到 CI。
  await page.screenshot({
    path: path.join(evidenceDirectory, `itinerary-mobile-${width}.png`),
    fullPage: false,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });
}

for (const width of [360, 390]) {
  test(`行程详情在 ${width}px 下保持紧凑折叠态和单行操作区`, async ({ page }) => {
    const taskId = `mobile-itinerary-${width}`;
    await page.setViewportSize({ width, height: 820 });
    await mockItineraryPage(page, taskId);

    await page.goto(`/itineraries/${taskId}`);

    await expect(page.getByRole('heading', { name: '规划概要' })).toBeVisible();
    await expect(page.getByText('2026-07-26 09:00', { exact: true })).toBeVisible();

    const actions = page.getByTestId('itinerary-primary-actions');
    await expect(actions.getByRole('button', { name: '加入行程清单' })).toBeVisible();
    await expect(actions.getByRole('button', { name: '优化' })).toBeVisible();
    const actionMetrics = await actions.locator(':scope > *').evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        height: rect.height,
        wraps: element.scrollHeight > element.clientHeight,
        whiteSpace: getComputedStyle(element).whiteSpace,
      };
    }));
    expect(actionMetrics).toHaveLength(2);
    expect(Math.abs(actionMetrics[0].top - actionMetrics[1].top)).toBeLessThan(1);
    expect(actionMetrics.every((metric) => metric.height >= 44 && metric.height <= 45)).toBe(true);
    expect(actionMetrics.every((metric) => !metric.wraps && metric.whiteSpace === 'nowrap')).toBe(true);

    const mobileDayNavigation = page.getByRole('navigation', { name: '行程日期导航' });
    const firstDayTab = mobileDayNavigation.getByRole('button', { name: '第 1 天' });
    await expect(firstDayTab).toBeVisible();
    await expect(firstDayTab).toHaveCSS('white-space', 'nowrap');

    await page.getByRole('button', { name: '全部折叠' }).click();
    const collapsedDays = page.getByRole('button', { name: /展开第 \d+ 天行程/ });
    await expect(collapsedDays).toHaveCount(7);
    await expect(collapsedDays.first()).toHaveAttribute('aria-expanded', 'false');
    const firstCollapsedHeight = await collapsedDays.first().locator('xpath=..').evaluate((element) => (
      element.getBoundingClientRect().height
    ));
    expect(firstCollapsedHeight).toBeLessThan(150);

    const overflow = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);

    await captureVisualEvidence(page, width);
  });
}
