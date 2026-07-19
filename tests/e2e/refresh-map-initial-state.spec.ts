import { expect, test } from '@playwright/test';
import { AMAP_MOCK_JS } from './lib/amap-mock';

const userFixture = {
  success: true,
  data: {
    userId: 1,
    username: '首屏回归用户',
    wechatBound: false,
    createdAt: '2026-07-15T10:00:00',
  },
};

/**
 * 认证确认慢于行程数据时，认证仍在后台完成，但不应继续遮挡已返回的受保护内容。
 */
test('renders trips before a slow authentication refresh finishes', async ({ page }) => {
  await page.context().addCookies([
    { name: 'token', value: 'refresh-order-fixture', domain: 'localhost', path: '/' },
  ]);

  let authFinished = false;
  await page.route('**/api/auth/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    authFinished = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userFixture),
    });
  });
  await page.route('**/api/trips?page=1&size=20', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          records: [{
            id: 'refresh-order-plan',
            title: '巴郎山首屏回归行程',
            destination: '川西巴郎山',
            status: 'PLANNED',
            totalPoi: 2,
            completedPoi: 0,
            checkinProgress: '0/2',
          }],
          total: 1,
          size: 20,
          current: 1,
          pages: 1,
        },
      }),
    });
  });

  await page.goto('/trips');
  await expect(page.getByRole('link', { name: /川西巴郎山/ })).toBeVisible({ timeout: 700 });
  expect(authFinished).toBe(false);
  await expect(page.getByText('正在整理你的旅程')).toHaveCount(0);
});

/** 提前渲染页面壳不能改变失效会话最终回到登录页的安全边界。 */
test('redirects an expired session after the background auth check', async ({ page }) => {
  await page.context().addCookies([
    { name: 'token', value: 'expired-refresh-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message: '登录已过期' }),
  }));
  await page.route('**/api/trips?page=1&size=20', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message: '登录已过期' }),
  }));

  await page.goto('/trips');
  await expect(page).toHaveURL(/\/login\?redirect=%2Ftrips$/);
  await expect(page.getByRole('heading', { name: '我的行程' })).toHaveCount(0);
});

/** 历史坐标回填即使很慢，也只能后台更新地图，不能继续阻塞行程内容首屏。 */
test('renders overview before slow coordinate backfill finishes', async ({ page }) => {
  await page.addInitScript(AMAP_MOCK_JS);
  await page.context().addCookies([
    { name: 'token', value: 'background-backfill-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(userFixture),
  }));
  let backfillFinished = false;
  await page.route('**/api/trips/background-plan/checkin/backfill-coordinates', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    backfillFinished = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: 0 }),
    });
  });
  await page.route('**/api/trips/background-plan/checkin', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [{
          id: 'background-day-1',
          dayNumber: 1,
          itineraryDate: '2026-07-15',
          status: 'ONGOING',
          totalPoi: 1,
          completedPoi: 0,
          items: [{
            id: 3301,
            poiName: '历史无坐标景点',
            poiLat: null,
            poiLng: null,
            displayLat: null,
            displayLng: null,
            status: 'PENDING',
            period: '上午',
            media: [],
          }],
        }],
      }),
    });
  });
  await page.route('**/api/trips/background-plan/track/points', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }),
  }));
  await page.route('**/api/trips/background-plan', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: { id: 'background-plan', title: '后台回填行程', destination: '川西' },
    }),
  }));

  await page.goto('/trips/background-plan/overview');
  await expect(page.getByText('历史无坐标景点', { exact: true })).toBeVisible({ timeout: 700 });
  expect(backfillFinished).toBe(false);
});

/** 部分成功必须展示真实完成度，不能把“更新 3 个”误报成 9 个地点均已恢复。 */
test('reports partial coordinate refresh result for nine POIs', async ({ page }) => {
  await page.addInitScript(AMAP_MOCK_JS);
  await page.context().addCookies([
    { name: 'token', value: 'coordinate-refresh-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(userFixture),
  }));

  const items = Array.from({ length: 9 }, (_, index) => ({
    id: 3401 + index,
    poiName: `脱敏地点 ${index + 1}`,
    poiLat: index < 3 ? 36.05 + index / 100 : null,
    poiLng: index < 3 ? 120.30 + index / 100 : null,
    displayLat: index < 3 ? 36.05 + index / 100 : null,
    displayLng: index < 3 ? 120.30 + index / 100 : null,
    status: 'PENDING',
    period: index < 5 ? '上午' : '下午',
    media: [],
  }));
  const taskResponse = {
    success: true,
    data: [{
      id: 'coordinate-refresh-day-1',
      dayNumber: 1,
      itineraryDate: '2026-07-19',
      status: 'ONGOING',
      totalPoi: 9,
      completedPoi: 0,
      items,
    }],
  };
  await page.route('**/api/trips/coordinate-refresh-plan/checkin/backfill-coordinates', (route) => (
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: 0 }),
    })
  ));
  let forceRefillCalls = 0;
  await page.route('**/api/trips/coordinate-refresh-plan/checkin/force-refill-coordinates', (route) => {
    forceRefillCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: 3 }),
    });
  });
  await page.route('**/api/trips/coordinate-refresh-plan/checkin', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(taskResponse),
  }));
  await page.route('**/api/trips/coordinate-refresh-plan/track/points', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }),
  }));
  await page.route('**/api/trips/coordinate-refresh-plan', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: { id: 'coordinate-refresh-plan', title: '坐标刷新回归', destination: '青岛' },
    }),
  }));

  await page.goto('/trips/coordinate-refresh-plan/overview');
  await expect(page.getByText('坐标 3/9', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /强制重查坐标/ }).click();

  await expect(page.getByText(
    '坐标刷新完成：更新 3 个，当前 3/9，仍有 6 个地点无法自动定位',
    { exact: true },
  )).toBeVisible();
  await expect(page.getByRole('button', { name: /强制重查坐标/ })).toBeEnabled();
  expect(forceRefillCalls).toBe(1);
});

