/**
 * 地图标记点图标 + 交通工具标注 + 全局视图 Tab E2E 测试。
 *
 * <p>覆盖 v0.7.0 新增的三个能力：
 * <ul>
 *   <li>M1：PENDING / CHECKED_IN 展示不同颜色 + 图标（橙色圆+序号 / 绿色圆+✓），
 *       且打卡后通过 setContent 就地更新（不销毁重建 marker）</li>
 *   <li>M2：路线段中点出现 AMap.Text 交通工具标注（emoji + 文案，如 🚶 步行约10分钟）</li>
 *   <li>M3：「本天 / 全局行程」Tab 切换，全局视图下 marker 数 = 全部 POI（按天序）</li>
 * </ul>
 */
import { test, expect, Page, Route } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

/** 从 amap-mock.ts 导出模板字符串，去除 JS 包装层，得到可执行的纯 JS。 */
function loadAmapMockJs(): string {
  const src = readFileSync(resolve(__dirname, 'lib/amap-mock.ts'), 'utf-8');
  const start = src.indexOf('`');
  const end = src.lastIndexOf('`;');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Unable to locate AMAP_MOCK_JS template literal in amap-mock.ts');
  }
  return src.slice(start + 1, end);
}

const AMAP_MOCK_JS = loadAmapMockJs();
const GLOBE_TEXTURE_STUB = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * 构建多天多 POI 打卡任务 fixture。
 *
 * @param dayItems 每天 items 列表（数组长度即天数）
 * @param overrides 全局 overrides（通过 dayIndex + itemIndex 复合覆盖）
 */
function buildMultiDayResponse(
  dayItems: { id: number; name: string; lat: number; lng: number; transport?: string; status?: string }[][],
) {
  const data = dayItems.map((items, dayIdx) => ({
    id: `task-day-${dayIdx + 1}`,
    dayNumber: dayIdx + 1,
    itineraryDate: `2026-07-0${dayIdx + 1}`,
    status: 'ACTIVE',
    totalPoi: items.length,
    completedPoi: 0,
    items: items.map((it) => ({
      id: it.id,
      poiName: it.name,
      poiLat: it.lat,
      poiLng: it.lng,
      status: it.status || 'PENDING',
      source: null,
      checkedInAt: null as string | null,
      media: [],
      isCoordinateCorrected: false,
      displayLat: it.lat,
      displayLng: it.lng,
      transportToNext: it.transport || null,
    })),
  }));
  return { success: true, message: 'ok', requestId: `r-${Date.now()}`, data, errorCode: null };
}

/** 2 天行程 —— 第1天 3 个 POI（带 WALK 交通工具），第2天 2 个 POI（带 SUBWAY）。 */
function buildTwoDayResponse() {
  return buildMultiDayResponse([
    [
      { id: 2001, name: '人民公园', lat: 30.67, lng: 104.06, transport: '{"mode":"WALK","durationMin":10,"description":"步行约10分钟"}' },
      { id: 2002, name: '宽窄巷子', lat: 30.68, lng: 104.07, transport: '{"mode":"WALK","durationMin":20,"description":"步行约20分钟"}' },
      { id: 2003, name: '天府广场', lat: 30.69, lng: 104.08 },
    ],
    [
      { id: 2004, name: '武侯祠', lat: 30.70, lng: 104.09, transport: '{"mode":"SUBWAY","durationMin":15,"description":"地铁约15分钟"}' },
      { id: 2005, name: '锦里', lat: 30.71, lng: 104.10 },
    ],
  ]);
}

const OK_RESP = JSON.stringify({ success: true, message: 'ok', data: null, errorCode: null });

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

async function registerAndLogin(
  page: Page,
  username: string,
  password = 'Test123456',
): Promise<{ token: string; username: string }> {
  const resp = await page.context().request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username, password },
  });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  const token: string = body.data.token;
  await page.context().addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' },
  ]);
  return { token, username };
}

interface MockTrackPoint {
  id: number;
  latitude: number;
  longitude: number;
  recordedAt: string;
}

function installBaseApiMocks(page: Page, trackPoints: MockTrackPoint[] = []) {
  page.route('**/api/trips/*/checkin/start', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: OK_RESP });
    } else {
      await route.continue();
    }
  });
  page.route('**/api/itineraries/checkin/items/**', async (route: Route) => {
    const method = route.request().method();
    if (method === 'PUT' || method === 'POST' || method === 'DELETE') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: OK_RESP });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'ok',
          data: buildTwoDayResponse().data[0].items[0],
          errorCode: null,
        }),
      });
    }
  });
  page.route('**/api/trips/*/track/points', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'ok',
          data: trackPoints,
          errorCode: null,
        }),
      });
    } else {
      await route.continue();
    }
  });
}

