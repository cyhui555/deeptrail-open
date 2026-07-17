/**
 * 地图标记点生命周期 E2E 测试。
 *
 * <p>覆盖 BUG-20260702-004（打卡后地图闪烁/消失）和
 * BUG-20260702-005（打卡后原有标记点消失）的修复验证。
 *
 * <p>策略：
 * <ul>
 *   <li>通过 {@code page.addInitScript} 注入高德地图 Mock，拦截所有 Marker/Map API 调用，
 *       记录创建、销毁、setCenter/setFitView 操作</li>
 *   <li>通过 {@code page.route} 拦截所有后端 API，返回确定性 fixture（无需 AI 生成）</li>
 *   <li>通过 Playwright 与渲染后的页面交互，执行「打卡/废弃/坐标修正」操作</li>
 *   <li>通过 window.__AMAP_MOCK__ 状态对象验证 map 内部行为</li>
 * </ul>
 */
import { test, expect, Page, Route } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

/**
 * 从 amap-mock.ts 导出模板字符串，去除 JS 包装层，得到可执行的纯 JS。
 */
function loadAmapMockJs(): string {
  const src = readFileSync(resolve(__dirname, 'lib/amap-mock.ts'), 'utf-8');
  const start = src.indexOf('`');
  const end = src.lastIndexOf('`;');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Unable to locate AMAP_MOCK_JS template literal in amap-mock.ts');
  }
  return src.slice(start + 1, end);
}

/** 读取 AMap mock 脚本源码 */
const AMAP_MOCK_JS = loadAmapMockJs();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** 3 个 POI 构成的打卡任务 fixture */
function buildTasksResponse(overrides: Record<string, unknown>[] = []) {
  return {
    success: true,
    message: 'ok',
    requestId: `r-${Date.now()}`,
    data: [
      {
        id: 'task-day-1',
        dayNumber: 1,
        itineraryDate: '2026-07-01',
        status: 'ONGOING',
        totalPoi: 3,
        completedPoi: 0,
        items: [
          {
            id: 1001,
            poiName: '人民公园',
            poiLat: 30.67,
            poiLng: 104.06,
            status: 'PENDING',
            period: '上午',
            isCoordinateCorrected: false,
            displayLat: 30.67,
            displayLng: 104.06,
            media: [],
          },
          {
            id: 1002,
            poiName: '宽窄巷子',
            poiLat: 30.68,
            poiLng: 104.07,
            status: 'PENDING',
            period: '下午',
            isCoordinateCorrected: false,
            displayLat: 30.68,
            displayLng: 104.07,
            media: [],
          },
          {
            id: 1003,
            poiName: '天府广场',
            poiLat: 30.69,
            poiLng: 104.08,
            status: 'PENDING',
            period: '晚上',
            isCoordinateCorrected: false,
            displayLat: 30.69,
            displayLng: 104.08,
            media: [],
          },
        ].map((it, idx) => ({ ...it, ...(overrides[idx] || {}) })),
      },
    ],
    errorCode: null,
  };
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

/**
 * 安装 API 拦截器。
 * - GET /api/trips/{id}/checkin 由调用方按需覆盖（提供 items 状态投影）
 * - POST /api/trips/{id}/checkin/start → 200 ok
 * - POST /api/itineraries/checkin/items/{id} → 200 ok
 * - PUT  /api/itineraries/checkin/items/{id}/abandon → 200 ok
 * - PUT  /api/itineraries/checkin/items/{id}/undo → 200 ok
 * - PUT  /api/itineraries/checkin/items/{id}/coordinates → 200 ok
 * - GET  /api/trips/{id}/track/points → []
 */
function installBaseApiMocks(page: Page) {
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
      // GET item detail
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'ok',
          data: buildTasksResponse().data[0].items[0],
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
        body: JSON.stringify({ success: true, message: 'ok', data: [], errorCode: null }),
      });
    } else {
      await route.continue();
    }
  });
}

/** 重置 window.__AMAP_MOCK__ */
async function resetAmapSpy(page: Page) {
  await page.evaluate(() => {
    if ((window as any).__AMAP_MOCK__) (window as any).__AMAP_MOCK__.reset();
  });
}

