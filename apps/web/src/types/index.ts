/** Task status enum */
export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** Task type enum */
export enum TaskType {
  GENERATE = 'GENERATE',
  OPTIMIZE = 'OPTIMIZE',
  XIAOHONGSHU = 'XIAOHONGSHU',
}

// ========== Auth types ==========

export type UserRole = 'ADMIN' | 'USER';

export interface AuthResponse {
  token: string;
  userId: number;
  username: string;
  role: UserRole;
}

export interface UserInfo {
  userId: number;
  username: string;
  role: UserRole;
  enabled: boolean;
  phone?: string;
  wechatBound: boolean;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AdminUser {
  userId: number;
  username: string;
  role: UserRole;
  enabled: boolean;
  createdByUserId?: number;
  createdAt: string;
}

// ========== Itinerary response types ==========

export interface PoiInfo {
  name: string;
  category?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  estimatedVisitTime?: string;
  openingHours?: string;
  admissionFee?: string;
  phone?: string;
  rating?: string;
  estimatedCost?: string;
  period?: string;
}

/** 交通方式枚举（与后端 TransportMode 一致） */
export type TransportMode = 'WALK' | 'DRIVE' | 'BUS' | 'SUBWAY' | 'TRAIN' | 'FLIGHT';

/** 打卡状态 */
export interface PoiCheckinState {
  /** 格式：`${day}-${poiName}` */
  key: string;
  poiName: string;
  status: 'PENDING' | 'CHECKED_IN';
  source?: 'GPS' | 'MANUAL';
  checkedInAt?: string;
  itemId?: number;
}

export interface ScheduleItem {
  period: string;
  description: string;
  poi?: PoiInfo;
  estimatedDuration?: string;
  estimatedCost?: string;
}

export interface MealItem {
  type: string;
  recommendation: string;
  poi?: PoiInfo;
  estimatedCost?: string;
}

export interface DayPlan {
  day: number;
  date?: string;
  theme?: string;
  schedule?: ScheduleItem[];
  meals?: MealItem[];
  accommodation?: PoiInfo;
  transportation?: string;
  tip?: string;
}

export interface ItineraryResponse {
  summary: string;
  days?: DayPlan[];
  tips?: string[];
  estimatedBudget?: string;
}

// ========== Optimize response types ==========

export interface ChangeItem {
  item: string;
  from?: string;
  to?: string;
  reason?: string;
}

export interface OptimizeResponse {
  /** 优化后的结构化行程（新版 prompt 返回）。 */
  summary?: string;
  days?: DayPlan[];
  tips?: string[];
  estimatedBudget?: string;
  /** 兼容旧版纯文本格式。 */
  optimizedItinerary?: string;
  changes?: ChangeItem[];
  reasoning?: string;
}

// ========== Task response types (discriminated union) ==========

interface TaskStatusResponseBase {
  taskId: string;
  status: TaskStatus;
  submittedAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  summary?: string;
  parsedContent?: string;
  tokenUsed?: number;
  durationMs?: number;
  /** 请求体 JSON，用于前端提取目的地、天数等信息。 */
  requestJson?: string;
}

export interface TaskGenerateResponse extends TaskStatusResponseBase {
  type: TaskType.GENERATE | TaskType.XIAOHONGSHU;
  result?: ItineraryResponse;
}

export interface TaskOptimizeResponse extends TaskStatusResponseBase {
  type: TaskType.OPTIMIZE;
  result?: OptimizeResponse;
}

export type TaskDetail = TaskGenerateResponse | TaskOptimizeResponse;

export interface TaskSummary {
  taskId: string;
  type: TaskType;
  status: TaskStatus;
  submittedAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  summary?: string;
}

export interface PageResult<T> {
  records: T[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

/** 不包含密钥或 Provider 地址的 AI 服务就绪状态。 */
export interface AiProviderStatus {
  available: boolean;
  message: string;
}

// ========== Unified response wrapper ==========

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errorCode?: string | null;
}

// ========== Type guards ==========

export function isOptimizeTask(t: TaskDetail): t is TaskOptimizeResponse {
  return t.type === TaskType.OPTIMIZE;
}

export function isGenerateTask(t: TaskDetail): t is TaskGenerateResponse {
  return t.type === TaskType.GENERATE || t.type === TaskType.XIAOHONGSHU;
}

// ========== Request types ==========

export interface GenerateRequest {
  departureLocation: string;
  departureTime: string;
  destination: string;
  days: number;
  peopleCount: number;
  budget?: string;
  preferences?: string[];
  specialRequirements?: string;
}

export interface OptimizeRequest {
  currentItinerary: string;
  optimizationGoal: string;
  constraints?: string;
}

export interface XiaohongshuRequest {
  url?: string;
  noteContent?: string;
  days?: number;
  peopleCount?: number;
  preferences?: string[];
  specialRequirements?: string;
}

// ========== 行程清单类型 ==========

/** 行程清单状态 */
export type PlanStatus = 'PLANNED' | 'ONGOING' | 'COMPLETED';

/** 打卡项状态（ABANDONED = 废弃不执行）。 */
export type CheckinItemStatus = 'PENDING' | 'CHECKED_IN' | 'ABANDONED';

/** 打卡任务状态 */
export type CheckinTaskStatus = 'ACTIVE' | 'COMPLETED';

/** AI 总结状态 */
export type AiSummaryStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'MANUAL';

/** 行程清单（列表项） */
export interface TripPlanSummary {
  id: string;
  title: string;
  destination?: string;
  coverImage?: string;
  plannedDate?: string;
  /** AI 生成的日程日期范围，如 "2026-07-10 ~ 2026-07-12"，nullable。 */
  tripDates?: string;
  status: PlanStatus;
  checkinProgress: string;
  totalPoi: number;
  completedPoi: number;
  /** 行程概述（来自 AI 生成的 summary）。 */
  summary?: string;
}

/** 任务版本信息 */
export interface TaskVersion {
  refId: number;
  taskId: string;
  taskType?: string;
  isActive: boolean;
  summary?: string;
  addedAt: string;
}

/** 行程清单详情 */
export interface TripPlanDetail {
  id: string;
  title: string;
  destination?: string;
  coverImage?: string;
  plannedDate?: string;
  status: PlanStatus;
  activeTaskId?: string;
  note?: string;
  taskVersions: TaskVersion[];
  checkinProgress: string;
  createdAt: string;
}

/** 打卡媒体 */
export interface CheckinMedia {
  id: number;
  mediaType: 'IMAGE' | 'VIDEO';
  url: string;
  thumbnailUrl?: string;
}

/** 打卡项 */
export interface CheckinItem {
  id: number;
  poiName: string;
  poiAddress?: string;
  poiLat?: number;
  poiLng?: number;
  checkinLat?: number;
  checkinLng?: number;
  distanceMeters?: number;
  source: 'GPS' | 'MANUAL';
  note?: string;
  status: CheckinItemStatus;
  checkedInAt?: string;
  media: CheckinMedia[];
  /** 时段（早上/上午/中午/下午/晚上/深夜）。 */
  period?: string;
  /** 时段描述文本。 */
  description?: string;
  /** 预计游玩时长。 */
  estimatedVisitTime?: string;
  /** 开放时间。 */
  openingHours?: string;
  /** 门票。 */
  admissionFee?: string;
  /** 预计花费。 */
  estimatedCost?: string;
  /** POI 评分。 */
  rating?: string;
  /** POI 分类（如景点/餐厅/酒店）。 */
  category?: string;
  /** POI 联系电话。 */
  phone?: string;
  /** 是否为用户自加行程点。 */
  isCustom?: boolean;
  /** 展示用纬度（用户修正优先，NULL 则用 poiLat）。 */
  displayLat?: number;
  /** 展示用经度（用户修正优先，NULL 则用 poiLng）。 */
  displayLng?: number;
  /** 是否经过用户坐标修正。 */
  isCoordinateCorrected?: boolean;
  /**
   * 当前 POI → 下一 POI 的交通段 JSON 字符串（v0.7.0 新增）。
   * 格式: `{"mode":"WALK","durationMin":10,"description":"步行约10分钟"}`，最后一个 POI 为 null。
   */
  transportToNext?: string | null;
}

/** 添加自定义行程点请求。 */
export interface AddCustomItemRequest {
  name: string;
  period?: string;
  description?: string;
  estimatedCost?: string;
  address?: string;
  /** 纬度（WGS84）。不填则不在地图上显示。 */
  lat?: number;
  /** 经度（WGS84）。不填则不在地图上显示。 */
  lng?: number;
}

/** 打卡任务（按天） */
export interface CheckinTask {
  id: string;
  dayNumber: number;
  itineraryDate?: string;
  status: CheckinTaskStatus;
  totalPoi: number;
  completedPoi: number;
  items: CheckinItem[];
  /** 天级餐饮列表（JSON 字符串，v0.5.0 新增）。 */
  mealsJson?: string;
  /** 天级住宿信息（JSON 字符串，v0.5.0 新增）。 */
  accommodationJson?: string;
  /** 天级交通描述（v0.5.0 新增）。 */
  transportation?: string;
  /** 天级小贴士（v0.5.0 新增）。 */
  tip?: string;
  /** 天级主题（v0.8.0 新增）。 */
  theme?: string;
}

/** 轨迹点 */
export interface TrackPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  recordedAt: string;
}

/** 旅程评价 */
export interface JourneyReview {
  id: number;
  planId: string;
  planTitle?: string;
  destination?: string;
  days?: number;
  rating: number;
  userComment?: string;
  aiSummary?: string;
  summaryEdited?: boolean;
  poiCoverage?: string;
  totalDistanceMeters?: number;
  photos: CheckinMedia[];
  createdAt: string;
}

/** 媒体项（用于组件） */
export interface MediaItem {
  id: number;
  mediaType: 'IMAGE' | 'VIDEO';
  url: string;
  thumbnailUrl?: string;
}

/** 附近 POI 检测事件 */
export interface ProximityEvent {
  poiName: string;
  distance: number;
  radius: number;
  isInside: boolean;
}

// ========== 节点修正类型 ==========

/** 节点修正（持久化到 itinerary_node_revision 表）。 */
export interface NodeRevision {
  id: number;
  dayIndex: number;
  itemIndex: number;
  correctedLat?: number | null;
  correctedLng?: number | null;
  transportMode?: TransportMode | null;
  transportDuration?: number | null;
  transportDesc?: string | null;
  originalJson: string;
  /** 派生字段：transportMode/duration/desc 任一非空即为 true。 */
  transportCorrected: boolean;
  updatedAt: string;
}

/** 保存节点修正请求。 */
export interface SaveNodeRevisionRequest {
  dayIndex: number;
  itemIndex: number;
  correctedLat?: number | null;
  correctedLng?: number | null;
  transportMode?: TransportMode | null;
  transportDuration?: number | null;
  transportDesc?: string | null;
}
