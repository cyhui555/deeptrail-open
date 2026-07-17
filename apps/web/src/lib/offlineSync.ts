import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import { checkin, uploadTrackPoints } from './api';

const DB_NAME = 'travel-offline';
const DB_VERSION = 2;
/** 控制单次同步请求体大小，避免长轨迹占满主线程与网络连接。 */
const TRACK_SYNC_BATCH_SIZE = 500;

let fallbackUuidSequence = 0;

/**
 * 生成客户端稳定标识。
 *
 * 优先使用浏览器原生安全随机能力；仅在旧 WebView 缺少 Web Crypto 时，才使用混合时间、
 * 高精度时钟、进程内序号与 Math.random 的兼容回退，降低同一会话内碰撞概率。
 */
export function createIdempotencyKey(): string {
  const cryptoApi = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  fallbackUuidSequence = (fallbackUuidSequence + 1) % Number.MAX_SAFE_INTEGER;
  let timestamp = Date.now() + fallbackUuidSequence;
  let highResolution = typeof performance === 'undefined' ? 0 : Math.floor(performance.now() * 1000);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const mixed = timestamp > 0
      ? (timestamp + random) % 16
      : (highResolution + random) % 16;
    timestamp = Math.floor(timestamp / 16);
    highResolution = Math.floor(highResolution / 16);
    const value = token === 'x' ? mixed : (mixed & 0x3) | 0x8;
    return value.toString(16);
  });
}

function normalizeClientId(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized || createIdempotencyKey();
}

/** IndexedDB 中可能由 v1 留下、尚未包含幂等标识的打卡记录。 */
interface StoredOfflineCheckin {
  id?: number;
  itemId: number;
  lat?: number;
  lng?: number;
  accuracy?: number;
  source: string;
  note?: string;
  recordedAt: string;
  idempotencyKey?: string;
  synced: boolean;
}

/** 同步前已完成 v2 兼容迁移的离线打卡记录。 */
export interface OfflineCheckin extends Omit<StoredOfflineCheckin, 'id' | 'idempotencyKey'> {
  id: number;
  idempotencyKey: string;
}

/** IndexedDB 中可能由 v1 留下、尚未包含客户端点标识的轨迹记录。 */
interface StoredOfflineTrackPoint {
  id?: number;
  planId: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  accuracy?: number;
  recordedAt: string;
  clientPointId?: string;
  synced: boolean;
}

/** 同步前已完成 v2 兼容迁移的离线轨迹点。 */
export interface OfflineTrackPoint extends Omit<StoredOfflineTrackPoint, 'id' | 'clientPointId'> {
  id: number;
  clientPointId: string;
}

type OfflineCheckinInput = Omit<OfflineCheckin, 'id' | 'synced' | 'idempotencyKey'> & {
  idempotencyKey?: string;
};

type OfflineTrackPointInput = Omit<OfflineTrackPoint, 'id' | 'synced' | 'clientPointId'> & {
  clientPointId?: string;
};

/** 离线数据库 Schema。 */
interface OfflineDBSchema extends DBSchema {
  checkins: {
    key: number;
    value: StoredOfflineCheckin;
  };
  trackPoints: {
    key: number;
    value: StoredOfflineTrackPoint;
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db: IDBPDatabase<OfflineDBSchema>) {
        if (!db.objectStoreNames.contains('checkins')) {
          db.createObjectStore('checkins', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
        if (!db.objectStoreNames.contains('trackPoints')) {
          db.createObjectStore('trackPoints', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
        // v2 仅扩展记录值，不变更对象仓库结构；旧记录会在每次同步前补齐标识并提交事务。
      },
    });
  }
  return dbPromise!;
}

/** 保存离线打卡记录。 */
export async function saveOfflineCheckin(data: OfflineCheckinInput) {
  const db = await getDB();
  await db.add('checkins', {
    ...data,
    idempotencyKey: normalizeClientId(data.idempotencyKey),
    synced: false,
  });
}

/** 获取未同步打卡；旧记录必须先持久化幂等键，再交给网络层。 */
export async function getUnsyncedCheckins(): Promise<OfflineCheckin[]> {
  const db = await getDB();
  const all = await db.getAll('checkins');
  const transaction = db.transaction('checkins', 'readwrite');
  const pending: StoredOfflineCheckin[] = [];
  const operations: Array<Promise<unknown>> = [];

  for (const record of all) {
    if (record.synced) {
      if (record.id !== undefined) operations.push(transaction.store.delete(record.id));
      continue;
    }

    const idempotencyKey = normalizeClientId(record.idempotencyKey);
    const normalized: StoredOfflineCheckin = { ...record, idempotencyKey };
    pending.push(normalized);
    if (record.idempotencyKey !== idempotencyKey || record.id === undefined) {
      operations.push(transaction.store.put(normalized).then((id) => {
        normalized.id = id;
      }));
    }
  }

  await Promise.all(operations);
  await transaction.done;

  const migrated: OfflineCheckin[] = [];
  for (const record of pending) {
    if (record.id === undefined || !record.idempotencyKey) continue;
    migrated.push({ ...record, id: record.id, idempotencyKey: record.idempotencyKey });
  }
  return migrated;
}

/** 同步成功后删除队列记录；离线库只保留尚未送达服务器的数据。 */
export async function markCheckinSynced(id: number) {
  const db = await getDB();
  await db.delete('checkins', id);
}

/** 保存离线轨迹点。 */
export async function saveOfflineTrackPoint(data: OfflineTrackPointInput) {
  const db = await getDB();
  await db.add('trackPoints', {
    ...data,
    clientPointId: normalizeClientId(data.clientPointId),
    synced: false,
  });
}

/** 在同一个 IndexedDB 事务中批量保存轨迹点，避免长轨迹逐点开启事务。 */
export async function saveOfflineTrackPoints(
  points: OfflineTrackPointInput[],
) {
  if (points.length === 0) return;
  const db = await getDB();
  const transaction = db.transaction('trackPoints', 'readwrite');
  await Promise.all([
    ...points.map((point) => transaction.store.add({
      ...point,
      clientPointId: normalizeClientId(point.clientPointId),
      synced: false,
    })),
    transaction.done,
  ]);
}

/**
 * 清除当前浏览器中的用户级离线数据。
 *
 * 登出或会话失效时调用，避免下一位登录用户读到上一位用户的待同步记录。
 */
export async function clearOfflineData(): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(['checkins', 'trackPoints'], 'readwrite');
    await Promise.all([
      transaction.objectStore('checkins').clear(),
      transaction.objectStore('trackPoints').clear(),
      transaction.done,
    ]);
  } catch {
    // IndexedDB 损坏或配额异常时，先关闭当前连接，再尽力删除整个离线库。
    // 登录和退出属于认证边界，不能被本地增强存储的异常阻断。
    try {
      const db = await dbPromise;
      db?.close();
    } catch {
      // 打开数据库本身失败时没有可关闭的连接。
    }
    dbPromise = null;

    if (typeof indexedDB === 'undefined') return;
    try {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    } catch {
      // 浏览器完全禁用 IndexedDB 时仍需允许认证流程继续。
    }
  }
}

