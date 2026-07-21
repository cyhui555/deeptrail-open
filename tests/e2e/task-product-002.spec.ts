import { expect, test, type Page, type Route } from '@playwright/test';

function fulfillApi(route: Route, data: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'ok', data }),
  });
}

async function mockAuthenticatedSession(page: Page): Promise<void> {
  await page.context().addCookies([
    { name: 'token', value: 'task-product-002-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => fulfillApi(route, {
    userId: 202,
    username: '行程规划验收用户',
    role: 'USER',
    wechatBound: false,
    createdAt: '2026-07-21T08:00:00',
  }));
}

function localIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function currentMonthFixture() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return {
    year,
    month,
    today: localIsoDate(year, month, now.getDate()),
    rangeStart: localIsoDate(year, month, 10),
    rangeEnd: localIsoDate(year, month, 12),
  };
}

function tripFixtures() {
  const dates = currentMonthFixture();
  return [
    {
      id: 'trip-range',
      title: '川西环线详细规划',
      destination: '川西环线',
      plannedDate: dates.rangeStart,
      tripDates: `${dates.rangeStart} ~ ${dates.rangeEnd}`,
      status: 'PLANNED',
      checkinProgress: '0/6',
      totalPoi: 6,
      completedPoi: 0,
    },
    {
      id: 'trip-today',
      title: '今日漫游',
      destination: '今日漫游',
      plannedDate: dates.today,
      status: 'ONGOING',
      checkinProgress: '1/3',
      totalPoi: 3,
      completedPoi: 1,
    },
    {
      id: 'trip-undated',
      title: '待定周末',
      status: 'PLANNED',
      checkinProgress: '0/0',
      totalPoi: 0,
      completedPoi: 0,
    },
  ];
}

async function mockTrips(page: Page, plans = tripFixtures()) {
  const deletedIds = new Set<string>();
  let deleteRequests = 0;

  await page.route('**/api/trips?*', (route) => {
    const records = plans.filter((plan) => !deletedIds.has(plan.id));
    const url = new URL(route.request().url());
    const size = Number(url.searchParams.get('size') ?? 20);
    return fulfillApi(route, {
      records,
      total: records.length,
      page: 1,
      size,
      totalPages: records.length > 0 ? 1 : 0,
    });
  });

  await page.route('**/api/trips/*', (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    deleteRequests += 1;
    const planId = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    if (planId === 'trip-range') {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: '暂时无法删除，请稍后重试。' }),
      });
    }
    deletedIds.add(planId);
    return fulfillApi(route, null);
  });

  return {
    getDeleteRequests: () => deleteRequests,
  };
}

