'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getCheckinTasks, getTrackPoints, backfillCoordinates, forceRefillCoordinates, getTripPlan } from '@/lib/api';
import { CheckinMap, CheckinMapHandle } from '@/components/CheckinMap';
import { TripsSubNav } from '@/components/TripsSubNav';
import { PdfExportButton } from '@/components/PdfExportButton';
import { PoiInfoCard } from '@/components/PoiInfoCard';
import { getValidItemCoordinate } from '@/lib/coordinates';
import type { CheckinTask, CheckinItem, TrackPoint, TripPlanDetail } from '@/types';
import { getPeriodStyle } from '@/components/ItineraryTimeline';

/** 5 种天标题渐变色带（与清单页 / ItineraryTimeline 统一）。 */
const dayHeaderGradients = [
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
];

const routeModeLabels: Record<'planned' | 'actual' | 'gps' | 'all', string> = {
  planned: '计划路线',
  actual: '实际路线',
  gps: 'GPS 轨迹',
  all: '全部显示',
};

/** 全部行程页：全局地图 + 只读时间线，并提供按天进入打卡的明确入口。 */
export default function OverviewPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.planId as string;
  const [tasks, setTasks] = useState<CheckinTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const displayTrackPoints = useMemo(() => {
    if (trackPoints.length <= 1_000) return trackPoints;
    const step = Math.ceil(trackPoints.length / 1_000);
    return trackPoints.filter((_, index) => index % step === 0 || index === trackPoints.length - 1);
  }, [trackPoints]);
  // “完整路线”默认叠加计划、实际打卡与 GPS，用户仍可按需收敛到单层。
  const [routeMode, setRouteMode] = useState<'planned' | 'actual' | 'gps' | 'all'>('all');
  const [planDetail, setPlanDetail] = useState<TripPlanDetail | null>(null);
  const mapRef = useRef<CheckinMapHandle>(null);
  const itemNodeRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const hasStartedCoordinateBackfillRef = useRef(false);
  const [forceRefilling, setForceRefilling] = useState(false);
  const [forceRefillMsg, setForceRefillMsg] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCheckinTasks(planId);
      // 按天排序
      const sorted = [...data].sort((a, b) => a.dayNumber - b.dayNumber);
      setTasks(sorted);

      // 缺失坐标在首屏展示后后台回填，第三方地理编码不得阻塞页面加载。
      const allItems = sorted.flatMap((t) => t.items);
      const needsCoordinateBackfill = allItems
        .some((item) => item.status !== 'ABANDONED' && !getValidItemCoordinate(item));
      if (needsCoordinateBackfill && !hasStartedCoordinateBackfillRef.current) {
        hasStartedCoordinateBackfillRef.current = true;
        void backfillCoordinates(planId)
          .then((resolved) => resolved > 0 ? getCheckinTasks(planId) : null)
          .then((refreshed) => {
            if (refreshed) {
              setTasks([...refreshed].sort((a, b) => a.dayNumber - b.dayNumber));
            }
          })
          .catch((coordinateError: unknown) => {
            setForceRefillMsg(
              coordinateError instanceof Error ? coordinateError.message : '地点坐标补全失败',
            );
          });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    if (!planId) return;
    loadTasks();
    getTrackPoints(planId).then(setTrackPoints).catch(() => {});
    // 加载行程清单详情（标题/目的地/日期范围），用于 PDF 封面
    getTripPlan(planId).then(setPlanDetail).catch(() => {
      // 非关键路径，加载失败不影响主行程展示与 PDF 兜底标题
    });
  }, [planId, loadTasks]);

  useEffect(() => {
    if (selectedItemId == null) return;
    const frame = window.requestAnimationFrame(() => {
      itemNodeRefs.current.get(selectedItemId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedItemId]);

  const mapItems = useMemo(() => tasks.flatMap((t) => t.items), [tasks]);

  const handleForceRefill = useCallback(async () => {
    setForceRefilling(true);
    setForceRefillMsg(null);
    try {
      const resolved = await forceRefillCoordinates(planId);
      // 重新加载获取最新坐标
      const refreshed = await getCheckinTasks(planId);
      setTasks([...refreshed].sort((a, b) => a.dayNumber - b.dayNumber));
      const refreshedItems = refreshed
        .flatMap((task) => task.items)
        .filter((item) => item.status !== 'ABANDONED');
      const refreshedValidCount = refreshedItems.filter(getValidItemCoordinate).length;
      const missingCount = refreshedItems.length - refreshedValidCount;
      setForceRefillMsg(missingCount === 0
        ? `坐标刷新完成：更新 ${resolved} 个，当前 ${refreshedValidCount}/${refreshedItems.length}`
        : `坐标刷新完成：更新 ${resolved} 个，当前 ${refreshedValidCount}/${refreshedItems.length}，仍有 ${missingCount} 个地点无法自动定位`);
      if (missingCount === 0) {
        setTimeout(() => setForceRefillMsg(null), 3000);
      }
    } catch (e) {
      setForceRefillMsg(e instanceof Error ? e.message : '强制重查失败');
    } finally {
      setForceRefilling(false);
    }
  }, [planId]);

  const validCoordCount = mapItems.filter(
    (item) => item.status !== 'ABANDONED' && getValidItemCoordinate(item),
  ).length;
  const totalPoiCount = mapItems.filter((i) => i.status !== 'ABANDONED').length;

  /** 路线段按所属天着色（与打卡页全局模式一致）。palette 为常量数组。 */
  const segmentColorByDay = useMemo(() => {
    const palette = ['#2b6595', '#4c7d9b', '#5b7f73', '#527194', '#356b86'];
    return (item: CheckinItem): string => {
      const t = tasks.find((tk) => tk.items.some((i) => i.id === item.id));
      if (!t) return '#2b6595';
      const idx = tasks.findIndex((tk) => tk.id === t.id);
      return palette[idx % palette.length];
    };
  }, [tasks]);

  /** 完整路线的 marker 与时间线卡片共享选择状态。 */
  const handleMarkerClick = useCallback((itemId: number) => {
    setSelectedItemId(itemId);
    mapRef.current?.showInfoWindow(itemId);
  }, []);

  const handleListItemSelect = useCallback((item: CheckinItem) => {
    setSelectedItemId(item.id);
    const coordinate = getValidItemCoordinate(item);
    if (!coordinate) return;
    mapRef.current?.setCenter(coordinate.lat, coordinate.lng);
    mapRef.current?.showInfoWindow(item.id);
  }, []);

  if (loading) return <p className="text-gray-500">加载中...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="text-sm text-blue-600">
        ← 返回
      </button>

      {/* 子页面导航 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <TripsSubNav planId={planId} active="overview" />
        <PdfExportButton planId={planId} tasks={tasks} detail={planDetail} />
      </div>

      {tasks.length === 0 ? (
        <p className="text-gray-500 text-center py-12">
          暂无打卡任务，请先在清单页
          <Link href={`/trips/${planId}`} className="text-blue-600 hover:underline mx-1">
            开始打卡
          </Link>
          。
        </p>
      ) : (
        <>
          {/* 全局地图 */}
          <div className="space-y-2" data-testid="complete-route-map">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base font-semibold text-gray-900">全局地图</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  坐标 {validCoordCount}/{totalPoiCount}
                </span>
                <button
                  onClick={handleForceRefill}
                  disabled={forceRefilling}
                  className={`px-2.5 py-1 text-xs rounded transition-colors min-w-[108px] ${
                    forceRefilling
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  } disabled:opacity-50`}
                  title="重新查询全部地点；成功时更新，失败时保留现有坐标"
                >
                  {forceRefilling ? '清洗中…' : '🧹 强制重查坐标'}
                </button>
              </div>
            </div>
            {forceRefillMsg && (
              <div className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 border border-gray-200">
                {forceRefillMsg}
              </div>
            )}
            <CheckinMap
              ref={mapRef}
              items={mapItems}
              trackPoints={displayTrackPoints}
              routeMode={routeMode}
              onMarkerClick={handleMarkerClick}
              highlightItemId={selectedItemId}
              showInfoWindowOnHover
              height="50vh"
              getSegmentColor={(from, _to) => segmentColorByDay(from)}
            />
            {/* 路线切换 */}
            <div className="flex gap-1">
              {(Object.keys(routeModeLabels) as Array<keyof typeof routeModeLabels>).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRouteMode(mode)}
                  aria-pressed={routeMode === mode}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    routeMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {routeModeLabels[mode]}
                </button>
              ))}
            </div>
          </div>

          {/* 全部天时间线 */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">行程时间线</h2>
            {tasks.map((task, idx) => {
              const gradient = dayHeaderGradients[idx % dayHeaderGradients.length];
              const dayProgress = task.items.filter((i) => i.status !== 'ABANDONED');
              const checkedCount = dayProgress.filter((i) => i.status === 'CHECKED_IN').length;

              return (
                <div key={task.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* 天色带头部 */}
                  <div className={`rounded-t-xl bg-gradient-to-r ${gradient} p-4 text-white`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold">第 {task.dayNumber} 天</h3>
                        {task.itineraryDate && <span className="text-sm text-white/80">{task.itineraryDate}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm">
                          {checkedCount}/{dayProgress.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => router.push(`/trips/${planId}/checkin?day=${task.dayNumber}`)}
                          className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30"
                        >
                          进入全天打卡
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* POI 列表 */}
                  <div className="p-4 space-y-3">
                    {task.items.length === 0 ? (
                      <p className="text-gray-500 text-sm">该天无行程点</p>
                    ) : (
                      task.items.map((item) => (
                        <div
                          key={item.id}
                          ref={(node) => {
                            if (node) itemNodeRefs.current.set(item.id, node);
                            else itemNodeRefs.current.delete(item.id);
                          }}
                          role="group"
                          tabIndex={0}
                          aria-label={`在完整路线地图中查看 ${item.poiName}`}
                          onClick={() => handleListItemSelect(item)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') handleListItemSelect(item);
                          }}
                          className={`cursor-pointer rounded-xl outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary-500 ${
                            selectedItemId === item.id ? 'ring-2 ring-primary-500 ring-offset-2' : ''
                          }`}
                        >
                          <PoiInfoCard item={item} />
                        </div>
                      ))
                    )}
                  </div>

                  {/* 天级信息：餐饮 / 住宿 / 交通 / 贴士 */}
                  {(task.mealsJson || task.accommodationJson || task.transportation || task.tip) && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-2">
                      {task.mealsJson &&
                        (() => {
                          try {
                            const meals = JSON.parse(task.mealsJson) as Array<{
                              type: string;
                              recommendation: string;
                              estimatedCost?: string;
                            }>;
                            return meals.length > 0 ? (
                              <div className="space-y-1">
                                {meals.map((meal, mi) => (
                                  <div key={mi} className="flex items-start gap-2 text-xs">
                                    <span className="shrink-0">🍽️</span>
                                    <span>
                                      <span className="font-medium text-gray-700">{meal.type}</span>
                                      <span className="text-gray-500">: {meal.recommendation}</span>
                                      {meal.estimatedCost && (
                                        <span className="text-gray-400 ml-1">（{meal.estimatedCost}）</span>
                                      )}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null;
                          } catch {
                            return null;
                          }
                        })()}
                      {task.accommodationJson &&
                        (() => {
                          try {
                            const acc = JSON.parse(task.accommodationJson) as {
                              name: string;
                              address?: string;
                              rating?: string;
                            };
                            return acc.name ? (
                              <div className="flex items-start gap-2 text-xs">
                                <span className="shrink-0">🏨</span>
                                <span>
                                  <span className="font-medium text-gray-700">住宿</span>
                                  <span className="text-gray-500">: {acc.name}</span>
                                  {acc.address && <span className="text-gray-400"> · {acc.address}</span>}
                                  {acc.rating && (
                                    <span className="ml-1 inline-block rounded bg-amber-50 px-1 py-0.5 text-amber-700">
                                      ★ {acc.rating}
                                    </span>
                                  )}
                                </span>
                              </div>
                            ) : null;
                          } catch {
                            return null;
                          }
                        })()}
                      {task.transportation && (
                        <p className="text-xs text-gray-500 flex items-start gap-1">
                          <span className="shrink-0">🚗</span>
                          <span>{task.transportation}</span>
                        </p>
                      )}
                      {task.tip && (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5 flex items-start gap-1">
                          <span className="shrink-0">💡</span>
                          <span>{task.tip}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* 天级操作：全部行程页为只读展示，不跳转打卡 */}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
