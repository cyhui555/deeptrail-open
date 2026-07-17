'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  ClipboardList,
  MapPinned,
  Plus,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { getCheckinTasks, checkin, undoCheckin, abandonCheckin, updateItemCoordinates, getTrackPoints, backfillCoordinates, forceRefillCoordinates } from '@/lib/api';
import { createIdempotencyKey, saveOfflineCheckin } from '@/lib/offlineSync';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { CheckinItemCard } from '@/components/CheckinItemCard';
import { MediaUploadModal } from '@/components/MediaUploadModal';
import { AddCustomItemModal } from '@/components/AddCustomItemModal';
import { EditCustomItemModal } from '@/components/EditCustomItemModal';
import { CheckinMap, CheckinMapHandle } from '@/components/CheckinMap';
import { CoordinateCorrectModal } from '@/components/CoordinateCorrectModal';
import { getPeriodStyle } from '@/components/ItineraryTimeline';
import { TripsSubNav } from '@/components/TripsSubNav';
import { useAppFeedback } from '@/components/FeedbackProvider';
import { getValidItemCoordinate } from '@/lib/coordinates';
import type { CheckinTask, CheckinItem, TrackPoint } from '@/types';

type MarkerDragEndHandler = (itemId: number, lat: number, lng: number) => void;
type MarkerClickHandler = (itemId: number) => void;
type CoordinateBackfillStatus = 'idle' | 'pending' | 'success' | 'error';

/** 5 种天标题渐变色带。 */
const dayHeaderGradients = [
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
];

/** 统计某状态打卡项数量。 */
function countByStatus(items: CheckinItem[], status: CheckinItem['status']): number {
  return items.filter((i) => i.status === status).length;
}