/**
 * 任务数据先于地图 SDK 返回是线上常见顺序；SDK 就绪后必须补绘，而不能等待下一次业务状态变化。
 */
test('draws and fits the route when AMap becomes ready after trip data', async ({ page }) => {
  await page.context().addCookies([
    { name: 'token', value: 'map-load-order-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(userFixture),
  }));
  await page.route('**/api/trips/load-order-plan/checkin', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [{
          id: 'load-order-day-1',
          dayNumber: 1,
          itineraryDate: '2026-07-15',
          status: 'ONGOING',
          totalPoi: 2,
          completedPoi: 0,
          items: [
            {
              id: 3101,
              poiName: '四姑娘山双桥沟',
              poiLat: 30.9978,
              poiLng: 102.8434,
              displayLat: 30.9978,
              displayLng: 102.8434,
              status: 'PENDING',
              period: '上午',
              transportToNext: '驾车 86 公里',
              isCoordinateCorrected: false,
              media: [],
            },
            {
              id: 3102,
              poiName: '巴郎山垭口',
              poiLat: 30.8862,
              poiLng: 102.9086,
              displayLat: 30.8862,
              displayLng: 102.9086,
              status: 'PENDING',
              period: '下午',
              isCoordinateCorrected: false,
              media: [],
            },
          ],
        }],
      }),
    });
  });
  await page.route('**/api/trips/load-order-plan/track/points', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }),
  }));
  await page.route('https://webapi.amap.com/maps**', async (route) => {
    // 让任务先完成渲染，稳定复现“数据先到、SDK 后到”。
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: AMAP_MOCK_JS,
    });
  });

  await page.goto('/trips/load-order-plan/checkin');
  await expect(page.getByText('四姑娘山双桥沟', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__AMAP_MOCK__?.mapCount || 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__AMAP_MOCK__?.markers.length || 0)).toBe(2);
  await expect.poll(() => page.evaluate(() => {
    const overlays = Array.from((window as any).__AMAP_MOCK__?.map?._overlays || []) as any[];
    return overlays.filter((overlay) => Array.isArray(overlay?._opts?.path)).length;
  })).toBe(1);
  await expect.poll(() => page.evaluate(() => (
    (window as any).__AMAP_MOCK__?.setFitViewCalls.at(-1)?.overlayCount || 0
  ))).toBeGreaterThanOrEqual(2);
});

/** GPS 数据晚于地图首帧返回时，选择 GPS 模式后必须重新适配真实轨迹范围。 */
test('refits the viewport when GPS track points arrive after the first map frame', async ({ page }) => {
  await page.addInitScript(AMAP_MOCK_JS);
  await page.context().addCookies([
    { name: 'token', value: 'late-gps-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(userFixture),
  }));
  await page.route('**/api/trips/late-gps-plan/checkin', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: [{
        id: 'late-gps-day-1',
        dayNumber: 1,
        itineraryDate: '2026-07-15',
        status: 'ONGOING',
        totalPoi: 2,
        completedPoi: 0,
        items: [
          {
            id: 3201,
            poiName: '成都起点',
            poiLat: 30.5728,
            poiLng: 104.0668,
            displayLat: 30.5728,
            displayLng: 104.0668,
            status: 'PENDING',
            media: [],
          },
          {
            id: 3202,
            poiName: '成都终点',
            poiLat: 30.6728,
            poiLng: 104.1668,
            displayLat: 30.6728,
            displayLng: 104.1668,
            status: 'PENDING',
            media: [],
          },
        ],
      }],
    }),
  }));

  let releaseTrack!: () => void;
  const trackGate = new Promise<void>((resolve) => { releaseTrack = resolve; });
  await page.route('**/api/trips/late-gps-plan/track/points', async (route) => {
    await trackGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [
          { id: 1, latitude: 43.8, longitude: 87.6, recordedAt: '2026-07-15T10:00:00' },
          { id: 2, latitude: 43.9, longitude: 87.7, recordedAt: '2026-07-15T10:05:00' },
        ],
      }),
    });
  });

  await page.goto('/trips/late-gps-plan/checkin');
  await expect(page.getByText('成都起点', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    (window as any).__AMAP_MOCK__?.setFitViewCalls.length || 0
  ))).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'GPS轨迹' }).click();
  await page.evaluate(() => { (window as any).__AMAP_MOCK__.setFitViewCalls = []; });
  releaseTrack();

  await expect.poll(() => page.evaluate(() => (
    (window as any).__AMAP_MOCK__?.setFitViewCalls.at(-1)?.coordinates || []
  ))).toContain('87.6,43.8');
});
