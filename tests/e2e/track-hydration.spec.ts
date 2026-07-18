import { expect, test, type Page, type Route } from '@playwright/test';

const HYDRATION_ERROR_PATTERN = /Hydration|hydrating|React error #(418|422)|server HTML|did not match/i;

function fulfillApi(route: Route, data: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'ok', data }),
  });
}

async function mockAuthenticatedSession(page: Page): Promise<void> {
  await page.context().addCookies([
    { name: 'token', value: 'track-hydration-local-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => fulfillApi(route, {
    userId: 18,
    username: '轨迹水合验收用户',
    role: 'USER',
    wechatBound: false,
    createdAt: '2026-07-18T08:00:00Z',
  }));
}

test.describe('轨迹历史时间水合回归', () => {
  test.use({ timezoneId: 'UTC' });

  test('历史轨迹在不同时区浏览器中保持北京时间并且没有水合错误', async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on('pageerror', (error) => {
      if (HYDRATION_ERROR_PATTERN.test(error.message)) {
        hydrationErrors.push(error.message);
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && HYDRATION_ERROR_PATTERN.test(message.text())) {
        hydrationErrors.push(message.text());
      }
    });

    await mockAuthenticatedSession(page);
    await page.route('**/api/trips/track-hydration/track/points', (route) => fulfillApi(route, [
      {
        id: 1,
        latitude: 30.572815,
        longitude: 104.066801,
        recordedAt: '2026-07-18T10:00:00Z',
      },
    ]));

    await page.goto('/trips/track-hydration/track');

    await expect(page.getByText('30.572815, 104.066801')).toBeVisible();
    const recordedTime = page.locator('time[datetime="2026-07-18T10:00:00Z"]');
    await expect(recordedTime).toHaveText('18:00:00');
    await expect(recordedTime).toHaveAttribute('title', '北京时间');
    expect(hydrationErrors).toEqual([]);
  });
});
