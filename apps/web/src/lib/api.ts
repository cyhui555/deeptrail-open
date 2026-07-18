import type {
  ApiResponse,
  AuthResponse,
  TaskDetail,
  TaskSummary,
  PageResult,
  GenerateRequest,
  OptimizeRequest,
  XiaohongshuRequest,
  TripPlanSummary,
  TripPlanDetail,
  CheckinTask,
  CheckinItem,
  CheckinMedia,
  TrackPoint,
  JourneyReview,
  NodeRevision,
  SaveNodeRevisionRequest,
  AiProviderStatus,
  AdminUser,
  UserInfo,
} from '@/types';

/**
 * 携带 HTTP 状态码的 API 异常，便于调用方区分错误类型（如 401 登出 vs 500 服务器错误）。
 */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  try {
    const res = await fetch(path, {
      ...options,
      signal: controller.signal,
      credentials: 'include',
      headers: { ...headers, ...options?.headers as Record<string, string> },
    });

    if (res.status === 401) {
      // HttpOnly Cookie 由后端统一清理；UI 状态由 AuthContext 处理。
      let message = '请先登录';
      try {
        const err = (await res.json()) as ApiResponse<never>;
        message = err.message || message;
      } catch { /* ignore */ }
      throw new ApiError(message, 401);
    }

    if (!res.ok) {
      let message: string;
      try {
        const err = (await res.json()) as ApiResponse<never>;
        message = err.message || `HTTP ${res.status}`;
      } catch {
        message = `HTTP ${res.status} ${res.statusText}`;
      }
      throw new ApiError(message, res.status);
    }

    const body = (await res.json()) as ApiResponse<T>;
    if (!body.success) {
      // 后端通过 HTTP 200 + errorCode 返回业务错误；UNAUTHORIZED 当作 401 处理，触发前端登出
      if (body.errorCode === 'UNAUTHORIZED') {
        throw new ApiError(body.message || '请先登录', 401);
      }
      throw new Error(body.message || body.errorCode || 'Request failed');
    }
    return body.data as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ========== Auth API ==========

export async function apiLogin(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function apiLogout(): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST' });
}

export async function fetchMe(): Promise<UserInfo> {
  return request<UserInfo>('/api/auth/me');
}

// ========== Admin user API ==========

export async function fetchAdminUsers(
  keyword: string,
  page: number,
  size = 20,
): Promise<PageResult<AdminUser>> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (keyword) params.set('keyword', keyword);
  return request<PageResult<AdminUser>>(`/api/admin/users?${params.toString()}`);
}