/** 获取未同步轨迹点；旧记录必须先持久化客户端点标识，再交给网络层。 */
export async function getUnsyncedTrackPoints(): Promise<OfflineTrackPoint[]> {
  const db = await getDB();
  const all = await db.getAll('trackPoints');
  const transaction = db.transaction('trackPoints', 'readwrite');
  const pending: StoredOfflineTrackPoint[] = [];
  const operations: Array<Promise<unknown>> = [];

  for (const record of all) {
    if (record.synced) {
      if (record.id !== undefined) operations.push(transaction.store.delete(record.id));
      continue;
    }

    const clientPointId = normalizeClientId(record.clientPointId);
    const normalized: StoredOfflineTrackPoint = { ...record, clientPointId };
    pending.push(normalized);
    if (record.clientPointId !== clientPointId || record.id === undefined) {
      operations.push(transaction.store.put(normalized).then((id) => {
        normalized.id = id;
      }));
    }
  }

  await Promise.all(operations);
  await transaction.done;

  const migrated: OfflineTrackPoint[] = [];
  for (const record of pending) {
    if (record.id === undefined || !record.clientPointId) continue;
    migrated.push({ ...record, id: record.id, clientPointId: record.clientPointId });
  }
  return migrated;
}

/** 批量删除已同步轨迹点，避免队列随旅行次数无限增长。 */
export async function markTrackPointsSynced(ids: number[]) {
  const db = await getDB();
  const tx = db.transaction('trackPoints', 'readwrite');
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

type SyncResult = { checkins: number; tracks: number };

let syncInFlight: Promise<SyncResult> | null = null;

/** 执行一轮离线同步；对外由 syncAll 合并并发调用。 */
async function performSyncAll(): Promise<SyncResult> {
  let checkinCount = 0;
  let trackCount = 0;

  // 同步打卡
  const unsyncedCheckins = await getUnsyncedCheckins();
  for (const c of unsyncedCheckins) {
    try {
      await checkin(c.itemId, {
        lat: c.lat,
        lng: c.lng,
        accuracy: c.accuracy,
        source: c.source,
        note: c.note,
        idempotencyKey: c.idempotencyKey,
      });
      await markCheckinSynced(c.id);
      checkinCount++;
    } catch {
      // 跳过失败的记录，下次重试
    }
  }

  // 同步轨迹点
  const unsyncedTracks = await getUnsyncedTrackPoints();
  if (unsyncedTracks.length > 0) {
    const planGroups = new Map<string, OfflineTrackPoint[]>();
    for (const t of unsyncedTracks) {
      const group = planGroups.get(t.planId) || [];
      group.push(t);
      planGroups.set(t.planId, group);
    }
    for (const [gPlanId, points] of Array.from(planGroups.entries())) {
      points.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
      for (let offset = 0; offset < points.length; offset += TRACK_SYNC_BATCH_SIZE) {
        const batch = points.slice(offset, offset + TRACK_SYNC_BATCH_SIZE);
        try {
          const savedCount = await uploadTrackPoints(
            gPlanId,
            batch.map((point) => ({
              latitude: point.latitude,
              longitude: point.longitude,
              altitude: point.altitude,
              speed: point.speed,
              accuracy: point.accuracy,
              recordedAt: point.recordedAt,
              clientPointId: point.clientPointId,
            })),
          );
          // 服务端可能过滤低精度点；成功响应后仍移除整批，避免无效点永久重试。
          await markTrackPointsSynced(batch.map((point) => point.id));
          trackCount += savedCount;
        } catch {
          // 保留当前批次及后续点，下次联网时按时间顺序继续同步。
          break;
        }
      }
    }
  }

  return { checkins: checkinCount, tracks: trackCount };
}

/**
 * 自动同步所有离线数据。
 *
 * 多个页面 Hook、online 事件或手动操作可能同时触发同步；模块级 Promise 保证同一轮只上传一次，
 * 所有调用方共享相同结果。完成后释放锁，使下一轮可以处理刚入队的数据。
 */
export function syncAll(): Promise<SyncResult> {
  if (!syncInFlight) {
    syncInFlight = performSyncAll().finally(() => {
      syncInFlight = null;
    });
  }
  return syncInFlight;
}
