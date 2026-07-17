import { expect, test } from '@playwright/test';
import { AMAP_MOCK_JS } from './lib/amap-mock';

const apiResponse = (data: unknown) => JSON.stringify({
  success: true,
  message: 'ok',
  requestId: 'map-route-regression',
  data,
  errorCode: null,
});

async function authenticate(page: import('@playwright/test').Page): Promise<void> {
  // 通过同源入口注册，让浏览器上下文接收真实 HttpOnly Cookie，避免手工 Cookie 与运行配置漂移。
  await page.goto('/login');
  const response = await page.context().request.post('/api/auth/register', {
    data: { username: `map_route_${Date.now()}`, password: 'Test123456' },
  });
  expect(response.ok()).toBeTruthy();
  const cookies = await page.context().cookies('http://localhost:3000');
  expect(cookies.some((cookie) => cookie.name === 'token')).toBeTruthy();
}

const task = (dayNumber: number, item: Record<string, unknown>) => ({
  id: `day-${dayNumber}`,
  dayNumber,
  itineraryDate: `2026-07-${String(dayNumber).padStart(2, '0')}`,
  status: 'ACTIVE',
  totalPoi: 1,
  completedPoi: 0,
  items: [{
    id: 9000 + dayNumber,
    poiName: `第 ${dayNumber} 天地点`,
    status: 'PENDING',
    period: '上午',
    media: [],
    isCustom: false,
    isCoordinateCorrected: false,
    ...item,
  }],
});