/** 打卡页面：展示按天分组的打卡任务列表，支持 GPS/手动打卡 + 废弃 + 媒体上传。 */
export default function CheckinPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = params.planId as string;
  const { confirmAction, notify } = useAppFeedback();
  const [tasks, setTasks] = useState<CheckinTask[]>([]);
  const [loading, setLoading] = useState(true);
  // 添加行程点弹窗
  const [showAddModal, setShowAddModal] = useState(false);
  // 编辑自定义行程点弹窗
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CheckinItem | null>(null);
  // 刷新中状态（打卡/废弃/撤销后重新加载数据），与 loading 分离以避免地图 unmount/remount
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialDayFromUrl = searchParams.get('day') ? Number(searchParams.get('day')) : null;
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [checkinLoading, setCheckinLoading] = useState<number | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [mediaModalItem, setMediaModalItem] = useState<CheckinItem | null>(null);
  const mapRef = useRef<CheckinMapHandle>(null);
  const itemNodeRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const tasksRef = useRef<CheckinTask[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [correctModalOpen, setCorrectModalOpen] = useState(false);
  const [correctTarget, setCorrectTarget] = useState<{ itemId: number; lat: number; lng: number } | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const displayTrackPoints = useMemo(() => {
    if (trackPoints.length <= 1_000) return trackPoints;
    const step = Math.ceil(trackPoints.length / 1_000);
    return trackPoints.filter((_, index) => index % step === 0 || index === trackPoints.length - 1);
  }, [trackPoints]);
  const [routeMode, setRouteMode] = useState<'planned' | 'actual' | 'gps' | 'all'>('planned');
  const { lat, lng, accuracy, loading: geoLoading } = useGeolocation({ enableHighAccuracy: true });
  const { isOnline, syncing, lastSyncResult } = useOfflineSync();
  const [viewMode, setViewMode] = useState<'day' | 'global'>('day');
  // 强制刷新坐标中状态
  const [refreshingCoords, setRefreshingCoords] = useState(false);
  const [coordinateBackfillStatus, setCoordinateBackfillStatus] = useState<CoordinateBackfillStatus>('idle');
  const [coordinateBackfillMessage, setCoordinateBackfillMessage] = useState<string | null>(null);
  tasksRef.current = tasks;

  // 标记"首次加载是否已通过 URL ?day= 参数定位到指定天"。
  // 关键：仅首次加载应用 URL 参数；后续所有刷新（打卡/撤销/废弃/坐标修改/媒体上传）保持用户当前选择。
  const hasAppliedInitialDayRef = useRef(false);
  const hasStartedCoordinateBackfillRef = useRef(false);

  /**
   * 回填坐标后立即刷新任务，地图、PDF 与列表联动共用同一份坐标结果。
   * 地理编码允许失败降级，因此失败必须成为可见、可重试状态，不能静默吞掉。
   */
  const refreshCoordinates = useCallback(async (forceRefill: boolean): Promise<number> => {
    setCoordinateBackfillStatus('pending');
    setCoordinateBackfillMessage('正在补全地点坐标，地图会自动更新…');
    try {
      const resolved = forceRefill
        ? await forceRefillCoordinates(planId)
        : await backfillCoordinates(planId);
      const refreshed = await getCheckinTasks(planId);
      setTasks(refreshed);

      const unresolvedCount = refreshed
        .flatMap((task) => task.items)
        .filter((item) => item.status !== 'ABANDONED' && !getValidItemCoordinate(item))
        .length;
      if (unresolvedCount > 0) {
        setCoordinateBackfillStatus('error');
        setCoordinateBackfillMessage(`仍有 ${unresolvedCount} 个地点缺少坐标，可重试或手动校准。`);
      } else {
        setCoordinateBackfillStatus('success');
        setCoordinateBackfillMessage(resolved > 0 ? `已补全 ${resolved} 个地点坐标。` : null);
      }
      return resolved;
    } catch (coordinateError) {
      const message = coordinateError instanceof Error ? coordinateError.message : '地点坐标补全失败';
      setCoordinateBackfillStatus('error');
      setCoordinateBackfillMessage(`${message}，可稍后重试。`);
      throw coordinateError;
    }
  }, [planId]);

  const loadTasks = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await getCheckinTasks(planId);
      setTasks(data);
      const needsCoordinateBackfill = data
        .flatMap((task) => task.items)
        .some((item) => item.status !== 'ABANDONED' && !getValidItemCoordinate(item));
      if (!isRefresh && needsCoordinateBackfill && !hasStartedCoordinateBackfillRef.current) {
        hasStartedCoordinateBackfillRef.current = true;
        // 坐标回填可能访问第三方服务，必须在首屏任务展示后后台执行。
        void refreshCoordinates(false).catch(() => {
          // refreshCoordinates 已写入可见错误状态；此处只终止未等待的 Promise 链。
        });
      }
      // 仅在"首次加载"应用 URL day 参数；isRefresh 场景保持用户当前 activeDayIdx 不变
      if (!isRefresh && !hasAppliedInitialDayRef.current && initialDayFromUrl != null) {
        const idx = data.findIndex((t) => t.dayNumber === initialDayFromUrl);
        if (idx >= 0) {
          setActiveDayIdx(idx);
        }
        hasAppliedInitialDayRef.current = true;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [planId, initialDayFromUrl, refreshCoordinates]);

  useEffect(() => {
    if (!planId) return;
    loadTasks();
  }, [planId, loadTasks]);

  useEffect(() => {
    if (!planId) return;
    getTrackPoints(planId).then(setTrackPoints).catch(() => {});
  }, [planId]);

  useEffect(() => {
    if (selectedItemId == null) return;
    const frame = window.requestAnimationFrame(() => {
      itemNodeRefs.current.get(selectedItemId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeDayIdx, selectedItemId]);

  const currentTask = tasks[activeDayIdx] || tasks[0];
  const currentDayIdx = tasks.findIndex((t) => t.id === currentTask?.id);
  const gradient = dayHeaderGradients[((currentDayIdx >= 0 ? currentDayIdx : 0) % dayHeaderGradients.length)];

  // 按展示模式计算地图 markers：本天=当天 items（按 display 排序），全局=全部 items（按 dayNumber + 原顺序）
  const mapItems = useMemo(() => {
    if (viewMode === 'global') {
      // 全局模式：展开所有天，避免 id 重复则以后端顺序；ABANDONED 同样排除（在 CheckinMap 内部）
      const all: CheckinItem[] = [];
      // 按天排序保证路线顺序
      const sortedTasks = [...tasks].sort((a, b) => a.dayNumber - b.dayNumber);
      sortedTasks.forEach((t) => all.push(...t.items));
      return all;
    }
    return currentTask ? currentTask.items : [];
  }, [viewMode, tasks, currentTask]);
  const visibleMapItemCount = useMemo(
    () => mapItems.filter((item) => item.status !== 'ABANDONED' && getValidItemCoordinate(item)).length,
    [mapItems],
  );
  const expectedMapItemCount = useMemo(
    () => mapItems.filter((item) => item.status !== 'ABANDONED').length,
    [mapItems],
  );

  /** 全局模式下，根据 item 所属任务的天序号返回对应色带颜色，用于路线着色。 */
  const segmentColorByDay = useMemo(() => {
    // 预构建 dayNumber → 渐变颜色表（与页面头部色带渐变保持一致）
    const palette = ['#2b6595', '#4c7d9b', '#5b7f73', '#527194', '#356b86'];
    return (item: CheckinItem): string => {
      const t = tasks.find((tk) => tk.items.some((i) => i.id === item.id));
      if (!t) return '#2b6595';
      const idx = tasks.findIndex((tk) => tk.id === t.id);
      return palette[idx % palette.length];
    };
  }, [tasks]);

  // 当前天打卡项统计（排除 ABANDONED）
  const effectiveTotal = currentTask
    ? currentTask.items.filter((i) => i.status !== 'ABANDONED').length
    : 0;
  const completedCount = currentTask
    ? countByStatus(currentTask.items, 'CHECKED_IN')
    : 0;
  const effectiveProgress = effectiveTotal > 0 ? (completedCount / effectiveTotal) * 100 : 0;

  // 时段分布统计
  const periodDistribution = useMemo(() => {
    if (!currentTask) return [];
    const counts: Record<string, number> = {};
    for (const item of currentTask.items) {
      if (item.status === 'ABANDONED') continue;
      if (item.period) {
        counts[item.period] = (counts[item.period] ?? 0) + 1;
      }
    }
    return Object.entries(counts).map(([period, count]) => ({ period, count, style: getPeriodStyle(period) }));
  }, [currentTask]);

  const handleCheckin = async (item: CheckinItem, source: 'GPS' | 'MANUAL') => {
    setCheckinLoading(item.id);
    setOfflineNotice(null);
    // 在线响应丢失后会进入离线队列，两个阶段必须复用同一标识才能安全重放。
    const idempotencyKey = createIdempotencyKey();
    try {
      await checkin(item.id, {
        lat: source === 'GPS' ? lat ?? undefined : undefined,
        lng: source === 'GPS' ? lng ?? undefined : undefined,
        source,
        accuracy: source === 'GPS' ? accuracy ?? undefined : undefined,
        idempotencyKey,
      });
      await loadTasks(true);
    } catch (e) {
      // 网络异常时暂存到 IndexedDB
      if (!navigator.onLine || (e instanceof TypeError && e.message.includes('fetch'))) {
        try {
          await saveOfflineCheckin({
            itemId: item.id,
            lat: source === 'GPS' ? lat ?? undefined : undefined,
            lng: source === 'GPS' ? lng ?? undefined : undefined,
            accuracy: source === 'GPS' ? accuracy ?? undefined : undefined,
            source,
            recordedAt: new Date().toISOString(),
            idempotencyKey,
          });
          setOfflineNotice('网络不可用，打卡已本地保存，恢复后自动同步');
          // 乐观更新 UI 状态
          setTasks((prev) =>
            prev.map((t) => ({
              ...t,
              completedPoi: t.items.some((i) => i.id === item.id)
                ? t.completedPoi + 1
                : t.completedPoi,
              items: t.items.map((i) =>
                i.id === item.id ? { ...i, status: 'CHECKED_IN' as const } : i,
              ),
            })),
          );
        } catch {
          notify('打卡失败：' + (e instanceof Error ? e.message : '未知错误'), 'error');
        }
      } else {
        notify(e instanceof Error ? e.message : '打卡失败', 'error');
      }
    } finally {
      setCheckinLoading(null);
    }
  };

  const handleUndo = async (item: CheckinItem) => {
    setCheckinLoading(item.id);
    setOfflineNotice(null);
    try {
      await undoCheckin(item.id);
      await loadTasks(true);
    } catch (e) {
      notify(e instanceof Error ? e.message : '撤销失败', 'error');
    } finally {
      setCheckinLoading(null);
    }
  };

  const handleAbandonClick = async (item: CheckinItem) => {
    const accepted = await confirmAction({
      title: '放弃这个地点？',
      description: `「${item.poiName}」将退出本次旅行的待执行列表。`,
      confirmLabel: '确认放弃',
      danger: true,
    });
    if (!accepted) return;
    setCheckinLoading(item.id);
    try {
      await abandonCheckin(item.id);
      await loadTasks(true);
    } catch (e) {
      notify(e instanceof Error ? e.message : '放弃失败', 'error');
    } finally {
      setCheckinLoading(null);
    }
  };

  // 编辑自定义行程点
  const openEditForm = useCallback((item: CheckinItem) => {
    setEditingItem(item);
    setShowEditModal(true);
  }, []);

  const closeEditForm = useCallback(() => {
    setShowEditModal(false);
    setEditingItem(null);
  }, []);

  // 强制刷新坐标：清空所有坐标后重新地理编码反查，清洗同名跨城脏坐标
  const handleRefreshCoords = async () => {
    const accepted = await confirmAction({
      title: '重新校准全部坐标？',
      description: '系统会清除当前坐标并重新查询，过程中地图标记可能短暂变化。',
      confirmLabel: '开始校准',
      danger: true,
    });
    if (!accepted) return;
    setRefreshingCoords(true);
    setOfflineNotice(null);
    try {
      const resolved = await refreshCoordinates(true);
      setOfflineNotice(`坐标刷新完成，已修正 ${resolved} 个打卡点`);
    } catch (e) {
      notify(e instanceof Error ? e.message : '刷新坐标失败', 'error');
    } finally {
      setRefreshingCoords(false);
    }
  };

  // 地图标记拖动结束回调（useCallback 避免每次渲染产生新引用触发地图重绘）
  const handleMarkerDragEnd = useCallback<MarkerDragEndHandler>((itemId, lat, lng) => {
    setCorrectTarget({ itemId, lat, lng });
    setCorrectModalOpen(true);
  }, []);

  // 地图标记与列表共享选择状态；全局地图选中其他天时先切天，再定位到对应卡片。
  const handleMarkerClick = useCallback<MarkerClickHandler>((itemId) => {
    const taskIndex = tasksRef.current.findIndex((task) => task.items.some((item) => item.id === itemId));
    if (taskIndex >= 0) setActiveDayIdx(taskIndex);
    setSelectedItemId(itemId);
    mapRef.current?.showInfoWindow(itemId);
  }, []);

  const handleListItemSelect = useCallback((item: CheckinItem) => {
    setSelectedItemId(item.id);
    const coordinate = getValidItemCoordinate(item);
    if (coordinate) {
      mapRef.current?.setCenter(coordinate.lat, coordinate.lng);
      mapRef.current?.showInfoWindow(item.id);
    }
  }, []);

  const handleRetryCoordinateBackfill = async () => {
    try {
      await refreshCoordinates(false);
    } catch (coordinateError) {
      notify(coordinateError instanceof Error ? coordinateError.message : '地点坐标补全失败', 'error');
    }
  };

  if (loading) return <p className="text-gray-500">加载中...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (tasks.length === 0) return <p className="text-gray-500">暂无打卡任务，请先在清单详情页开始打卡。</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary-700 hover:bg-white/55">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          返回
        </button>
        <Link href={`/trips/${planId}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-gray-600 hover:bg-white/55 hover:text-primary-700">
          <ClipboardList aria-hidden="true" className="h-4 w-4" />
          行程
        </Link>
      </div>

      {/* 子页面导航 */}
      <TripsSubNav planId={planId} active="checkin" />

      {/* 网络状态提示 */}
      {!isOnline && (
        <div role="status" className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
          <WifiOff aria-hidden="true" className="mr-1.5 inline h-4 w-4" />
          当前离线，数据将在网络恢复后自动同步
        </div>
      )}
      {syncing && (
        <div role="status" className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-2 text-sm text-primary-800">
          正在同步离线数据...
        </div>
      )}
      {lastSyncResult && (lastSyncResult.checkins > 0 || lastSyncResult.tracks > 0) && (
        <div role="status" className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
          同步完成：{lastSyncResult.checkins} 条打卡、{lastSyncResult.tracks} 条轨迹已同步
        </div>
      )}
      {offlineNotice && (
        <div role="status" className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
          {offlineNotice}
        </div>
      )}

      {/* 天切换器 */}
      <div role="group" aria-label="选择行程日期" className="flex gap-2 overflow-x-auto pb-2">
        {tasks.map((task, idx) => (
          <button
            key={task.id}
            type="button"
            onClick={() => {
              setActiveDayIdx(idx);
              setSelectedItemId(null);
            }}
            aria-pressed={idx === activeDayIdx}
            aria-current={idx === activeDayIdx ? 'step' : undefined}
            className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-colors ${idx === activeDayIdx ? 'bg-primary-700 text-white' : 'bg-white/65 text-gray-600 hover:bg-white hover:text-primary-700'}`}
          >
            <CalendarDays aria-hidden="true" className="h-4 w-4" />
            第 {task.dayNumber} 天
          </button>
        ))}
      </div>

      {/* 天标题色带头部 */}
      <div className={`rounded-xl bg-gradient-to-r ${gradient} p-4 text-white shadow-sm`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold">第 {currentTask.dayNumber} 天</h2>
            {currentTask.itineraryDate && <span className="text-sm text-white/80">{currentTask.itineraryDate}</span>}
            {currentTask.theme && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-white/25 text-white">{currentTask.theme}</span>}
          </div>
          <div className="text-right">
            <span className="text-sm text-white/90">进度</span>
            <p className="text-xl font-bold">{completedCount}<span className="text-sm text-white/70">/{effectiveTotal}</span></p>
          </div>
        </div>

        {/* 进度条 */}
        <div
          role="progressbar"
          aria-label={`第 ${currentTask.dayNumber} 天打卡进度`}
          aria-valuemin={0}
          aria-valuemax={effectiveTotal}
          aria-valuenow={completedCount}
          aria-valuetext={`已完成 ${completedCount} 项，共 ${effectiveTotal} 项`}
          className="mt-2 h-1.5 rounded-full bg-white/20"
        >
          <div className="h-1.5 rounded-full bg-white transition-all" style={{ width: `${effectiveProgress}%` }} />
        </div>

        {/* 时段分布色卡 */}
        {periodDistribution.length > 0 && (
          <div className="mt-3 flex gap-2 flex-wrap">
            {periodDistribution.map(({ period, count }) => (
              <span key={period} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-white/20 text-white`}>
                <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                {period} {count}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 每日地图始终保留；坐标缺失是可恢复空态，不能把整块地图和修复入口卸载。 */}
      <div className="space-y-2" data-testid="daily-route-map">
          {/* 本天 / 全局行程 切换 */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div role="group" aria-label="地图范围" className="grid grid-cols-2 rounded-xl bg-gray-100 p-0.5">
              {(['day', 'global'] as const).map((m) => (
                <button key={m} onClick={() => setViewMode(m)}
                  type="button"
                  aria-pressed={viewMode === m}
                  className={`min-h-11 px-3 text-xs font-medium rounded-lg transition-colors ${viewMode === m ? 'bg-white text-primary-800 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
                  {m === 'day' ? '本天' : '全局行程'}
                </button>
              ))}
            </div>
            {/* 路线切换控件 */}
            <div role="group" aria-label="路线显示" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:pb-0">
              {(['planned', 'actual', 'gps', 'all'] as const).map((mode) => (
                <button key={mode} onClick={() => setRouteMode(mode)}
                  type="button"
                  aria-pressed={routeMode === mode}
                  className={`min-h-11 shrink-0 px-3 text-xs rounded-lg font-medium transition-colors ${routeMode === mode ? 'bg-primary-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {mode === 'planned' ? '计划路线' : mode === 'actual' ? '实际路线' : mode === 'gps' ? 'GPS轨迹' : '全部显示'}
                </button>
              ))}
            </div>
            {/* 坐标刷新：清洗同名跨城脏坐标 */}
            <button
              type="button"
              onClick={handleRefreshCoords}
              disabled={refreshingCoords || coordinateBackfillStatus === 'pending'}
              title="清空所有坐标后重新地理编码反查，用于清洗定位到错误城市的脏数据（如青岛的大学路出现重庆坐标）"
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 text-xs font-semibold text-primary-800 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto"
            >
              <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${refreshingCoords ? 'animate-spin' : ''}`} />
              {refreshingCoords ? '刷新中...' : '校准坐标'}
            </button>
          </div>
          {visibleMapItemCount === 0 && (
            <div role="status" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2">
                <MapPinned aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                {coordinateBackfillMessage ?? '本日地点坐标尚未生成，正在等待补全。'}
              </span>
              <button
                type="button"
                onClick={() => void handleRetryCoordinateBackfill()}
                disabled={coordinateBackfillStatus === 'pending'}
                className="button-secondary shrink-0 gap-1.5 px-3 text-xs"
              >
                <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${coordinateBackfillStatus === 'pending' ? 'animate-spin' : ''}`} />
                {coordinateBackfillStatus === 'pending' ? '补全中…' : '重试补全'}
              </button>
            </div>
          )}
          {visibleMapItemCount > 0 && visibleMapItemCount < expectedMapItemCount && (
            <p role="status" className="text-xs text-amber-700">
              已显示 {visibleMapItemCount}/{expectedMapItemCount} 个地点，其余坐标仍在补全。
            </p>
          )}
          {/* 地图 */}
          <CheckinMap
            ref={mapRef}
            items={mapItems}
            trackPoints={displayTrackPoints}
            routeMode={routeMode}
            onMarkerDragEnd={handleMarkerDragEnd}
            onMarkerClick={handleMarkerClick}
            highlightItemId={selectedItemId}
            height={viewMode === 'global' ? '55vh' : '45vh'}
            getSegmentColor={viewMode === 'global' ? (from, to) => segmentColorByDay(from) : undefined}
          />
      </div>

      {/* GPS 状态 */}
      <div role="status" className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
        {geoLoading ? '定位中...' : lat && lng ? `当前位置：${lat.toFixed(6)}, ${lng.toFixed(6)}（精度 ${accuracy?.toFixed(0) ?? '?'}米）` : '无法获取位置，可使用手动打卡'}
      </div>

      {/* 打卡项列表（带垂直时间线） */}
      <div className="relative pl-10">
        {/* 时间线竖线 */}
        <div className="absolute bottom-2 left-3 top-2 w-0.5 rounded-full bg-gradient-to-b from-primary-200 via-primary-100 to-primary-200" />
        <div className="space-y-3">
        {currentTask.items.map((item) => {
          const isCheckedIn = item.status === 'CHECKED_IN';
          const isAbandoned = item.status === 'ABANDONED';
          return (
            <div
              key={item.id}
              ref={(node) => {
                if (node) itemNodeRefs.current.set(item.id, node);
                else itemNodeRefs.current.delete(item.id);
              }}
              role="group"
              tabIndex={0}
              aria-label={`在地图中查看 ${item.poiName}`}
              onClick={() => handleListItemSelect(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleListItemSelect(item);
              }}
              className={`relative cursor-pointer rounded-2xl outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary-500 ${
                selectedItemId === item.id ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-transparent' : ''
              }`}
            >
              {/* 时间线圆点（打卡状态着色） */}
              <div className={`absolute left-[-18px] top-5 w-3.5 h-3.5 rounded-full bg-white border-[3px] shadow-sm ${
                isCheckedIn ? 'border-green-500' : isAbandoned ? 'border-gray-300' : 'border-primary-600'
              }`} />
              <CheckinItemCard
                item={item}
                onCheckin={item.status === 'PENDING' ? () => handleCheckin(item, lat && lng ? 'GPS' : 'MANUAL') : undefined}
                onUndo={item.status === 'CHECKED_IN' ? () => handleUndo(item) : undefined}
                onAbandon={item.status === 'PENDING' ? () => handleAbandonClick(item) : undefined}
                onAddMedia={item.status === 'CHECKED_IN' ? () => setMediaModalItem(item) : undefined}
                onEdit={item.isCustom && item.status === 'PENDING' ? () => openEditForm(item) : undefined}
              />
            </div>
          );
        })}
        </div>
      </div>

      {/* 当天打卡项之后的「添加行程点」入口 */}
      {currentTask && (
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="button-secondary flex-1 gap-2 border-dashed px-3"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            添加地点
          </button>
        </div>
      )}

      {/* 添加行程点弹窗（共享组件） */}
      {showAddModal && currentTask && (
        <AddCustomItemModal
          planId={planId}
          taskId={currentTask.id}
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            loadTasks(true);
          }}
        />
      )}

      {/* 编辑自定义行程点弹窗（共享组件） */}
      {showEditModal && editingItem && (
        <EditCustomItemModal
          item={editingItem}
          open={showEditModal}
          onClose={closeEditForm}
          onSaved={() => {
            closeEditForm();
            loadTasks(true);
          }}
        />
      )}

      {/* 当天行程亮点（放在打卡项列表之后，与行程规划页同款时段卡片样式） */}
      {(currentTask.items.length > 0 || currentTask.mealsJson || currentTask.accommodationJson || currentTask.transportation || currentTask.tip) && (
        <div className="rounded-xl border border-primary-100 bg-gradient-to-r from-primary-50 to-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-cyan-900 mb-3">当天亮点</h3>
          {(() => {
            // 解析餐饮 JSON
            let meals: Array<{ type: string; recommendation: string; estimatedCost?: string }> = [];
            if (currentTask.mealsJson) {
              try { meals = JSON.parse(currentTask.mealsJson); } catch { /* ignore */ }
            }
            // 解析住宿 JSON
            let accommodation: { name: string; address?: string; rating?: string } | null = null;
            if (currentTask.accommodationJson) {
              try { accommodation = JSON.parse(currentTask.accommodationJson); } catch { /* ignore */ }
            }
            return (
              <div className="space-y-2 text-sm">
                {/* 路线摘要只展示有效 POI，并保持后端下发顺序，便于快速理解当天动线。 */}
                {currentTask.items.filter((item) => item.status !== 'ABANDONED').length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0">📍</span>
                    <p className="text-cyan-800 text-sm">
                      {currentTask.items
                        .filter((item) => item.status !== 'ABANDONED')
                        .map((item) => item.poiName)
                        .join(' → ')}
                    </p>
                  </div>
                )}
                {/* 天级信息：餐饮 / 住宿 / 交通 / 小贴士 */}
                {(meals.length > 0 || (accommodation && accommodation.name) || currentTask.transportation || currentTask.tip) && (
                  <div className="pt-3 mt-1 border-t border-cyan-200 space-y-2">
                    {/* 餐饮 */}
                    {meals.length > 0 && (
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0">🍽️</span>
                        <p className="text-cyan-800 text-sm">
                          {meals.map((m, mi) => (
                            <span key={mi} className="mr-2">
                              <span className="font-medium text-cyan-900">{m.type}</span>
                              <span className="text-cyan-700"> {m.recommendation}</span>
                              {m.estimatedCost && <span className="text-cyan-500">（{m.estimatedCost}）</span>}
                            </span>
                          ))}
                        </p>
                      </div>
                    )}
                    {/* 住宿 */}
                    {accommodation && accommodation.name && (
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0">🏨</span>
                        <p className="text-cyan-800 text-sm">
                          <span className="font-medium text-cyan-900">住宿</span>
                          <span className="text-cyan-700"> {accommodation.name}</span>
                          {accommodation.address && <span className="text-cyan-500"> · {accommodation.address}</span>}
                          {accommodation.rating && (
                            <span className="ml-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">★ {accommodation.rating}</span>
                          )}
                        </p>
                      </div>
                    )}
                    {/* 交通 */}
                    {currentTask.transportation && (
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0">🚗</span>
                        <p className="text-cyan-800 text-sm">{currentTask.transportation}</p>
                      </div>
                    )}
                    {/* 小贴士 */}
                    {currentTask.tip && (
                      <div className="flex items-start gap-1.5 bg-amber-50 rounded-lg px-3 py-2">
                        <span className="shrink-0">💡</span>
                        <p className="text-xs text-amber-700 leading-relaxed">{currentTask.tip}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* 媒体上传弹窗 */}
      {mediaModalItem && (
        <MediaUploadModal
          itemId={mediaModalItem.id}
          existingMedia={mediaModalItem.media ?? []}
          onClose={() => setMediaModalItem(null)}
          onUploaded={() => loadTasks(true)}
        />
      )}

      {/* 坐标修正确认弹窗 */}
      <CoordinateCorrectModal
        open={correctModalOpen}
        lat={correctTarget?.lat ?? 0}
        lng={correctTarget?.lng ?? 0}
        onConfirm={async () => {
          if (!correctTarget) return;
          try {
            await updateItemCoordinates(correctTarget.itemId, correctTarget.lat, correctTarget.lng);
            setCorrectModalOpen(false);
            setCorrectTarget(null);
            await loadTasks(true);
          } catch (e) {
            notify(e instanceof Error ? e.message : '修改失败', 'error');
          }
        }}
        onCancel={() => {
          setCorrectModalOpen(false);
          setCorrectTarget(null);
          loadTasks(true); // 刷新恢复原位置
        }}
      />

      {checkinLoading !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="rounded-lg bg-white px-6 py-4 shadow-lg">处理中...</div>
        </div>
      )}
    </div>
  );
}
