import { expect, test } from '@playwright/test';

const CONTROLLED_API_DELAY_MS = 300;
const PERFORMANCE_BUDGET_MS = 1_000;

function relativeLuminance(rgb: string): number {
  const channels = rgb.match(/\d+/g)?.slice(0, 3).map(Number) || [];
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string): number {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

/** 用可控延迟验证认证与行程请求并发，生产验收时同时启用 1 秒硬预算。 */
test('loads trip data in parallel with authentication', async ({ page }) => {
  await page.context().addCookies([
    { name: 'token', value: 'performance-fixture', domain: 'localhost', path: '/' },
  ]);

  let authStartedAt = 0;
  let tripsStartedAt = 0;

  await page.route('**/api/auth/me', async (route) => {
    authStartedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, CONTROLLED_API_DELAY_MS));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          userId: 1,
          username: '性能验收用户',
          wechatBound: false,
          createdAt: '2026-07-15T10:00:00',
        },
      }),
    });
  });

  await page.route('**/api/trips?page=1&size=20', async (route) => {
    tripsStartedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, CONTROLLED_API_DELAY_MS));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          records: [{
            id: 'performance-plan',
            title: '川西雪山环线',
            destination: '川西雪山环线',
            status: 'PLANNED',
            totalPoi: 8,
            completedPoi: 2,
            checkinProgress: '2/8',
          }],
          total: 1,
          size: 20,
          current: 1,
          pages: 1,
        },
      }),
    });
  });

  const navigationStartedAt = Date.now();
  await page.goto('/trips');
  await expect(page.getByText('川西雪山环线')).toBeVisible();
  const visibleAfterMs = Date.now() - navigationStartedAt;

  expect(authStartedAt).toBeGreaterThan(0);
  expect(tripsStartedAt).toBeGreaterThan(0);
  expect(Math.abs(authStartedAt - tripsStartedAt)).toBeLessThan(150);
  console.log(`trips-visible-ms=${visibleAfterMs} request-start-gap-ms=${Math.abs(authStartedAt - tripsStartedAt)}`);

  if (process.env.STRICT_TRIPS_PERFORMANCE === 'true') {
    expect(visibleAfterMs).toBeLessThan(PERFORMANCE_BUDGET_MS);
  }

  const primaryButton = page.getByRole('button', { name: '新建行程' });
  const styles = await primaryButton.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundColor: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
      color: computed.color,
    };
  });
  expect(styles.backgroundImage).toBe('none');
  expect(styles.backgroundColor).toBe('rgb(43, 101, 149)');
  expect(styles.color).toBe('rgb(255, 250, 243)');
  expect(contrastRatio(styles.color, styles.backgroundColor)).toBeGreaterThanOrEqual(4.5);
});
