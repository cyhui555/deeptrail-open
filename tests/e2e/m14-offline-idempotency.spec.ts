import { expect, test, type Page, type Route } from '@playwright/test';
import { AMAP_MOCK_JS } from './lib/amap-mock';

type OfflineStoreName = 'checkins' | 'trackPoints';

interface OfflineStoreSnapshot {
  version: number;
  records: Array<Record<string, unknown>>;
}

interface CheckinPayload {
  source?: string;
  idempotencyKey?: string;
}

interface TrackUploadPoint {
  latitude: number;
  longitude: number;
  recordedAt: string;
  clientPointId?: string;
}

interface TrackUploadPayload {
  points: TrackUploadPoint[];
}

function fulfillApi(route: Route, data: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'ok', data }),
  });
}

/** 使用本地认证替身，避免幂等边界测试依赖真实用户和后端数据。 */
async function mockAuthenticatedSession(page: Page): Promise<void> {
  await page.context().addCookies([
    { name: 'token', value: 'm14-local-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => fulfillApi(route, {
    userId: 14,
    username: 'M14 离线幂等验收用户',
    wechatBound: false,
    createdAt: '2026-07-16T08:00:00+08:00',
  }));
}

/** 从页面实际使用的 IndexedDB 读取版本和待同步记录。 */
async function readOfflineSnapshot(
  page: Page,
  storeName: OfflineStoreName,
): Promise<OfflineStoreSnapshot> {
  return page.evaluate(async (name) => new Promise<OfflineStoreSnapshot>((resolve, reject) => {
    const openRequest = indexedDB.open('travel-offline');
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      if (!database.objectStoreNames.contains(name)) {
        const version = database.version;
        database.close();
        resolve({ version, records: [] });
        return;
      }

      const recordsRequest = database.transaction(name, 'readonly').objectStore(name).getAll();
      recordsRequest.onerror = () => {
        database.close();
        reject(recordsRequest.error);
      };
      recordsRequest.onsuccess = () => {
        const records = recordsRequest.result as Array<Record<string, unknown>>;
        const version = database.version;
        database.close();
        resolve({ version, records });
      };
    };
  }), storeName);
}

async function readOfflineStore(
  page: Page,
  storeName: OfflineStoreName,
): Promise<Array<Record<string, unknown>>> {
  return (await readOfflineSnapshot(page, storeName)).records;
}

/** 预置真实 v1 数据库，复现升级前没有幂等标识的待同步打卡。 */
async function seedLegacyV1Checkin(page: Page, itemId: number): Promise<void> {
  // 使用同源静态资源建立页面上下文，避免应用代码抢先把数据库打开为 v2。
  await page.goto('/manifest.json');
  await page.evaluate(async (legacyItemId) => {
    await new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase('travel-offline');
      deleteRequest.onerror = () => reject(deleteRequest.error);
      deleteRequest.onblocked = () => reject(new Error('删除旧离线数据库时被其他连接阻塞'));
      deleteRequest.onsuccess = () => resolve();
    });

    await new Promise<void>((resolve, reject) => {
      const openRequest = indexedDB.open('travel-offline', 1);
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onblocked = () => reject(new Error('创建 v1 离线数据库时被其他连接阻塞'));
      openRequest.onupgradeneeded = () => {
        const database = openRequest.result;
        database.createObjectStore('checkins', { keyPath: 'id', autoIncrement: true });
        database.createObjectStore('trackPoints', { keyPath: 'id', autoIncrement: true });
      };
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        const transaction = database.transaction('checkins', 'readwrite');
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error);
        };
        transaction.objectStore('checkins').add({
          itemId: legacyItemId,
          source: 'MANUAL',
          recordedAt: '2026-07-16T08:00:00.000Z',
          synced: false,
        });
      };
    });
  }, itemId);
}

/** 触发浏览器联网事件，走与真实网络恢复一致的自动同步入口。 */
async function dispatchOnline(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

/** 注入可精确推进采样的定位替身，不申请系统定位权限。 */
async function installTrackGeolocationMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let nextWatchId = 1;
    const watchers = new Map<number, PositionCallback>();
    const geolocation: Geolocation = {
      getCurrentPosition(success) {
        success({
          coords: {
            latitude: 30.657,
            longitude: 104.055,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: 0,
            toJSON: () => ({}),
          },
          timestamp: Date.parse('2026-07-16T08:00:00.000Z'),
          toJSON: () => ({}),
        });
      },
      watchPosition(success) {
        const watchId = nextWatchId;
        nextWatchId += 1;
        watchers.set(watchId, success);
        return watchId;
      },
      clearWatch(watchId) {
        watchers.delete(watchId);
      },
    };

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: geolocation,
    });
    (window as typeof window & {
      __emitM14TrackPosition?: (latitude: number, longitude: number, timestamp: number) => void;
    }).__emitM14TrackPosition = (latitude, longitude, timestamp) => {
      const position: GeolocationPosition = {
        coords: {
          latitude,
          longitude,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: 0,
          toJSON: () => ({}),
        },
        timestamp,
        toJSON: () => ({}),
      };
      watchers.forEach((success) => success(position));
    };
  });
}

