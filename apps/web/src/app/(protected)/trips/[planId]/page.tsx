'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleSlash2,
  Info,
  MapPinCheck,
  Pencil,
  Plus,
  Route,
  Trash2,
} from 'lucide-react';
import { getTripPlan, getCheckinTasks, startCheckin, updateTripPlan, undoCheckin, abandonCheckin, checkin } from '@/lib/api';
import { MediaUploadModal } from '@/components/MediaUploadModal';
import { AddCustomItemModal } from '@/components/AddCustomItemModal';
import { EditCustomItemModal } from '@/components/EditCustomItemModal';
import { TripsSubNav } from '@/components/TripsSubNav';
import { useAppFeedback } from '@/components/FeedbackProvider';
import type { CheckinItem, CheckinTask, TripPlanDetail } from '@/types';
import { getPeriodStyle } from '@/components/ItineraryTimeline';
import { getPoiDisplayFields } from '@/lib/poiDisplay';

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

/** 行程清单详情页面：天卡片可展开/折叠 + 内联打卡/废弃 + 自定义行程点 + 媒体上传。 */
export default function TripPlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.planId as string;
  const { confirmAction, notify } = useAppFeedback();

  const [plan, setPlan] = useState<TripPlanDetail | null>(null);
  const [tasks, setTasks] = useState<CheckinTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [checkinLoading, setCheckinLoading] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);

  // 自定义行程点弹窗（共享组件 AddCustomItemModal 内部管理表单状态）
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFormTargetTaskId, setAddFormTargetTaskId] = useState<string | null>(null);

  // 媒体上传弹窗
  const [mediaModalItem, setMediaModalItem] = useState<CheckinItem | null>(null);

  // 编辑自定义行程点弹窗（共享组件 EditCustomItemModal 内部管理表单状态）
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CheckinItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [planData, tasksData] = await Promise.all([
        getTripPlan(planId),
        getCheckinTasks(planId),
      ]);
      setPlan(planData);
      setTasks(tasksData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    if (!planId) return;
    void loadData();
  }, [loadData, planId]);

  // 某天展开/折叠切换
  const toggleDayExpand = useCallback((dayNumber: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
  }, []);

  // 某天打卡进度
  const getTaskProgress = useCallback((task: CheckinTask) => {
    const effective = task.items.filter((i) => i.status !== 'ABANDONED');
    const completed = effective.filter((i) => i.status === 'CHECKED_IN').length;
    return { completed, total: effective.length, abandoned: task.items.length - effective.length };
  }, []);

  // 打开自定义行程点表单
  const openAddForm = useCallback((taskId: string | null = null) => {
    setAddFormTargetTaskId(taskId);
    setShowAddModal(true);
  }, []);

  // 返回
  const refreshAfterAction = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const handleCheckin = useCallback(async (item: CheckinItem) => {
    setCheckinLoading(item.id);
    setActionError(null);
    try {
      await checkin(item.id, { source: 'MANUAL' });
      await refreshAfterAction();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '打卡失败');
    } finally {
      setCheckinLoading(null);
    }
  }, [refreshAfterAction]);

  const handleAbandonClick = useCallback(async (item: CheckinItem) => {
    const accepted = await confirmAction({
      title: '放弃这个地点？',
      description: `「${item.poiName}」将不再计入本次旅行的执行进度。`,
      confirmLabel: '确认放弃',
      danger: true,
    });
    if (!accepted) return;
    setCheckinLoading(item.id);
    try {
      await abandonCheckin(item.id);
      await refreshAfterAction();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '放弃失败');
    } finally {
      setCheckinLoading(null);
    }
  }, [confirmAction, refreshAfterAction]);

  const handleUndoClick = useCallback(async (item: CheckinItem) => {
    setCheckinLoading(item.id);
    try {
      await undoCheckin(item.id);
      await refreshAfterAction();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '撤销失败');
    } finally {
      setCheckinLoading(null);
    }
  }, [refreshAfterAction]);

  const handleStartCheckin = async () => {
    setStarting(true);
    try {
      // 仅在尚未创建打卡任务时调用 startCheckin，避免重复创建
      if (tasks.length === 0) {
        await startCheckin(planId);
        const createdTasks = await getCheckinTasks(planId);
        setTasks(createdTasks);
        const firstIncomplete = createdTasks.find((task) => task.items.some((item) => item.status === 'PENDING'));
        const targetDay = firstIncomplete?.dayNumber ?? createdTasks[createdTasks.length - 1]?.dayNumber ?? 1;
        router.push(`/trips/${planId}/checkin?day=${targetDay}`);
        return;
      }
      // 定位首个未完成的天；全部完成则跳到最后一天（详见 prd.md 需求 1）
      const firstIncomplete = tasks.find((t) => t.items.some((i) => i.status === 'PENDING'));
      const targetDay = firstIncomplete?.dayNumber ?? tasks[tasks.length - 1]?.dayNumber ?? 1;
      router.push(`/trips/${planId}/checkin?day=${targetDay}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : '开始打卡失败', 'error');
    } finally {
      setStarting(false);
    }
  };

  /** 是否所有打卡任务有效完成（非废弃项均为 CHECKED_IN）。 */
  const allTasksCompleted = tasks.length > 0
    && tasks.every((t) => t.items.filter((i) => i.status !== 'ABANDONED').every((i) => i.status === 'CHECKED_IN'));

  /** 手动完成行程清单。 */
  const handleCompletePlan = async () => {
    const accepted = await confirmAction({
      title: '完成这次旅行？',
      description: '完成后会进入回忆阶段，仍可查看行程、轨迹和照片。',
      confirmLabel: '完成旅行',
    });
    if (!accepted) return;
    setCompleting(true);
    try {
      await updateTripPlan(planId, { status: 'COMPLETED' });
      notify('旅行已完成，可以继续整理回忆。', 'success');
      await loadData();
    } catch (e) {
      notify(e instanceof Error ? e.message : '完成行程失败', 'error');
    } finally {
      setCompleting(false);
    }
  };

  // ==================== 编辑自定义行程点行为 ====================

  const openEditForm = useCallback((item: CheckinItem) => {
    setEditingItem(item);
    setShowEditModal(true);
  }, []);

  const closeEditForm = useCallback(() => {
    setShowEditModal(false);
    setEditingItem(null);
  }, []);

  if (loading) return <p className="text-gray-500">加载中...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!plan) return null;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary-700 hover:bg-white/55 hover:text-primary-900"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        返回
      </button>

      {/* 子页面导航 */}
      <TripsSubNav planId={planId} active="list" />

      {/* 清单头部 */}
      <div className="glass-strong rounded-2xl p-5 sm:p-6">
        <h1 className="text-2xl font-bold text-gray-900">{plan.title}</h1>
        {plan.destination && <p className="mt-1 text-gray-500">目的地：{plan.destination}</p>}
        <div className="mt-3 flex gap-4 text-sm text-gray-500">
          {plan.plannedDate && <span>计划日期：{plan.plannedDate}</span>}
          <span>打卡进度：{plan.checkinProgress}</span>
        </div>
        {plan.note && <p className="mt-3 text-gray-600">{plan.note}</p>}
      </div>

      {/* 空白清单提示：没有关联 AI 任务，不支持自动打卡，引导用户手动添加行程点 */}
      {tasks.length === 0 && !plan.activeTaskId && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-start gap-3">
            <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-900">当前为空白清单，暂无打卡日程</p>
              <p className="mt-1 text-xs text-amber-700">
                可先在首页使用「生成行程」由 AI 生成行程后关联任务，或在清单内逐日添加自定义行程点。
              </p>
              <button
                type="button"
                onClick={() => openAddForm()}
                className="button-primary mt-3 min-h-11 gap-2 px-4"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                添加第一个地点
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-3 flex-wrap">
        {/* 仅有关联任务（有打卡日程 AI 来源）时才显示「开始打卡」按钮 */}
        {plan.activeTaskId && !allTasksCompleted && (
        <button
          type="button"
          onClick={handleStartCheckin}
          disabled={starting}
          className="button-primary gap-2 px-4"
        >
          <MapPinCheck aria-hidden="true" className="h-4 w-4" />
          {starting ? '准备现场...' : '开始现场执行'}
        </button>
        )}
        <button
          type="button"
          onClick={() => router.push(`/trips/${planId}/track`)}
          className="button-secondary gap-2 px-4"
        >
          <Route aria-hidden="true" className="h-4 w-4" />
          轨迹记录
        </button>
        <button
          type="button"
          onClick={() => router.push(`/trips/${planId}/overview`)}
          className="button-secondary gap-2 px-4"
        >
          <BookOpen aria-hidden="true" className="h-4 w-4" />
          完整路线
        </button>
        {allTasksCompleted && plan?.status !== 'COMPLETED' && (
          <button
            type="button"
            onClick={handleCompletePlan}
            disabled={completing}
            className="button-primary gap-2 px-4"
          >
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            {completing ? '提交中...' : '完成旅行'}
          </button>
        )}
      </div>

      {/* 操作错误提示 */}
      {actionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {/* 天打卡日程卡片 */}
      {tasks.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">打卡日程</h2>
          {tasks.map((task, idx) => {
            const gradient = dayHeaderGradients[idx % dayHeaderGradients.length];
            const isExpanded = expandedDays.has(task.dayNumber);
            const progress = getTaskProgress(task);

            return (
              <div key={task.id} className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                {/* 可点击标题区 */}
                <button
                  type="button"
                  onClick={() => toggleDayExpand(task.dayNumber)}
                  className={`w-full text-left transition-colors duration-200 bg-gradient-to-r ${gradient} text-white`}
                >
                  <div className="px-5 py-3.5 flex items-center justify-between gap-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChevronRight
                        aria-hidden="true"
                        className={`w-4 h-4 shrink-0 text-white transition-transform duration-200 ${
                          isExpanded ? 'rotate-90' : 'rotate-0'
                        }`}
                      />
                      <h3 className="font-bold text-base text-white">
                        第 {task.dayNumber} 天
                      </h3>
                      {task.itineraryDate && (
                        <span className="text-sm font-normal text-white/80">
                          {task.itineraryDate}
                        </span>
                      )}
                      {task.theme && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/25 text-white">
                          {task.theme}
                        </span>
                      )}
                      {progress.abandoned > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-white/20 text-white">
                          已弃 {progress.abandoned}
                        </span>
                      )}
                    </div>

                    {/* 进度 */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-white/90">
                        {progress.completed}/{progress.total}
                      </span>
                      {progress.total > 0 && (
                        <div className="w-16 h-1.5 rounded-full bg-white/20">
                          <div
                            className="h-1.5 rounded-full transition-all bg-white"
                            style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                {/* 天级信息区（餐饮/住宿/交通/小贴士，始终显示，仅当数据存在时渲染） */}
                {(task.mealsJson || task.accommodationJson || task.transportation || task.tip) && (
                  <div className="px-5 pb-3 pt-1 space-y-2 border-b border-gray-100 bg-white">
                    {task.mealsJson && (() => {
                      try {
                        const meals = JSON.parse(task.mealsJson) as Array<{ type: string; recommendation: string; estimatedCost?: string }>;
                        return meals.length > 0 ? (
                          <div className="space-y-1">
                            {meals.map((meal, mi) => (
                              <div key={mi} className="flex items-start gap-2 text-xs">
                                <span className="shrink-0">🍽️</span>
                                <span>
                                  <span className="font-medium text-gray-700">{meal.type}</span>
                                  <span className="text-gray-500">: {meal.recommendation}</span>
                                  {meal.estimatedCost && <span className="text-gray-400 ml-1">（{meal.estimatedCost}）</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null;
                      } catch { return null; }
                    })()}
                    {task.accommodationJson && (() => {
                      try {
                        const acc = JSON.parse(task.accommodationJson) as { name: string; address?: string; rating?: string };
                        return acc.name ? (
                          <div className="flex items-start gap-2 text-xs">
                            <span className="shrink-0">🏨</span>
                            <span>
                              <span className="font-medium text-gray-700">住宿</span>
                              <span className="text-gray-500">: {acc.name}</span>
                              {acc.address && <span className="text-gray-400"> · {acc.address}</span>}
                              {acc.rating && <span className="ml-1 inline-block rounded bg-amber-50 px-1 py-0.5 text-amber-700">★ {acc.rating}</span>}
                            </span>
                          </div>
                        ) : null;
                      } catch { return null; }
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

                {/* 展开态：打卡项列表 */}
                {isExpanded && (
                  <div className="p-4 space-y-3">
                    {/* 时段分布 */}
                    {(() => {
                      const periods = new Map<string, number>();
                      for (const item of task.items) {
                        if (item.status === 'ABANDONED' || !item.period) continue;
                        periods.set(item.period, (periods.get(item.period) ?? 0) + 1);
                      }
                      if (periods.size === 0) return null;
                      return (
                        <div className="flex gap-2 flex-wrap mb-2">
                          {Array.from(periods.entries()).map(([period, count]) => {
                            const style = getPeriodStyle(period);
                            return (
                              <span key={period} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.bgColor} ${style.color} ${style.borderColor} border`}>
                                {style.icon} {period} {count}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* 打卡项列表（带垂直时间线） */}
                    <div className="relative pl-10">
                      {/* 时间线竖线 */}
                      <div className="absolute bottom-2 left-3 top-2 w-0.5 rounded-full bg-gradient-to-b from-primary-200 via-primary-100 to-primary-200" />
                      <div className="space-y-4">
                      {task.items.map((item) => {
                        const periodStyle = item.period ? getPeriodStyle(item.period) : null;
                        const isCheckedIn = item.status === 'CHECKED_IN';
                        const isAbandoned = item.status === 'ABANDONED';
                        const isPending = item.status === 'PENDING';
                        const displayFields = getPoiDisplayFields(item);
                        const hasInfo = item.openingHours || item.admissionFee || item.estimatedCost || item.rating
                          || item.estimatedVisitTime || displayFields.addressMeta;

                        return (
                          <div key={item.id} className={`relative ${isAbandoned ? 'opacity-60' : ''}`}>
                            {/* 时间线圆点 */}
                            <div className={`absolute left-[-18px] top-5 w-3.5 h-3.5 rounded-full bg-white border-[3px] shadow-sm ${
                              isCheckedIn ? 'border-green-500' : isAbandoned ? 'border-gray-300' : 'border-blue-500'
                            }`} />
                            {/* 时段卡片：色块背景 + 图标 + 描述 + POI 信息（与规划页 ItineraryTimeline 一致） */}
                            <div className={`flex gap-2 sm:gap-3 p-3 rounded-xl border ${
                              periodStyle
                                ? `${periodStyle.bgColor} ${periodStyle.borderColor}`
                                : 'bg-gray-50 border-gray-100'
                            }`} style={isAbandoned ? { textDecoration: 'line-through' } : undefined}>
                              {/* 时段图标 */}
                              {periodStyle && (
                                <div className="shrink-0 w-14 sm:w-16 flex flex-col items-center justify-center">
                                  <span className="text-lg">{periodStyle.icon}</span>
                                  <span className={`text-xs font-medium ${periodStyle.color} mt-0.5`}>
                                    {item.period}
                                  </span>
                                </div>
                              )}

                              {/* 内容区：描述 + POI 信息标签 */}
                              <div className="flex-1 min-w-0">
                                {displayFields.primaryContent && !isAbandoned && (
                                  <p data-testid="poi-primary-content" className="text-sm text-gray-800 leading-relaxed">
                                    {displayFields.primaryContent}
                                  </p>
                                )}

                                {/* POI 补充信息标签（分类/评分/开门时间/门票/游玩时长/花费/地址/电话） */}
                                {!isAbandoned && (hasInfo || item.category || item.phone) && (
                                  <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-gray-500">
                                    {displayFields.addressMeta && <span>📍 {displayFields.addressMeta}</span>}
                                    {item.category && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{item.category}</span>}
                                    {item.rating && <span className="text-amber-600">★ {item.rating}</span>}
                                    {item.admissionFee && <span>🎫 {item.admissionFee}</span>}
                                    {item.openingHours && <span>🕐 {item.openingHours}</span>}
                                    {item.estimatedVisitTime && <span className="text-gray-400">⏱ {item.estimatedVisitTime}</span>}
                                    {item.estimatedCost && <span className="text-gray-400">💰 {item.estimatedCost}</span>}
                                    {item.phone && <span className="text-gray-400">📞 {item.phone}</span>}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 独立 POI 信息卡片（名称 + 状态角标，与规划页风格一致） */}
                            {displayFields.showLocationCard && (
                              <div className="mt-1 ml-16 sm:ml-18 rounded-lg px-3 py-2 text-xs border bg-white border-gray-100 flex items-center gap-1.5 flex-wrap">
                                <span
                                  data-testid="poi-location-label"
                                  className={`font-medium ${isAbandoned ? 'text-gray-500 line-through' : 'text-gray-700'}`}
                                >
                                  {displayFields.locationLabel}
                                </span>
                                {item.isCustom && (
                                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">⭐ 自定义</span>
                                )}
                                {isCheckedIn && (
                                  <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">✓ 已打卡</span>
                                )}
                                {isPending && (
                                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">○ 未打卡</span>
                                )}
                                {isAbandoned && (
                                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-500">已放弃</span>
                                )}
                              </div>
                            )}

                            {/* 打卡成功后展示打卡时间、坐标、距离、笔记 */}
                            {isCheckedIn && item.checkedInAt && (
                              <div className="mt-1 ml-16 sm:ml-18 text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                                <span className="text-green-700 font-medium">
                                  🕐 {new Date(item.checkedInAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {item.checkinLat != null && item.checkinLng != null && (
                                  <span>📍 {item.checkinLat.toFixed(4)}, {item.checkinLng.toFixed(4)}</span>
                                )}
                                {item.distanceMeters != null && item.distanceMeters > 0 && (
                                  <span className="text-blue-600">（距 POI {item.distanceMeters.toFixed(0)} 米）</span>
                                )}
                                {item.note && <span className="text-gray-600 border-l border-gray-300 pl-1.5">📝 {item.note}</span>}
                              </div>
                            )}

                            {/* 媒体缩略图（打卡后显示） */}
                            {isCheckedIn && item.media && item.media.length > 0 && (
                              <div className="flex gap-1.5 mt-1.5 ml-16 sm:ml-18 flex-wrap">
                                {item.media.map((m) => (
                                  <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="block">
                                    {m.mediaType === 'VIDEO' ? (
                                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                                        {m.thumbnailUrl && (
                                          <>
                                            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic video thumbnail uses the authenticated media endpoint */}
                                            <img src={m.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                          </>
                                        )}
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                          <span className="text-white text-xs font-medium px-1.5 py-0.5 rounded bg-black/50">▶ 视频</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated media URL must be fetched by the browser */}
                                        <img src={m.url} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" loading="lazy" />
                                      </>
                                    )}
                                  </a>
                                ))}
                              </div>
                            )}

                            {/* 操作按钮（独立一行，避免与描述挤在一起） */}
                            <div className="mt-1.5 ml-16 sm:ml-18 flex gap-2 flex-wrap">
                              {isPending && (
                                <>
                                  <button
                                    onClick={() => handleCheckin(item)}
                                    disabled={checkinLoading === item.id}
                                    className="button-primary min-h-9 gap-1.5 px-2.5 text-xs"
                                  >
                                    <MapPinCheck aria-hidden="true" className="h-3.5 w-3.5" />
                                    打卡
                                  </button>
                                  {item.isCustom && (
                                    <button
                                      onClick={() => openEditForm(item)}
                                      className="button-secondary min-h-9 gap-1.5 px-2.5 text-xs"
                                    >
                                      <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                                      编辑
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleAbandonClick(item)}
                                    disabled={checkinLoading === item.id}
                                    className="button-danger min-h-9 gap-1.5 px-2.5 text-xs"
                                  >
                                    <CircleSlash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    放弃
                                  </button>
                                </>
                              )}
                              {isCheckedIn && (
                                <>
                                  {item.media && item.media.length < 10 && (
                                    <button
                                      onClick={() => setMediaModalItem(item)}
                                      className="button-secondary min-h-9 gap-1.5 px-2.5 text-xs"
                                    >
                                      <Camera aria-hidden="true" className="h-3.5 w-3.5" />
                                      添加媒体
                                    </button>
                                  )}
                                  <button
                                    onClick={async () => {
                                      const accepted = await confirmAction({
                                        title: '撤销这次打卡？',
                                        description: `将恢复「${item.poiName}」为待执行状态，已上传媒体会保留在历史记录中。`,
                                        confirmLabel: '撤销打卡',
                                        danger: true,
                                      });
                                      if (accepted) await handleUndoClick(item);
                                    }}
                                    disabled={checkinLoading === item.id}
                                    className="button-danger min-h-9 gap-1.5 px-2.5 text-xs"
                                  >
                                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    撤销
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    </div>

                    {/* 当天操作区 */}
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => router.push(`/trips/${planId}/checkin?day=${task.dayNumber}`)}
                        className="button-primary flex-1 gap-2 px-3"
                      >
                        <MapPinCheck aria-hidden="true" className="h-4 w-4" />
                        进入当天现场
                      </button>
                      <button
                        type="button"
                        onClick={() => openAddForm(task.id)}
                        className="button-secondary gap-2 px-3"
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        添加地点
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 添加自定义行程点弹窗（共享组件） */}
      {showAddModal && (
        <AddCustomItemModal
          planId={planId}
          taskId={addFormTargetTaskId}
          open={showAddModal}
          onClose={() => {
            setShowAddModal(false);
            setAddFormTargetTaskId(null);
          }}
          onAdded={() => {
            const targetDay = tasks.find((task) => task.id === addFormTargetTaskId)?.dayNumber ?? 1;
            setExpandedDays((previous) => new Set(previous).add(targetDay));
            setShowAddModal(false);
            setAddFormTargetTaskId(null);
            void refreshAfterAction();
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
            refreshAfterAction();
          }}
        />
      )}

      {/* 媒体上传弹窗 */}
      {mediaModalItem && (
        <MediaUploadModal
          itemId={mediaModalItem.id}
          existingMedia={mediaModalItem.media ?? []}
          onClose={() => setMediaModalItem(null)}
          onUploaded={() => refreshAfterAction()}
        />
      )}

      {checkinLoading !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="rounded-lg bg-white px-6 py-4 shadow-lg">处理中...</div>
        </div>
      )}
    </div>
  );
}
