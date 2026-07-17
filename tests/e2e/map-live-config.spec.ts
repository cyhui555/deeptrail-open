import { expect, test } from '@playwright/test';

async function installMapPageFixtures(page: import('@playwright/test').Page): Promise<void> {
  await page.context().addCookies([
    { name: 'token', value: 'map-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: {
        userId: 1,
        username: '地图验收用户',
        wechatBound: false,
        createdAt: '2026-07-15T10:00:00',
      },
    }),
  }));
  await page.route('**/api/trips/live-map-plan/checkin', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: [{
        id: 'live-map-day-1',
        dayNumber: 1,
        itineraryDate: '2026-07-15',
        status: 'ONGOING',
        totalPoi: 1,
        completedPoi: 0,
        items: [{
          id: 1001,
          poiName: '成都人民公园',
          poiLat: 30.6592,
          poiLng: 104.0567,
          displayLat: 30.6592,
          displayLng: 104.0567,
          status: 'PENDING',
          period: '上午',
          isCoordinateCorrected: false,
          media: [],
        }],
      }],
    }),
  }));
  await page.route('**/api/trips/live-map-plan/track/points', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }),
  }));
}

test('loads the configured AMap SDK without exposing configuration values', async ({ page }) => {
  test.skip(process.env.LIVE_AMAP !== 'true', '仅在显式真实地图验收时调用高德服务');

  const amapErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      const text = message.text();
      if (/AMap|INVALID_USER|USERKEY|USER_SCODE/i.test(text)) amapErrors.push(text);
    }
  });

  await installMapPageFixtures(page);

  await page.goto('/trips/live-map-plan/checkin');
  await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible();
  await expect(page.locator('.amap-maps')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('地图配置未完成')).toHaveCount(0);
  await expect(page.getByText('地图连接失败')).toHaveCount(0);
  await expect(page.getByText('地图加载超时')).toHaveCount(0);

  const securityConfigured = await page.evaluate(
    () => Boolean((window as any)._AMapSecurityConfig?.securityJsCode),
  );
  expect(securityConfigured).toBe(true);
  expect(amapErrors).toEqual([]);
});

test('classifies an AMap script failure and retries without reloading the page', async ({ page }) => {
  await installMapPageFixtures(page);
  let scriptRequests = 0;
  await page.route('https://webapi.amap.com/maps**', async (route) => {
    scriptRequests += 1;
    await route.abort('failed');
  });

  await page.goto('/trips/live-map-plan/checkin');
  await expect(page.getByText('地图连接失败')).toBeVisible();
  await expect(page.getByText('高德地图脚本未能加载，请检查网络后重试。')).toBeVisible();

  await page.getByRole('button', { name: '重新加载地图' }).click();
  await expect.poll(() => scriptRequests).toBe(2);
  await expect(page.getByText('地图连接失败')).toBeVisible();
});
