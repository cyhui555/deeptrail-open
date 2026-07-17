import { expect, test } from '@playwright/test';
import { AMAP_MOCK_JS } from './lib/amap-mock';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

const apiResponse = (data: unknown) => JSON.stringify({
  success: true,
  message: 'ok',
  requestId: 'm13-ui-hardening',
  data,
  errorCode: null,
});

async function authenticate(page: import('@playwright/test').Page) {
  const response = await page.context().request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username: `m13_ui_${Date.now()}`, password: 'Test123456' },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  await page.context().addCookies([
    { name: 'token', value: body.data.token, domain: 'localhost', path: '/' },
  ]);
}

test.describe('M13 UI 与可访问性加固', () => {
  test('现场控制条与新增地点弹窗支持窄屏和完整键盘操作', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript(AMAP_MOCK_JS);
    await authenticate(page);

    await page.route('**/api/trips/m13-ui/checkin', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: apiResponse([{
          id: 'm13-day-1',
          dayNumber: 1,
          itineraryDate: '2026-07-16',
          theme: '城市漫步',
          status: 'ACTIVE',
          totalPoi: 1,
          completedPoi: 1,
          items: [{
            id: 13001,
            poiName: '人民公园',
            poiAddress: '成都市青羊区祠堂街',
            poiLat: 30.657,
            poiLng: 104.055,
            displayLat: 30.657,
            displayLng: 104.055,
            status: 'CHECKED_IN',
            source: 'MANUAL',
            checkedInAt: '2026-07-16T10:00:00+08:00',
            media: [{
              id: 1,
              mediaType: 'IMAGE',
              url: '/icons/icon-192.png',
              thumbnailUrl: null,
            }],
            period: '上午',
            description: '沿湖散步',
            isCustom: false,
            isCoordinateCorrected: false,
          }],
        }]),
      });
    });
    await page.route('**/api/trips/m13-ui/track/points', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: apiResponse([]) });
    });

    await page.goto('/trips/m13-ui/checkin');

    const mapScope = page.getByRole('group', { name: '地图范围' });
    await expect(mapScope).toBeVisible();
    const todayButton = mapScope.getByRole('button', { name: '本天' });
    const globalButton = mapScope.getByRole('button', { name: '全局行程' });
    await expect(todayButton).toHaveAttribute('aria-pressed', 'true');
    await globalButton.click();
    await expect(globalButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('progressbar', { name: '第 1 天打卡进度' })).toHaveAttribute('aria-valuenow', '1');
    await expect(page.getByRole('link', { name: '人民公园的第 1 个照片，在新窗口打开' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const addButton = page.getByRole('button', { name: '添加地点' });
    await addButton.click();
    const dialog = page.getByRole('dialog', { name: '添加行程点' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('地名 / 名称 *')).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: '关闭添加行程点弹窗' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: '确认添加' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: '关闭添加行程点弹窗' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(addButton).toBeFocused();
  });
});