function installGlobeAssetMocks(page: Page) {
  page.route(
    'https://cdn.jsdelivr.net/npm/three-globe@2.45.2/example/img/**',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: GLOBE_TEXTURE_STUB,
      });
    },
  );
}

async function resetAmapSpy(page: Page) {
  await page.evaluate(() => {
    if ((window as any).__AMAP_MOCK__) (window as any).__AMAP_MOCK__.reset();
  });
}

async function getAmapSpy(page: Page) {
  return await page.evaluate(() => (window as any).__AMAP_MOCK__);
}

/** 等待 marker 全部创建完成 */
async function waitForMarkers(page: Page, count: number, timeout = 10000) {
  await page.waitForFunction(
    (n) => (window as any).__AMAP_MOCK__?.addCalls.length >= n,
    count,
    { timeout },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('v0.7.0 打卡地图增强（图标 / 交通工具标注 / 全局视图 Tab）', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(AMAP_MOCK_JS);
  });

  // -----------------------------------------------------------------------
  // M1：PENDING 显示橙色+序号；打卡后通过 setContent 就地更新为绿色+✓
  // -----------------------------------------------------------------------

  test('PENDING 状态 marker 图标应为橙色背景 + 序号数字', async ({ page }) => {
    await registerAndLogin(page, `icon_pending_${Date.now()}`);
    installBaseApiMocks(page);

    await page.route('**/api/trips/*/checkin', async (route: Route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildTwoDayResponse()),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await page.goto('/trips/mock-plan-id/checkin');
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });
    await waitForMarkers(page, 3);

    const spy = await getAmapSpy(page);
    expect(spy.markers.length).toBe(3);
    // 第1个 marker（序号 1）：PENDING → 橙色背景 + 数字 "1"
    expect(spy.markers[0]._content).toContain('#f97316'); // orange
    expect(spy.markers[0]._content).toMatch(/>1<\/div>/);
    // 第2个 marker（序号 2）：PENDING → 数字 "2"
    expect(spy.markers[1]._content).toContain('#f97316');
    expect(spy.markers[1]._content).toMatch(/>2<\/div>/);
    // 第3个 marker（序号 3）：PENDING → 数字 "3"
    expect(spy.markers[2]._content).toContain('#f97316');
    expect(spy.markers[2]._content).toMatch(/>3<\/div>/);
  });

  test('打卡后 marker 图标应就地更新为绿色 + ✓，不销毁重建', async ({ page }) => {
    await registerAndLogin(page, `icon_checkin_${Date.now()}`);
    installBaseApiMocks(page);

    let checkedIn = false;
    await page.route('**/api/trips/*/checkin', async (route: Route) => {
      if (route.request().method() === 'GET') {
        const body = buildTwoDayResponse();
        if (checkedIn) {
          // 打卡后第1天第1个 POI（id=2001）变为 CHECKED_IN
          body.data[0].items[0].status = 'CHECKED_IN';
          body.data[0].items[0].checkedInAt = new Date().toISOString();
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/itineraries/checkin/items/2001', async (route: Route) => {
      if (route.request().method() === 'POST') {
        checkedIn = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: OK_RESP });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/');
    await page.goto('/trips/mock-plan-id/checkin');
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });
    await waitForMarkers(page, 3);

    // 第一个 marker 初始是橙色 + 数字 1
    const spy1 = await getAmapSpy(page);
    const markerId = spy1.markers[0]._id;
    expect(spy1.markers[0]._content).toContain('#f97316');

    await resetAmapSpy(page);

    // 通过 POI 业务名称定位第一枚地图标记对应的列表项。
    const firstItem = page.getByRole('group', { name: '在地图中查看 人民公园' });
    const checkinButton = firstItem.getByRole('button', { name: '打卡', exact: true });
    await expect(checkinButton).toBeVisible({ timeout: 5000 });
    await checkinButton.click();
    await expect(firstItem.getByText(/已打卡/)).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(
      (id) => (window as any).__AMAP_MOCK__?.setContentCalls.some(
        (call: any) => call.id === id && call.html.includes('#22c55e') && call.html.includes('✓'),
      ),
      markerId,
      { timeout: 10000 },
    );

    const spy2 = await getAmapSpy(page);
    // 不应销毁 / 新增 marker
    expect(spy2.removeCalls).toEqual([]);
    expect(spy2.addCalls).toEqual([]);
    // 应有 setContent 调用（就地更新图标）
    const setContentForFirst = spy2.setContentCalls.filter((c: any) => c.id === markerId);
    expect(setContentForFirst.length).toBeGreaterThanOrEqual(1);
    // 更新后内容应包含绿色 + ✓
    const lastContent = setContentForFirst[setContentForFirst.length - 1].html;
    expect(lastContent).toContain('#22c55e'); // green
    expect(lastContent).toContain('✓');
  });

  // -----------------------------------------------------------------------
  // M2：路线段中点出现 AMap.Text 交通工具标注
  // -----------------------------------------------------------------------

  test('路线段中点应创建 AMap.Text 交通工具标注（emoji + 文案）', async ({ page }) => {
    await registerAndLogin(page, `transport_text_${Date.now()}`);
    installBaseApiMocks(page);

    await page.route('**/api/trips/*/checkin', async (route: Route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildTwoDayResponse()),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await page.goto('/trips/mock-plan-id/checkin');
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });
    await waitForMarkers(page, 3);
    await page.waitForFunction(
      () => (window as any).__AMAP_MOCK__?.texts.length >= 2,
      null,
      { timeout: 10000 },
    );

    const spy = await getAmapSpy(page);
    // 第1天有 3 个 POI → 2 段路线 → 应有 2 个 Text（最后一个 POI 无 transportToNext）
    expect(spy.texts.length).toBeGreaterThanOrEqual(2);
    // 第1段 WALK → 文案包含 🚶 + 步行约10分钟
    expect(spy.texts[0]._text).toContain('🚶');
    expect(spy.texts[0]._text).toContain('步行约10分钟');
    // 第2段 WALK → 步行约20分钟
    expect(spy.texts[1]._text).toContain('🚶');
    expect(spy.texts[1]._text).toContain('步行约20分钟');
  });

  // -----------------------------------------------------------------------
  // M3：全局视图 Tab 展示全部 POI
  // -----------------------------------------------------------------------

  test('默认本天视图 —— 只展示当天 3 个 marker', async ({ page }) => {
    await registerAndLogin(page, `tab_day_${Date.now()}`);
    installBaseApiMocks(page);

    await page.route('**/api/trips/*/checkin', async (route: Route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildTwoDayResponse()),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await page.goto('/trips/mock-plan-id/checkin');
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });
    await waitForMarkers(page, 3);

    const spy = await getAmapSpy(page);
    expect(spy.markers.length).toBe(3);
    expect(spy.addCalls.length).toBe(3);
  });

  test('地图标记与行程列表双向联动，并支持键盘选择', async ({ page }) => {
    await registerAndLogin(page, `map_list_link_${Date.now()}`);
    installBaseApiMocks(page);

    await page.route('**/api/trips/*/checkin', async (route: Route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildTwoDayResponse()),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/trips/mock-plan-id/checkin');
    await waitForMarkers(page, 3);

    const itemGroups = page.getByRole('group', { name: /在地图中查看/ });
    await expect(itemGroups).toHaveCount(3);
    const secondItem = page.getByRole('group', { name: '在地图中查看 宽窄巷子' });
    const firstItem = page.getByRole('group', { name: '在地图中查看 人民公园' });

    // 列表到地图：键盘 Enter 选中第二项并让地图居中。
    await secondItem.focus();
    await secondItem.press('Enter');
    await expect(secondItem).toHaveClass(/(^|\s)ring-2 ring-primary-500 ring-offset-2/);
    await expect.poll(async () => {
      const spy = await getAmapSpy(page);
      return spy.setCenterCalls.length;
    }).toBeGreaterThan(0);

    // 地图到列表：触发第一枚 marker，第一项应接管共享选中态。
    await page.evaluate(() => (window as any).__AMAP_MOCK__.markers[0].__emitClick());
    await expect(firstItem).toHaveClass(/(^|\s)ring-2 ring-primary-500 ring-offset-2/);
    await expect(secondItem).not.toHaveClass(/(^|\s)ring-2 ring-primary-500 ring-offset-2/);
  });

  test('切换到「全局行程」Tab —— 应展示全部 5 个 POI（第1天3 + 第2天2）', async ({ page }) => {
    await registerAndLogin(page, `tab_global_${Date.now()}`);
    installBaseApiMocks(page);

    await page.route('**/api/trips/*/checkin', async (route: Route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildTwoDayResponse()),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await page.goto('/trips/mock-plan-id/checkin');
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });

    // 默认本天（第1天）：3 个 marker
    await waitForMarkers(page, 3);
    const spy1 = await getAmapSpy(page);
    expect(spy1.markers.length).toBe(3);

    await resetAmapSpy(page);

    // 点击「全局行程」Tab
    const globalTab = page.getByRole('button', { name: '全局行程' });
    await expect(globalTab).toBeVisible({ timeout: 5000 });
    await globalTab.click();

    // 全局视图应增量新增 2 个 marker（第2天的武侯祠和锦里）；不销毁已有 marker
    await page.waitForFunction(
      () => {
        const spy = (window as any).__AMAP_MOCK__;
        const overlays = spy?.map?._overlays;
        if (!spy || !overlays) return false;
        return spy.addCalls.length >= 2
          && Array.from(overlays).filter((overlay: any) => overlay?._isMarker).length >= 5;
      },
      null,
      { timeout: 10000 },
    );
    const spy2 = await getAmapSpy(page);
    // addCalls 增量 = 2（第1天的 3 个已有 marker 被复用）
    expect(spy2.addCalls.length).toBe(2);
    // 没有任何 marker 被销毁（第1天 marker 被保留供全局视图复用）
    expect(spy2.removeCalls).toEqual([]);
    // 当前地图容器应有 5 个 marker（3 旧 + 2 新），但 _overlays 还含 Polyline + Text
    // 故按 _isMarker 过滤计数
    const markerCount = await page.evaluate(() => {
      const overlays = (window as any).__AMAP_MOCK__?.map?._overlays;
      if (!overlays) return 0;
      let count = 0;
      overlays.forEach((o: any) => { if (o?._isMarker) count++; });
      return count;
    });
    expect(markerCount).toBe(5);
  });

  test('全局行程可切换为 3D 地球并与打卡列表共享选择状态', async ({ page }) => {
    await registerAndLogin(page, `globe_global_${Date.now()}`);
    installBaseApiMocks(page, [
      { id: 1, latitude: 30.67, longitude: 104.06, recordedAt: '2026-07-24T08:00:00Z' },
      { id: 2, latitude: 30.68, longitude: 104.07, recordedAt: '2026-07-24T08:05:00Z' },
      { id: 3, latitude: 30.69, longitude: 104.08, recordedAt: '2026-07-24T08:10:00Z' },
    ]);
    installGlobeAssetMocks(page);

    await page.route('**/api/trips/*/checkin', async (route: Route) => {
      if (route.request().method() === 'GET') {
        const globeResponse = buildTwoDayResponse();
        globeResponse.data[0].items[0].status = 'CHECKED_IN';
        globeResponse.data[0].items[0].checkedInAt = '2026-07-24T08:00:00Z';
        globeResponse.data[0].items[1].status = 'CHECKED_IN';
        globeResponse.data[0].items[1].checkedInAt = '2026-07-24T08:05:00Z';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(globeResponse),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await page.goto('/trips/mock-plan-id/checkin');
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({
      timeout: 10000,
    });

    const globeButton = page.getByRole('button', { name: '3D 地球' });
    await globeButton.click();
    await expect(globeButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '全局行程' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const globe = page.getByTestId('checkin-globe');
    await expect(globe).toHaveAttribute('data-checkin-globe-ready', 'true', {
      timeout: 30000,
    });
    await expect(globe).toHaveAttribute('data-checkin-globe-point-count', '5');
    await expect(globe).toHaveAttribute('data-checkin-globe-track-point-count', '3');
    const globeScene = globe.getByRole('group', {
      name: /可交互 3D 地球，全局行程共 5 个地点/,
    });
    await expect(globeScene).toBeVisible();
    await expect(globe.locator('canvas')).toBeVisible();
    await page.getByRole('button', { name: '全部显示' }).click();
    await expect(globe.getByText('实际路线')).toBeVisible();
    await expect(globe.getByText('GPS 轨迹')).toBeVisible();

    const globeMarker = globe.getByRole('button', {
      name: '宽窄巷子，已打卡，查看打卡卡片',
    });
    await expect(globeMarker).toBeVisible();
    await globeMarker.focus();
    await globeMarker.press('Enter');

    const secondItem = page.getByRole('group', { name: '在地图中查看 宽窄巷子' });
    await expect(secondItem).toHaveClass(/(^|\s)ring-2 ring-primary-500 ring-offset-2/);
    await expect(globeScene).toHaveAccessibleName(/当前选中宽窄巷子/);

    const flatButton = page.getByRole('button', { name: '平面地图' });
    await flatButton.click();
    await expect(flatButton).toHaveAttribute('aria-pressed', 'true');
    await expect(globe).toHaveCount(0);
    await expect(page.getByRole('region', { name: '平面打卡地图' })).toBeVisible();
  });
});