test.describe('地图路线交互回归', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(AMAP_MOCK_JS);
    await authenticate(page);
  });

  test('现场执行在全日无坐标时仍保留每日地图与恢复入口', async ({ page }) => {
    const tasks = [task(1, { poiLat: null, poiLng: null, displayLat: null, displayLng: null })];
    await page.route('**/api/trips/no-coordinates/checkin**', async (route) => {
      if (route.request().url().includes('backfill-coordinates')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: apiResponse(0) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: apiResponse(tasks) });
    });
    await page.route('**/api/trips/no-coordinates/track/points', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: apiResponse([]) });
    });

    await page.goto('/trips/no-coordinates/checkin');

    const mapSection = page.getByTestId('daily-route-map');
    await expect(mapSection).toBeVisible();
    await expect(mapSection.getByRole('button', { name: '重试补全' })).toBeVisible();
    await expect(mapSection.locator('[data-amap-ready="true"]')).toBeVisible();
  });

  test('自定义打卡点高亮时与 AI 打卡点保持相同卡片底色和层级', async ({ page }) => {
    const generatedTask = task(1, {
      poiLat: 30.67,
      poiLng: 104.06,
      displayLat: 30.67,
      displayLng: 104.06,
      description: 'AI 生成的地点描述',
    });
    const generatedItem = generatedTask.items[0];
    const customItem = {
      ...generatedItem,
      id: 9101,
      poiName: '自定义打卡点',
      poiAddress: '四川省成都市青羊区少城街道',
      description: undefined,
      isCustom: true,
      poiLat: 30.68,
      poiLng: 104.07,
      displayLat: 30.68,
      displayLng: 104.07,
    };
    const tasks = [{
      ...generatedTask,
      totalPoi: 2,
      items: [generatedItem, customItem],
    }];

    await page.route('**/api/trips/custom-card-style/checkin**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: apiResponse(tasks) });
    });
    await page.route('**/api/trips/custom-card-style/track/points', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: apiResponse([]) });
    });

    await page.goto('/trips/custom-card-style/checkin');

    const generatedCard = page.getByRole('group', { name: '在地图中查看 第 1 天地点' });
    const customCard = page.getByRole('group', { name: '在地图中查看 自定义打卡点' });
    await customCard.click();

    await expect(customCard).toHaveClass(/ring-2/);
    await expect(generatedCard.getByTestId('poi-info-card')).toHaveClass(/bg-white/);
    await expect(customCard.getByTestId('poi-info-card')).toHaveClass(/bg-white/);
    await expect(customCard.getByTestId('poi-info-card')).not.toHaveClass(/ring-2/);
    await expect(customCard.getByTestId('poi-primary-content')).toHaveText('自定义打卡点');
    await expect(customCard.getByTestId('poi-location-label')).toHaveText('四川省成都市青羊区少城街道');
    await expect(customCard.getByTestId('poi-primary-content')).not.toContainText('四川省成都市青羊区少城街道');
  });

  test('行程详情中的自定义项同样按内容在上、地点在下展示', async ({ page }) => {
    const customTask = task(1, {
      poiName: '玩',
      poiAddress: '四川省成都市青羊区少城街道长顺下街66号',
      description: undefined,
      isCustom: true,
      poiLat: 30.67,
      poiLng: 104.06,
      displayLat: 30.67,
      displayLng: 104.06,
    });

    await page.route('**/api/trips/custom-field-order/checkin', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: apiResponse([customTask]) });
    });
    await page.route('**/api/trips/custom-field-order', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: apiResponse({
          id: 'custom-field-order',
          title: '自定义字段顺序',
          destination: '成都',
          plannedDate: '2026-07-16',
          status: 'ONGOING',
          activeTaskId: 'task-field-order',
          taskVersions: [],
          checkinProgress: '0/1',
          createdAt: '2026-07-16T08:00:00',
        }),
      });
    });

    await page.goto('/trips/custom-field-order');
    await page.getByRole('button', { name: /第\s*1\s*天/ }).click();

    await expect(page.getByTestId('poi-primary-content')).toHaveText('玩');
    await expect(page.getByTestId('poi-location-label')).toHaveText('四川省成都市青羊区少城街道长顺下街66号');
  });

  test('完整路线默认叠加全部轨迹，并支持地图与每日卡片双向联动', async ({ page }) => {
    const tasks = [
      task(1, { poiLat: 30.67, poiLng: 104.06, displayLat: 30.67, displayLng: 104.06 }),
      task(2, { poiLat: 30.68, poiLng: 104.07, displayLat: 30.68, displayLng: 104.07 }),
    ];
    await page.route('**/api/trips/complete-route/checkin', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: apiResponse(tasks) });
    });
    await page.route('**/api/trips/complete-route/track/points', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: apiResponse([
          { id: 1, latitude: 30.67, longitude: 104.06, recordedAt: '2026-07-01T09:00:00Z' },
          { id: 2, latitude: 30.68, longitude: 104.07, recordedAt: '2026-07-01T10:00:00Z' },
        ]),
      });
    });
    await page.route('**/api/trips/complete-route', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: apiResponse({ id: 'complete-route', title: '完整路线', destination: '川西' }),
      });
    });

    await page.goto('/trips/complete-route/overview');

    const mapSection = page.getByTestId('complete-route-map');
    await expect(mapSection.locator('[data-amap-ready="true"]')).toBeVisible();
    await expect(mapSection.getByRole('button', { name: '全部显示' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => page.evaluate(() => {
      const map = (window as any).__AMAP_MOCK__?.map;
      return map ? Array.from(map._overlays).filter((overlay: any) => Array.isArray(overlay?._opts?.path)).length : 0;
    })).toBeGreaterThanOrEqual(2);

    const firstCard = page.getByRole('group', { name: '在完整路线地图中查看 第 1 天地点' });
    await firstCard.click();
    await expect(firstCard).toHaveClass(/ring-2/);
    await expect.poll(async () => page.evaluate(() => (window as any).__AMAP_MOCK__?.setCenterCalls.length ?? 0)).toBeGreaterThan(0);

    await page.evaluate(() => (window as any).__AMAP_MOCK__.markers[1].__emitClick());
    const secondCard = page.getByRole('group', { name: '在完整路线地图中查看 第 2 天地点' });
    await expect(secondCard).toHaveClass(/ring-2/);
    await expect(secondCard).toBeInViewport();
  });
});