test('月历逐日展示行程范围，删除需确认且失败时保留原行程', async ({ page }) => {
  const dates = currentMonthFixture();
  await mockAuthenticatedSession(page);
  const deletion = await mockTrips(page);

  await page.goto('/trips');
  await expect(page.getByRole('heading', { name: '我的行程' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建行程' })).toBeVisible();
  await page.getByRole('button', { name: '月历', exact: true }).click();

  const calendar = page.getByRole('region', {
    name: `${dates.year}年${dates.month}月行程月历`,
  });
  await expect(calendar).toBeVisible();
  const monthTable = calendar.getByRole('table', { name: '月度行程安排' });
  await expect(monthTable.getByRole('link', { name: /查看川西环线/ })).toHaveCount(3);
  await expect(calendar.getByRole('heading', { name: '待安排日期' })).toBeVisible();

  await calendar.getByRole('button', { name: '删除行程：待定周末' }).click();
  const confirmDialog = page.getByRole('alertdialog', { name: '删除这个行程？' });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: '取消' }).click();
  expect(deletion.getDeleteRequests()).toBe(0);
  await expect(calendar.getByRole('link', { name: '查看行程：待定周末' })).toBeVisible();

  await calendar.getByRole('button', { name: '删除行程：待定周末' }).click();
  await page.getByRole('alertdialog', { name: '删除这个行程？' })
    .getByRole('button', { name: '确认删除' })
    .click();
  await expect(page.getByText('已删除行程“待定周末”')).toBeVisible();
  await expect(calendar.getByRole('link', { name: '查看行程：待定周末' })).toHaveCount(0);
  expect(deletion.getDeleteRequests()).toBe(1);

  const rangeDateCell = monthTable.locator(`td:has(time[datetime="${dates.rangeStart}"])`);
  await rangeDateCell.getByRole('button', { name: '删除行程：川西环线' }).click();
  await page.getByRole('alertdialog', { name: '删除这个行程？' })
    .getByRole('button', { name: '确认删除' })
    .click();
  await expect(page.getByText('暂时无法删除，请稍后重试。')).toBeVisible();
  await expect(rangeDateCell.getByRole('link', { name: /查看川西环线/ })).toBeVisible();
  expect(deletion.getDeleteRequests()).toBe(2);
});

test('390px 与 360px 使用迷你月历和当日议程且没有横向溢出', async ({ page }) => {
  const dates = currentMonthFixture();
  const todayPlan = tripFixtures().filter((plan) => plan.id === 'trip-today');
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthenticatedSession(page);
  await mockTrips(page, todayPlan);

  await page.goto('/trips');
  await page.getByRole('button', { name: '月历', exact: true }).click();
  const calendar = page.getByRole('region', {
    name: `${dates.year}年${dates.month}月行程月历`,
  });
  await expect(calendar.getByRole('group', { name: '选择日期' })).toBeVisible();
  await expect(calendar.getByRole('link', { name: /查看今日漫游/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 360, height: 800 });
  await expect(calendar.getByRole('link', { name: /查看今日漫游/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('最近任务按类型与状态组合筛选，翻页沿用相同条件', async ({ page }) => {
  const taskRequests: Array<{ type: string | null; status: string | null; page: string | null }> = [];
  await mockAuthenticatedSession(page);
  await page.route('**/api/ai/status', (route) => fulfillApi(route, {
    available: true,
    message: 'AI 规划服务已就绪',
  }));
  await page.route('**/api/trips?*', (route) => fulfillApi(route, {
    records: [], total: 0, page: 1, size: 20, totalPages: 0,
  }));
  await page.route('**/api/itineraries/tasks?*', (route) => {
    const url = new URL(route.request().url());
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    const pageNumber = url.searchParams.get('page') ?? '1';
    taskRequests.push({ type, status, page: pageNumber });

    if (type === 'OPTIMIZE' && status === 'FAILED') {
      return fulfillApi(route, { records: [], total: 0, page: 1, size: 10, totalPages: 0 });
    }
    if (type === 'OPTIMIZE' && status === 'COMPLETED') {
      const summary = pageNumber === '2' ? '已完成优化任务 B' : '已完成优化任务 A';
      return fulfillApi(route, {
        records: [{
          taskId: `optimize-${pageNumber}`,
          type: 'OPTIMIZE',
          status: 'COMPLETED',
          summary,
          submittedAt: '2026-07-21T09:30:00',
        }],
        total: 2,
        page: Number(pageNumber),
        size: 10,
        totalPages: 2,
      });
    }
    if (type === 'OPTIMIZE') {
      return fulfillApi(route, {
        records: [{
          taskId: 'optimize-any',
          type: 'OPTIMIZE',
          status: 'PROCESSING',
          summary: '优化任务处理中',
          submittedAt: '2026-07-21T09:20:00',
        }],
        total: 1,
        page: 1,
        size: 10,
        totalPages: 1,
      });
    }
    return fulfillApi(route, {
      records: [{
        taskId: 'generate-default',
        type: 'GENERATE',
        status: 'COMPLETED',
        summary: '默认生成任务',
        submittedAt: '2026-07-21T09:00:00',
      }],
      total: 1,
      page: 1,
      size: 10,
      totalPages: 1,
    });
  });

  await page.goto('/');
  const recentTasks = page.getByRole('region', { name: '最近任务' });
  await expect(recentTasks.getByText('默认生成任务', { exact: true })).toBeVisible();

  await recentTasks.getByRole('combobox', { name: '按任务类型筛选' }).selectOption('OPTIMIZE');
  await expect(recentTasks.getByText('优化任务处理中', { exact: true })).toBeVisible();
  await recentTasks.getByRole('combobox', { name: '按任务状态筛选' }).selectOption('COMPLETED');
  await expect(recentTasks.getByText('已完成优化任务 A', { exact: true })).toBeVisible();
  await expect(recentTasks.getByText('2 个匹配任务')).toBeVisible();

  await recentTasks.getByRole('button', { name: '下一页' }).click();
  await expect(recentTasks.getByText('已完成优化任务 B', { exact: true })).toBeVisible();
  await expect.poll(() => taskRequests.some((request) => (
    request.type === 'OPTIMIZE' && request.status === 'COMPLETED' && request.page === '2'
  ))).toBe(true);

  await recentTasks.getByRole('combobox', { name: '按任务状态筛选' }).selectOption('FAILED');
  await expect(recentTasks.getByText('没有符合筛选条件的任务。')).toBeVisible();
  await recentTasks.getByRole('button', { name: '查看全部任务' }).click();
  await expect(recentTasks.getByText('默认生成任务', { exact: true })).toBeVisible();
});
