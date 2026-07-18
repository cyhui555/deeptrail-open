import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const PASSWORD = 'Test123456';

async function register(request: APIRequestContext, prefix: string): Promise<string> {
  const response = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: {
      username: `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10_000)}`,
      password: PASSWORD,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data.token as string;
}

async function createBlankTrip(
  request: APIRequestContext,
  token: string,
  title: string,
): Promise<string> {
  const response = await request.post(`${BACKEND_URL}/api/trips`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, plannedDate: '2026-08-01' },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data as string;
}

async function authenticatePage(page: Page, token: string): Promise<void> {
  await page.goto('/login');
  await page.context().addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' },
  ]);
}

async function addFirstPlace(page: Page, name: string): Promise<void> {
  const entry = page.getByRole('button', { name: '添加第一个地点' });
  await expect(entry).toBeVisible();
  await expect(entry).toBeEnabled();
  await entry.click();

  await expect(page.getByRole('heading', { name: '添加行程点' })).toBeVisible();
  await page.getByLabel('地名 / 名称 *').fill(name);
  await page.getByRole('button', { name: '确认添加' }).click();
  await expect(page.getByRole('heading', { name: '添加行程点' })).toBeHidden();
  await expect(page.getByRole('button', { name: '添加第一个地点' })).toBeHidden();
  await expect(page.getByRole('button', { name: '添加地点', exact: true })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

test.describe('BUG-20260718-005 空白行程首个地点', () => {
  test('桌面端可新增，刷新仍存在，非所有者不可新增', async ({ page, request }) => {
    const ownerToken = await register(request, 'blank_owner');
    const otherToken = await register(request, 'blank_other');
    const planId = await createBlankTrip(request, ownerToken, '空白行程持久化回归');
    await authenticatePage(page, ownerToken);

    await page.goto(`/trips/${planId}`);
    await addFirstPlace(page, '刷新后仍在的咖啡馆');

    await page.reload();
    await page.getByRole('button', { name: /第\s*1\s*天/ }).click();
    await expect(page.getByText('刷新后仍在的咖啡馆', { exact: true })).toBeVisible();

    const forbiddenResponse = await request.post(
      `${BACKEND_URL}/api/itineraries/checkin/trips/${planId}/custom-item`,
      {
        headers: { Authorization: `Bearer ${otherToken}` },
        data: { name: '越权地点', period: '下午' },
      },
    );
    expect(forbiddenResponse.status()).toBe(403);
    const forbiddenBody = await forbiddenResponse.json();
    expect(forbiddenBody.success).toBe(false);
    expect(forbiddenBody.errorCode).toBe('FORBIDDEN');
  });

  test('移动端入口和表单均可操作且页面无横向溢出', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const token = await register(request, 'blank_mobile');
    const planId = await createBlankTrip(request, token, '移动端空白行程');
    await authenticatePage(page, token);

    await page.goto(`/trips/${planId}`);
    await addFirstPlace(page, '移动端首个地点');

    const metrics = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  });
});