/** 读取 window.__AMAP_MOCK__ */
async function getAmapSpy(page: Page) {
  return await page.evaluate(() => (window as any).__AMAP_MOCK__);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('BUG-20260702-004/005 地图标记点生命周期', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(AMAP_MOCK_JS);
  });

  test('打卡后原有标记点不消失、不重新创建（BUG-20260702-005 修复验证）', async ({ page }) => {
    await registerAndLogin(page, `marker_persist_${Date.now()}`);
    installBaseApiMocks(page);

    // 状态只在打卡请求成功后变化，避免 Strict Mode 的重复 GET 被误判为用户操作。
    let checkedIn = false;
    await page.route('**/api/trips/*/checkin', async (route: Route) => {
      if (route.request().method() === 'GET') {
        const overrides = checkedIn
          ? [{ status: 'CHECKED_IN', checkedInAt: new Date().toISOString() }]
          : [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildTasksResponse(overrides)),
        });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/itineraries/checkin/items/1001', async (route: Route) => {
      if (route.request().method() === 'POST') {
        checkedIn = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: OK_RESP });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/');
    await page.goto('/trips/mock-plan-id/checkin');

    // 等待页面加载：第1天按钮可见
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });
    // 等待地图容器渲染后 marker 创建完成
    await page.waitForFunction(() => (window as any).__AMAP_MOCK__?.mapCount >= 1, null, {
      timeout: 10000,
    });
    await page.waitForFunction(
      () => (window as any).__AMAP_MOCK__?.addCalls.length >= 3,
      null,
      { timeout: 10000 },
    );
    // 初始视野适配会等待容器双帧稳定；marker 到达不代表 setFitView 已完成。
    await page.waitForFunction(
      () => (window as any).__AMAP_MOCK__?.setFitViewCalls.length >= 1,
      null,
      { timeout: 10000 },
    );
    // Web 端安全密钥必须先于地图初始化写入全局配置，防止合法 Key 被高德 SDK 拒绝。
    const securityCode = await page.evaluate(
      () => (window as any)._AMapSecurityConfig?.securityJsCode,
    );
    expect(securityCode).toBeTruthy();

    const before = await getAmapSpy(page);
    expect(before.markers.length).toBe(3);
    expect(before.addCalls.length).toBe(3);
    expect(before.setFitViewCalls.length).toBeGreaterThanOrEqual(1); // 初始 setFitView 至少 1 次

    // 重置 spy 用于观察打卡后的增量行为
    await resetAmapSpy(page);

    // 通过 POI 名称定位业务项，避免按钮顺序变化时误操作其他地点。
    const firstItem = page.getByRole('group', { name: '在地图中查看 人民公园' });
    const checkinButton = firstItem.getByRole('button', { name: '打卡', exact: true });
    await expect(checkinButton).toBeVisible({ timeout: 5000 });
    await checkinButton.click();

    // 等待「已打卡」标记出现
    await expect(firstItem.getByText(/已打卡/)).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(
      () => (window as any).__AMAP_MOCK__?.setContentCalls.length >= 1,
      null,
      { timeout: 10000 },
    );

    const after = await getAmapSpy(page);

    // === 断言：marker 不被销毁重建 ===
    expect(after.removeCalls, '打卡操作不应销毁任何已有 marker').toEqual([]);
    expect(after.addCalls, '打卡操作不应创建新 marker（已有 marker 应保留）').toEqual([]);
    expect(after.setFitViewCalls.length, '已有 marker 时不应再触发 setFitView').toBe(0);
  });

  test('废弃打卡项后该 POI 从地图移除，其他 marker 保留', async ({ page }) => {
    await registerAndLogin(page, `marker_abandon_${Date.now()}`);
    installBaseApiMocks(page);

    // 初始全 PENDING；废弃请求成功后 items[2] 才变为 ABANDONED。
    let abandoned = false;
    await page.route('**/api/trips/*/checkin', async (route: Route) => {
      if (route.request().method() === 'GET') {
        const overrides = abandoned ? [{}, {}, { status: 'ABANDONED' }] : [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildTasksResponse(overrides)),
        });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/itineraries/checkin/items/1003/abandon', async (route: Route) => {
      if (route.request().method() === 'POST') {
        abandoned = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: OK_RESP });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/');
    await page.goto('/trips/mock-plan-id/checkin');

    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => (window as any).__AMAP_MOCK__?.mapCount >= 1, null, {
      timeout: 10000,
    });
    await page.waitForFunction(
      () => (window as any).__AMAP_MOCK__?.addCalls.length >= 3,
      null,
      { timeout: 10000 },
    );

    const before = await getAmapSpy(page);
    expect(before.markers.length).toBe(3);

    await resetAmapSpy(page);

    // 通过 POI 名称定位天府广场对应的“放弃”。
    const abandonedItem = page.getByRole('group', { name: '在地图中查看 天府广场' });
    await abandonedItem.getByRole('button', { name: '放弃', exact: true }).click();
    const confirmDialog = page.getByRole('alertdialog', { name: '放弃这个地点？' });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: '确认放弃' }).click();

    // 等待「已放弃」标签出现在卡片上
    await expect(abandonedItem.getByText(/已放弃/)).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(
      () => (window as any).__AMAP_MOCK__?.removeCalls.length >= 1,
      null,
      { timeout: 10000 },
    );

    const after = await getAmapSpy(page);

    // === 断言：只有废弃 POI 的 marker 被销毁 ===
    expect(after.removeCalls.length, '仅废弃 POI 的 marker 应被销毁').toBe(1);
    expect(after.addCalls.length, '不应创建新 marker').toBe(0);
  });

  test('初始地图不渲染 status=ABANDONED 状态 POI 的 marker（BUG-20260702-004 次要根因）', async ({ page }) => {
    await registerAndLogin(page, `marker_filter_${Date.now()}`);
    installBaseApiMocks(page);

    // 直接返回包含 ABANDONED 项的 fixture
    await page.route('**/api/trips/*/checkin', async (route: Route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            buildTasksResponse([
              { status: 'PENDING' },
              { status: 'CHECKED_IN' },
              { status: 'ABANDONED' },
            ]),
          ),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await page.goto('/trips/mock-plan-id/checkin');

    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => (window as any).__AMAP_MOCK__?.mapCount >= 1, null, {
      timeout: 10000,
    });
    // 等待 marker 创建（ABANDONED 项不应产生 marker）
    await page.waitForFunction(
      () => (window as any).__AMAP_MOCK__?.addCalls.length >= 2,
      null,
      { timeout: 10000 },
    );
    // setFitView 发生在本轮 marker 构建完成后，用它作为地图投影稳定信号。
    await page.waitForFunction(
      () => (window as any).__AMAP_MOCK__?.setFitViewCalls.length >= 1,
      null,
      { timeout: 10000 },
    );

    const spy = await getAmapSpy(page);

    // === 断言：ABANDONED 状态 POI 不渲染 marker ===
    expect(spy.addCalls.length, '仅非 ABANDONED 状态 POI 创建 marker').toBe(2);
    expect(spy.markers.length, '已创建 marker 总数应为 2').toBe(2);
  });

  test('地图容器不因打卡操作 unmount/remount（视野不重置）', async ({ page }) => {
    await registerAndLogin(page, `marker_no_remount_${Date.now()}`);
    installBaseApiMocks(page);

    let checkedIn = false;
    await page.route('**/api/trips/*/checkin', async (route: Route) => {
      if (route.request().method() === 'GET') {
        const overrides = checkedIn
          ? [{ status: 'CHECKED_IN', checkedInAt: new Date().toISOString() }]
          : [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildTasksResponse(overrides)),
        });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/itineraries/checkin/items/1001', async (route: Route) => {
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
    await page.waitForFunction(() => (window as any).__AMAP_MOCK__?.mapCount >= 1, null, {
      timeout: 10000,
    });
    await page.waitForFunction(
      () => (window as any).__AMAP_MOCK__?.addCalls.length >= 3,
      null,
      { timeout: 10000 },
    );
    // 初始视野现在会等待容器双帧稳定；确认初次适配完成后再观察业务更新。
    await page.waitForFunction(
      () => (window as any).__AMAP_MOCK__?.setFitViewCalls.length >= 1,
      null,
      { timeout: 10000 },
    );

    await resetAmapSpy(page);

    // 保存地图容器的 DOM 引用
    const mapContainerBefore = await page.evaluate(() => {
      const el = document.querySelector('[class*="rounded-xl"][class*="overflow-hidden"]');
      return el ? el.getAttribute('data-test-marker') || 'container' : null;
    });

    const firstItem = page.getByRole('group', { name: '在地图中查看 人民公园' });
    const checkinButton = firstItem.getByRole('button', { name: '打卡', exact: true });
    await expect(checkinButton).toBeVisible({ timeout: 5000 });
    await checkinButton.click();
    await expect(firstItem.getByText(/已打卡/)).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(
      () => (window as any).__AMAP_MOCK__?.setContentCalls.length >= 1,
      null,
      { timeout: 10000 },
    );

    const spy = await getAmapSpy(page);

    // === 断言：marker 不被销毁重建（视野不重置） ===
    expect(spy.removeCalls, '打卡后 marker 不应被清空再重建').toEqual([]);
    expect(spy.addCalls, '打卡后不应创建新 marker').toEqual([]);
    expect(spy.setFitViewCalls.length, 'setFitView 不应在已有 marker 时触发').toBe(0);

    // map 容器仍然存在（未 unmount）
    const mapContainerAfter = await page.evaluate(() => {
      const el = document.querySelector('[class*="rounded-xl"][class*="overflow-hidden"]');
      return el ? el.getAttribute('data-test-marker') || 'container' : null;
    });
    expect(mapContainerAfter).toBe(mapContainerBefore);
  });
});