test.describe('M14 离线重放幂等边界', () => {
  test('v1 旧打卡由 v2 在发网前补齐幂等键，失败重试不重复也不丢队列', async ({ page }) => {
    const planId = 'm14-legacy-checkin';
    const itemId = 14_002;
    const payloads: CheckinPayload[] = [];
    const requestBoundarySnapshots: OfflineStoreSnapshot[] = [];
    let releaseFirstAttempt: () => void = () => {
      throw new Error('首次同步请求尚未进入路由边界');
    };
    const firstAttemptGate = new Promise<void>((resolve) => {
      releaseFirstAttempt = resolve;
    });

    await page.addInitScript(AMAP_MOCK_JS);
    await mockAuthenticatedSession(page);
    await seedLegacyV1Checkin(page, itemId);

    const legacySnapshot = await readOfflineSnapshot(page, 'checkins');
    expect(legacySnapshot.version).toBe(1);
    expect(legacySnapshot.records).toHaveLength(1);
    expect(legacySnapshot.records[0]).not.toHaveProperty('idempotencyKey');

    await page.route(`**/api/trips/${planId}/checkin`, (route) => fulfillApi(route, [{
      id: 'm14-legacy-day-1',
      dayNumber: 1,
      itineraryDate: '2026-07-16',
      theme: '旧队列升级验收',
      status: 'ACTIVE',
      totalPoi: 1,
      completedPoi: 0,
      items: [{
        id: itemId,
        poiName: '宽窄巷子',
        poiAddress: '成都市青羊区长顺上街',
        poiLat: 30.669,
        poiLng: 104.059,
        displayLat: 30.669,
        displayLng: 104.059,
        source: 'MANUAL',
        status: 'PENDING',
        media: [],
        period: '上午',
        isCustom: false,
        isCoordinateCorrected: false,
      }],
    }]));
    await page.route(`**/api/trips/${planId}/track/points`, (route) => fulfillApi(route, []));
    await page.route(`**/api/itineraries/checkin/items/${itemId}`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }

      payloads.push(route.request().postDataJSON() as CheckinPayload);
      if (payloads.length === 1) {
        // 请求暂挂在网络边界时读取数据库，证明补键事务不依赖请求成功或失败。
        requestBoundarySnapshots.push(await readOfflineSnapshot(page, 'checkins'));
        await firstAttemptGate;
        await route.abort('connectionreset');
        return;
      }
      await fulfillApi(route, null);
    });

    await page.goto(`/trips/${planId}/checkin`);
    await expect.poll(() => requestBoundarySnapshots.length).toBe(1);
    const firstPayloadKey = payloads[0]?.idempotencyKey;
    expect(firstPayloadKey).toEqual(expect.any(String));
    expect(firstPayloadKey).not.toBe('');

    const requestBoundarySnapshot = requestBoundarySnapshots[0];
    expect(requestBoundarySnapshot.version).toBe(2);
    expect(requestBoundarySnapshot.records).toHaveLength(1);
    expect(requestBoundarySnapshot.records[0].idempotencyKey).toBe(firstPayloadKey);
    await expect(page.getByRole('status').filter({ hasText: '正在同步离线数据...' })).toBeVisible();

    releaseFirstAttempt();
    await expect(page.getByRole('status').filter({ hasText: '正在同步离线数据...' })).toBeHidden();
    await expect.poll(async () => (await readOfflineStore(page, 'checkins')).length).toBe(1);
    const failedQueue = await readOfflineStore(page, 'checkins');
    expect(failedQueue[0].idempotencyKey).toBe(firstPayloadKey);

    await dispatchOnline(page);

    await expect(page.getByRole('status').filter({
      hasText: '同步完成：1 条打卡、0 条轨迹已同步',
    })).toBeVisible();
    expect(payloads).toHaveLength(2);
    expect(payloads[1].idempotencyKey).toBe(firstPayloadKey);
    await expect.poll(async () => (await readOfflineStore(page, 'checkins')).length).toBe(0);
  });

  test('打卡响应丢失后入队，联网重放复用同一 idempotencyKey 并清空队列', async ({ page }) => {
    const planId = 'm14-offline-checkin';
    const itemId = 14_001;
    const payloads: CheckinPayload[] = [];

    await page.addInitScript(AMAP_MOCK_JS);
    await mockAuthenticatedSession(page);
    await page.route(`**/api/trips/${planId}/checkin`, (route) => fulfillApi(route, [{
      id: 'm14-day-1',
      dayNumber: 1,
      itineraryDate: '2026-07-16',
      theme: '离线幂等验收',
      status: 'ACTIVE',
      totalPoi: 1,
      completedPoi: 0,
      items: [{
        id: itemId,
        poiName: '人民公园',
        poiAddress: '成都市青羊区祠堂街',
        poiLat: 30.657,
        poiLng: 104.055,
        displayLat: 30.657,
        displayLng: 104.055,
        source: 'MANUAL',
        status: 'PENDING',
        media: [],
        period: '上午',
        isCustom: false,
        isCoordinateCorrected: false,
      }],
    }]));
    await page.route(`**/api/trips/${planId}/track/points`, (route) => fulfillApi(route, []));
    await page.route(`**/api/itineraries/checkin/items/${itemId}`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }

      payloads.push(route.request().postDataJSON() as CheckinPayload);
      if (payloads.length === 1) {
        // 请求体已经离开页面，但响应在浏览器边界丢失：服务器语义可能已发生。
        await route.abort('connectionreset');
        return;
      }
      await fulfillApi(route, null);
    });

    await page.goto(`/trips/${planId}/checkin`);
    const item = page.getByRole('group', { name: '在地图中查看 人民公园' });
    await item.getByRole('button', { name: '打卡', exact: true }).click();

    await expect(page.getByRole('status').filter({
      hasText: '网络不可用，打卡已本地保存，恢复后自动同步',
    })).toBeVisible();
    expect(payloads).toHaveLength(1);
    expect(payloads[0].idempotencyKey).toEqual(expect.any(String));
    expect(payloads[0].idempotencyKey).not.toBe('');

    const queued = await readOfflineStore(page, 'checkins');
    expect(queued).toHaveLength(1);
    expect(queued[0].idempotencyKey).toBe(payloads[0].idempotencyKey);

    await dispatchOnline(page);

    await expect(page.getByRole('status').filter({
      hasText: '同步完成：1 条打卡、0 条轨迹已同步',
    })).toBeVisible();
    expect(payloads).toHaveLength(2);
    expect(payloads[1].idempotencyKey).toBe(payloads[0].idempotencyKey);
    await expect.poll(async () => (await readOfflineStore(page, 'checkins')).length).toBe(0);
  });

  test('轨迹响应丢失后入队，联网重放为每个点复用同一 clientPointId', async ({ page }) => {
    const planId = 'm14-offline-track';
    const payloads: TrackUploadPayload[] = [];

    await mockAuthenticatedSession(page);
    await installTrackGeolocationMock(page);
    await page.route(`**/api/trips/${planId}/track/points`, async (route) => {
      if (route.request().method() === 'GET') {
        await fulfillApi(route, []);
        return;
      }

      const payload = route.request().postDataJSON() as TrackUploadPayload;
      payloads.push(payload);
      if (payloads.length === 1) {
        // 模拟服务端可能已保存、浏览器却只观察到连接中断的窗口。
        await route.abort('connectionreset');
        return;
      }
      await fulfillApi(route, payload.points.length);
    });

    await page.goto(`/trips/${planId}/track`);
    await page.getByRole('button', { name: '开始记录' }).click();
    await page.evaluate(() => {
      const emit = (window as typeof window & {
        __emitM14TrackPosition?: (latitude: number, longitude: number, timestamp: number) => void;
      }).__emitM14TrackPosition;
      if (!emit) throw new Error('轨迹定位替身未安装');
      emit(30.657, 104.055, Date.parse('2026-07-16T08:00:00.000Z'));
      emit(30.658, 104.056, Date.parse('2026-07-16T08:00:01.000Z'));
    });
    await expect(page.getByRole('status').filter({ hasText: '正在记录' })).toContainText('2 个点');
    await page.getByRole('button', { name: '结束并保存' }).click();

    await expect(page.getByRole('status').filter({
      hasText: '已离线保存 2 个点，联网后自动同步',
    })).toBeVisible();
    expect(payloads).toHaveLength(1);
    const firstIds = payloads[0].points.map((point) => point.clientPointId);
    expect(firstIds).toHaveLength(2);
    expect(firstIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(firstIds).size).toBe(firstIds.length);

    const queued = await readOfflineStore(page, 'trackPoints');
    expect(queued).toHaveLength(2);
    expect(queued.map((point) => point.clientPointId)).toEqual(firstIds);

    await dispatchOnline(page);

    await expect(page.getByRole('status').filter({
      hasText: '已同步 0 条打卡、2 个轨迹点',
    })).toBeVisible();
    expect(payloads).toHaveLength(2);
    expect(payloads[1].points.map((point) => point.clientPointId)).toEqual(firstIds);
    await expect.poll(async () => (await readOfflineStore(page, 'trackPoints')).length).toBe(0);
  });
});