export async function createAdminUser(username: string, password: string): Promise<AdminUser> {
  return request<AdminUser>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function updateAdminUserStatus(userId: number, enabled: boolean): Promise<AdminUser> {
  return request<AdminUser>(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export async function resetAdminUserPassword(userId: number, password: string): Promise<void> {
  return request<void>(`/api/admin/users/${userId}/password`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });
}

// ========== Health API ==========

export async function fetchHealth(): Promise<string> {
  const data = await request<string>('/api/health');
  return data || '';
}

// ========== AI readiness API ==========

/** 读取经过后端脱敏的模型服务状态；响应不包含任何密钥或连接参数。 */
export async function fetchAiProviderStatus(): Promise<AiProviderStatus> {
  return request<AiProviderStatus>('/api/ai/status');
}

// ========== Task API ==========

export async function submitGenerateTask(
  data: GenerateRequest,
): Promise<{ taskId: string }> {
  return request('/api/itineraries/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function submitOptimizeTask(
  data: OptimizeRequest,
): Promise<{ taskId: string }> {
  return request('/api/itineraries/optimize', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function submitXiaohongshuTask(
  data: XiaohongshuRequest,
): Promise<{ taskId: string }> {
  return request('/api/itineraries/from-xiaohongshu', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchTaskStatus(taskId: string): Promise<TaskDetail> {
  return request(`/api/itineraries/tasks/${taskId}`);
}

export async function fetchTaskList(
  status?: string,
  page = 1,
  size = 10,
): Promise<PageResult<TaskSummary>> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('size', String(size));
  return request(`/api/itineraries/tasks?${params.toString()}`);
}

export async function cancelTask(taskId: string): Promise<void> {
  return request(`/api/itineraries/tasks/${taskId}`, { method: 'DELETE' });
}

// ========== 节点修正 API ==========

/** 列出任务下所有节点修正 */
export async function listNodeRevisions(taskId: string): Promise<NodeRevision[]> {
  return request<NodeRevision[]>(`/api/itineraries/tasks/${taskId}/node-revisions`);
}

/** 保存（UPSERT）节点修正 */
export async function saveNodeRevision(
  taskId: string,
  data: SaveNodeRevisionRequest,
): Promise<NodeRevision> {
  return request<NodeRevision>(`/api/itineraries/tasks/${taskId}/node-revisions`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** 删除节点修正 */
export async function deleteNodeRevision(
  taskId: string,
  dayIndex: number,
  itemIndex: number,
): Promise<void> {
  return request<void>(
    `/api/itineraries/tasks/${taskId}/node-revisions/${dayIndex}/${itemIndex}`,
    { method: 'DELETE' },
  );
}

// ========== 行程清单 API ==========

/**
 * 创建行程清单。
 *
 * 两种模式：
 * - taskId 非空：从 AI 任务创建（自动提取 destination/summary/打卡任务）；
 * - taskId 为空：创建空白清单，用户后续手动添加行程点（不自动启动打卡）。
 */
export async function createTripPlan(data: {
  title: string;
  taskId?: string;
  plannedDate?: string;
  /** AI 生成的日程日期范围，如 "2026-07-10 ~ 2026-07-12"，可选。 */
  tripDates?: string;
  note?: string;
}): Promise<string> {
  const planId = await request<string>('/api/trips', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  clearTripPlansCache();
  return planId;
}

interface TripPlansCacheEntry {
  expiresAt: number;
  data?: PageResult<TripPlanSummary>;
  promise?: Promise<PageResult<TripPlanSummary>>;
}

const TRIP_PLANS_CACHE_TTL_MS = 5_000;
const tripPlansCache = new Map<string, TripPlansCacheEntry>();

/**
 * 清理行程列表短缓存。
 * 缓存只存在当前页面内存中，登录用户切换或列表数据发生变更时必须立即清理，避免跨用户复用。
 */
export function clearTripPlansCache(): void {
  tripPlansCache.clear();
}

/** 获取当前用户的行程清单列表，并合并同一筛选、页码和页大小的并发请求。 */
export function getTripPlans(
  status?: string,
  page = 1,
  size = 20,
): Promise<PageResult<TripPlanSummary>> {
  const cacheKey = `${status || 'ALL'}:${page}:${size}`;
  const cached = tripPlansCache.get(cacheKey);
  if (cached?.data && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  if (cached?.promise) return cached.promise;

  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (status) params.set('status', status);
  const query = `?${params.toString()}`;
  const pending = request<PageResult<TripPlanSummary>>(`/api/trips${query}`)
    .then((data) => {
      tripPlansCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + TRIP_PLANS_CACHE_TTL_MS,
      });
      return data;
    })
    .catch((error: unknown) => {
      tripPlansCache.delete(cacheKey);
      throw error;
    });

  tripPlansCache.set(cacheKey, { expiresAt: 0, promise: pending });
  return pending;
}

/** 在认证检查进行时提前加载默认行程列表，页面挂载后复用同一个请求结果。 */
export function preloadTripPlans(): Promise<PageResult<TripPlanSummary>> {
  return getTripPlans();
}

/** 获取单个行程清单详情 */
export async function getTripPlan(planId: string): Promise<TripPlanDetail> {
  return request<TripPlanDetail>(`/api/trips/${planId}`);
}

/** 更新行程清单 */
export async function updateTripPlan(
  planId: string,
  data: { title?: string; plannedDate?: string; note?: string; status?: string },
): Promise<void> {
  await request<void>(`/api/trips/${planId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  clearTripPlansCache();
}

/** 删除行程清单（软删除） */
export async function deleteTripPlan(planId: string): Promise<void> {
  await request<void>(`/api/trips/${planId}`, { method: 'DELETE' });
  clearTripPlansCache();
}

/** 关联任务到清单 */
export async function addTaskToPlan(planId: string, taskId: string): Promise<void> {
  return request<void>(`/api/trips/${planId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  });
}

/** 切换执行版本 */
export async function setActiveTask(planId: string, taskId: string): Promise<void> {
  return request<void>(`/api/trips/${planId}/active-task`, {
    method: 'PUT',
    body: JSON.stringify({ taskId }),
  });
}

// ========== 打卡 API ==========

/** 开始打卡 */
export async function startCheckin(planId: string, startDay?: number): Promise<string> {
  return request<string>(`/api/trips/${planId}/checkin/start`, {
    method: 'POST',
    body: JSON.stringify({ startDay }),
  });
}

/** 获取打卡任务列表 */
export async function getCheckinTasks(planId: string): Promise<CheckinTask[]> {
  return request<CheckinTask[]>(`/api/trips/${planId}/checkin`);
}

/** 批量回填缺失坐标的打卡项（地理编码反查）；返回成功回填的项数 */
export async function backfillCoordinates(planId: string): Promise<number> {
  return request<number>(`/api/trips/${planId}/checkin/backfill-coordinates`, { method: 'POST' });
}

/**
 * 强制重查所有打卡项坐标（清洗同名跨城脏坐标）
 *
 * 清空已有坐标后重新地理编码反查，依赖 province/destination 同城校验
 * 清洗重庆等同名错误坐标。返回成功反查并写入的项数。
 */
export async function forceRefillCoordinates(planId: string): Promise<number> {
  return request<number>(`/api/trips/${planId}/checkin/force-refill-coordinates`, { method: 'POST' });
}

/** 获取单日打卡详情 */
export async function getCheckinTaskDetail(checkinTaskId: string): Promise<CheckinTask> {
  return request<CheckinTask>(`/api/itineraries/checkin/tasks/${checkinTaskId}`);
}

/** 打卡请求；幂等标识为可选字段，以兼容旧客户端与非重试场景。 */
export interface CheckinRequest {
  lat?: number;
  lng?: number;
  source?: string;
  note?: string;
  accuracy?: number;
  idempotencyKey?: string;
}

/** 打卡 */
export async function checkin(
  itemId: number,
  data: CheckinRequest,
): Promise<void> {
  return request<void>(`/api/itineraries/checkin/items/${itemId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 撤销打卡 */
export async function undoCheckin(itemId: number): Promise<void> {
  return request<void>(`/api/itineraries/checkin/items/${itemId}/undo`, {
    method: 'POST',
  });
}

/** 废弃打卡项 */
export async function abandonCheckin(itemId: number): Promise<void> {
  return request<void>(`/api/itineraries/checkin/items/${itemId}/abandon`, {
    method: 'POST',
  });
}

/**
 * 添加自定义行程点到某天的打卡列表；空白行程可省略 taskId，
 * 由服务端持久化首个手动日程。
 *
 * @param planId 行程清单 ID
 * @param taskId 打卡任务 ID（某天）；空白行程首个地点传 null
 * @param data 自定义点信息；lat/lng 同时填写或同时留空
 * @return 新增打卡项 ID
 */
export async function addCustomItem(
  planId: string,
  taskId: string | null,
  data: {
    name: string;
    period?: string;
    description?: string;
    estimatedCost?: string;
    address?: string;
    lat?: number;
    lng?: number;
  },
): Promise<number> {
  const path = taskId
    ? `/api/itineraries/checkin/trips/${planId}/checkin/${taskId}/custom-item`
    : `/api/itineraries/checkin/trips/${planId}/custom-item`;
  return request<number>(path, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * 编辑自定义行程点（isCustom=true + PENDING 状态）。
 *
 * @param itemId 打卡项 ID
 * @param data 编辑字段；lat/lng 为 null 表示保留原坐标
 */
export async function editCustomItem(
  itemId: number,
  data: {
    name: string;
    period?: string | null;
    description?: string | null;
    estimatedCost?: string | null;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
  },
): Promise<void> {
  return request<void>(`/api/itineraries/checkin/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** 获取打卡项详情 */
export async function getCheckinItemDetail(itemId: number): Promise<CheckinItem> {
  return request<CheckinItem>(`/api/itineraries/checkin/items/${itemId}`);
}

/** 修正打卡项坐标（用户拖动地图标记点） */
export async function updateItemCoordinates(itemId: number, lat: number, lng: number): Promise<void> {
  return request<void>(`/api/itineraries/checkin/items/${itemId}/coordinates`, {
    method: 'PUT',
    body: JSON.stringify({ lat, lng }),
  });
}

/** 上传打卡媒体 */
export async function uploadMedia(itemId: number, file: File): Promise<CheckinMedia> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api/itineraries/checkin/items/${itemId}/media`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const body = (await res.json()) as ApiResponse<CheckinMedia>;
  if (!body.success) throw new Error(body.message || '上传失败');
  return body.data as CheckinMedia;
}

// ========== 轨迹 API ==========

/** 待上传轨迹点；clientPointId 用于跨批次、跨重试识别同一个客户端采样点。 */
export interface TrackPointUpload {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  recordedAt: string;
  clientPointId?: string;
}

/** 批量上传轨迹点 */
export async function uploadTrackPoints(
  planId: string,
  points: TrackPointUpload[],
): Promise<number> {
  return request<number>(`/api/trips/${planId}/track/points`, {
    method: 'POST',
    body: JSON.stringify({ points }),
  });
}

/** 查询轨迹点列表 */
export async function getTrackPoints(planId: string): Promise<TrackPoint[]> {
  return request<TrackPoint[]>(`/api/trips/${planId}/track/points`);
}

// ========== 旅程评价 API ==========

/** 提交旅程评价 */
export async function submitReview(
  planId: string,
  data: { rating: number; comment?: string },
): Promise<number> {
  return request<number>(`/api/trips/${planId}/review`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 更新 AI 总结 */
export async function updateSummary(planId: string, summary: string): Promise<void> {
  return request<void>(`/api/trips/${planId}/review/summary`, {
    method: 'PUT',
    body: JSON.stringify({ summary }),
  });
}

/** 查询评价详情 */
export async function getReview(planId: string): Promise<JourneyReview> {
  return request<JourneyReview>(`/api/trips/${planId}/review`);
}
