'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ClipboardList, Sparkles } from 'lucide-react';
import { useTaskPoller } from '@/hooks/useTaskPoller';
import { TaskMetaCard } from '@/components/TaskMetaCard';
import { ItineraryContent } from '@/components/ItineraryContent';
import { OptimizeDisplay } from '@/components/OptimizeDisplay';
import { DayNavigator, useDayNavigation } from '@/components/DayNavigator';
import { ReadingProgress } from '@/components/ReadingProgress';
import { ImmersiveToggle } from '@/components/ImmersiveToggle';
import { CardSkeleton } from '@/components/Skeleton';
import { ErrorAlert } from '@/components/ErrorAlert';
import { EmptyState } from '@/components/EmptyState';
import { NodeRevisionModal } from '@/components/NodeRevisionModal';
import {
  submitOptimizeTask,
  cancelTask,
  createTripPlan,
  startCheckin,
  listNodeRevisions,
  saveNodeRevision,
  deleteNodeRevision,
} from '@/lib/api';
import { TaskStatus, isGenerateTask, isOptimizeTask } from '@/types';
import type { NodeRevision, OptimizeRequest, SaveNodeRevisionRequest, ScheduleItem, TransportMode } from '@/types';
import type { PlanningInfo } from '@/components/ItineraryContent';

export default function ItineraryDetailPage({
  params,
}: {
  params: { taskId: string };
}) {
  const { taskId } = params;
  const { task, loading, error, retry } = useTaskPoller(taskId);
  const router = useRouter();
  const [showOptimize, setShowOptimize] = useState(false);
  const [optimizeGoal, setOptimizeGoal] = useState('');
  const [optimizeConstraints, setOptimizeConstraints] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [immersive, setImmersive] = useState(false);

  // 节点修正状态
  const [revisions, setRevisions] = useState<NodeRevision[]>([]);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState<{
    dayIndex: number;
    itemIndex: number;
    item: ScheduleItem;
  } | null>(null);
  const [revisionSaving, setRevisionSaving] = useState(false);
  const [revisionSaveError, setRevisionSaveError] = useState<string | null>(null);
  const [justSavedKeys, setJustSavedKeys] = useState<Set<string>>(new Set());

  const [showAddToTrip, setShowAddToTrip] = useState(false);
  const [tripTitle, setTripTitle] = useState('');
  const [tripDate, setTripDate] = useState('');
  const [tripDates, setTripDates] = useState('');
  const [addingToTrip, setAddingToTrip] = useState(false);
  const [addToTripError, setAddToTripError] = useState<string | null>(null);
  const [addToTripSuccess, setAddToTripSuccess] = useState<string | null>(null);

  // 提取所有天序号用于导航
  const dayNumbers = task?.result?.days?.map((d) => d.day) || [];
  const { activeDay, handleDayClick } = useDayNavigation(dayNumbers);

  // 天折叠展开状态：点击侧边栏时自动展开对应天
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set(dayNumbers.slice(0, 1)));

  // 当天数变化时（数据加载完成），重置展开状态
  const dayNumbersKey = dayNumbers.join(',');
  useEffect(() => {
    if (dayNumbers.length > 3) {
      setExpandedDays(new Set([dayNumbers[0]]));
    } else {
      setExpandedDays(new Set(dayNumbers));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNumbersKey]);

  // 任务 COMPLETED 后加载节点修正列表
  useEffect(() => {
    if (task?.status === TaskStatus.COMPLETED && dayNumbers.length > 0) {
      listNodeRevisions(taskId)
        .then((list) => setRevisions(list))
        .catch(() => {
          // 修正列表非关键路径，加载失败不影响主行程展示
        });
    }
  // dayNumbersKey 是稳定化后的结构摘要，避免轮询产生的新数组重复请求。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.status, taskId, dayNumbersKey]);

  // 侧边栏点击某天时，滚动 + 展开
  const handleNavDayClick = useCallback((day: number) => {
    handleDayClick(day);
    setExpandedDays((prev) => {
      const next = new Set(prev);
      next.add(day);
      return next;
    });
  }, [handleDayClick]);

  /** 从任务请求 JSON 中提取目的地和天数，构造简洁标题和简介。 */
  const getPageTitleAndSubtitle = (): { title: string | null; subtitle: string | null } => {
    if (!task) return { title: null, subtitle: null };

    let destination: string | null = null;
    let daysNum: number | null = null;

    // 从 requestJson 解析 destination 和 days
    if (task.requestJson) {
      try {
        const req = JSON.parse(task.requestJson);
        if (req.destination) destination = String(req.destination);
        if (req.days) {
          const n = Number(req.days);
          if (!Number.isNaN(n) && n > 0) daysNum = n;
        }
      } catch { /* ignore parse errors */ }
    }

    // 兜底：从 result 的 days 数组长度推算天数
    if (daysNum == null && task.result?.days && task.result.days.length > 0) {
      daysNum = task.result.days.length;
    }

    const title = destination && daysNum ? `${destination}${daysNum}日游` : null;
    // 历史异常结果可能把完整模型原文塞进 result.summary；无有效 days 时绝不展示。
    const hasValidDays = !!(task.result?.days && task.result.days.length > 0);
    const subtitle = hasValidDays ? (task.result?.summary || task.summary || null) : task.summary || null;

    return { title, subtitle };
  };

  const { title: pageTitle, subtitle: pageSubtitle } = getPageTitleAndSubtitle();

  /** 从任务请求 JSON 中提取规划概要信息。 */
  const getPlanningInfo = (): PlanningInfo | undefined => {
    if (!task?.requestJson) return undefined;
    try {
      const req = JSON.parse(task.requestJson);
      const info: PlanningInfo = {};
      if (req.departureLocation) info.departureLocation = String(req.departureLocation);
      if (req.departureTime) info.departureTime = String(req.departureTime);
      if (req.destination) info.destination = String(req.destination);
      if (req.days) {
        const n = Number(req.days);
        if (!Number.isNaN(n) && n > 0) info.days = n;
      }
      if (req.peopleCount) {
        const n = Number(req.peopleCount);
        if (!Number.isNaN(n) && n > 0) info.peopleCount = n;
      }
      if (req.budget) info.budget = String(req.budget);
      if (Array.isArray(req.preferences) && req.preferences.length > 0) {
        info.preferences = req.preferences.map(String);
      }
      if (req.specialRequirements) info.specialRequirements = String(req.specialRequirements);
      return Object.keys(info).length > 0 ? info : undefined;
    } catch {
      return undefined;
    }
  };

  const planningInfo = getPlanningInfo();

  const getItineraryText = (): string => {
    if (!task || !task.result?.days || task.result.days.length === 0) return '';
    if (isGenerateTask(task)) return JSON.stringify(task.result);
    if (isOptimizeTask(task)) {
      return task.result.optimizedItinerary
          || JSON.stringify(task.result);
    }
    return '';
  };

  const handleCancel = useCallback(async () => {
    setCancelError(null);
    setCancelling(true);
    try {
      await cancelTask(taskId);
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : '取消失败');
    } finally {
      setCancelling(false);
    }
  }, [taskId]);

  const handleAddToTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddToTripError(null);
    if (!task || !task.result?.days || task.result.days.length === 0) {
      setAddToTripError('行程结构无效，请返回首页重新生成后再加入行程。');
      return;
    }
    setAddingToTrip(true);
    try {
      const planId = await createTripPlan({
        title: tripTitle,
        taskId,
        plannedDate: tripDate || undefined,
        tripDates: tripDates || undefined,
      });
      setAddToTripSuccess(planId);
      setShowAddToTrip(false);
      setTripTitle('');
      setTripDate('');
      setTripDates('');

      // 启动打卡流程（静默），保留在当前行程详情页，不自动跳转
      try {
        await startCheckin(planId);
      } catch (checkinErr) {
        // startCheckin 失败时静默处理，用户后续可手动在清单详情页重新触发
        console.warn('自动启动打卡失败，保留在当前页面', checkinErr);
      }
    } catch (err) {
      setAddToTripError(err instanceof Error ? err.message : '加入行程失败');
    } finally {
      setAddingToTrip(false);
    }
  };

  const handleOptimize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !task.result?.days || task.result.days.length === 0) {
      setOptimizeError('行程结构无效，请返回首页重新生成后再优化。');
      return;
    }
    setOptimizeError(null);
    setOptimizing(true);
    try {
      const req: OptimizeRequest = {
        currentItinerary: getItineraryText(),
        optimizationGoal: optimizeGoal,
      };
      if (optimizeConstraints.trim()) {
        req.constraints = optimizeConstraints.trim();
      }
      const res = await submitOptimizeTask(req);
      router.push(`/itineraries/${res.taskId}`);
    } catch (err) {
      setOptimizeError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setOptimizing(false);
    }
  };

  /** 从行程 JSON 解析 AI 原始 transportToNext（结构：{mode, durationMin, description}）。 */
  const parseOriginalTransport = (item: ScheduleItem): { mode: TransportMode; durationMin: number; description: string } | null => {
    // ScheduleItem 不直接含 transportToNext；此处尝试从 description 提取不到，返回 null 即可
    // 实际 transport 是 DayPlan.transportation 或来自 checkin_item；预览阶段暂无独立字段
    return null;
  };

  const handleEditNode = useCallback((dayIndex: number, itemIndex: number, item: ScheduleItem) => {
    setRevisionTarget({ dayIndex, itemIndex, item });
    setRevisionSaveError(null);
    setRevisionModalOpen(true);
  }, []);

  const handleSaveRevision = useCallback(async (req: SaveNodeRevisionRequest) => {
    setRevisionSaving(true);
    setRevisionSaveError(null);
    try {
      const saved = await saveNodeRevision(taskId, req);
      // 更新本地 revisions 列表
      setRevisions((prev) => {
        const idx = prev.findIndex((r) => r.dayIndex === saved.dayIndex && r.itemIndex === saved.itemIndex);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      // 触发闪烁
      setJustSavedKeys(new Set([`${saved.dayIndex}-${saved.itemIndex}`]));
      setTimeout(() => setJustSavedKeys(new Set()), 1500);
      // 关闭弹窗
      setRevisionModalOpen(false);
      setRevisionTarget(null);
    } catch (err) {
      setRevisionSaveError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setRevisionSaving(false);
    }
  }, [taskId]);

  const handleDeleteRevision = useCallback(async () => {
    if (!revisionTarget) return;
    const { dayIndex, itemIndex } = revisionTarget;
    setRevisionSaving(true);
    setRevisionSaveError(null);
    try {
      await deleteNodeRevision(taskId, dayIndex, itemIndex);
      setRevisions((prev) => prev.filter((r) => !(r.dayIndex === dayIndex && r.itemIndex === itemIndex)));
      setRevisionModalOpen(false);
      setRevisionTarget(null);
    } catch (err) {
      setRevisionSaveError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setRevisionSaving(false);
    }
  }, [revisionTarget, taskId]);

  const breadcrumb = (
    <div className="flex items-center gap-2 text-sm text-gray-500 leading-5">
      <Link href="/" className="inline-flex items-center text-blue-600 active:opacity-60 h-5">首页</Link>
      <span className="text-gray-300">/</span>
      <span className="text-gray-900">行程详情</span>
    </div>
  );

  /* ---- 初始加载中 ---- */
  if (loading && !task) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  /* ---- 初始加载失败 ---- */
  if (error && !task) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <ErrorAlert message={error} />
        <p className="text-sm text-gray-500">无法加载行程数据。请确认任务 ID 是否正确，或稍后重试。</p>
        <button
          onClick={retry}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  /* ---- 未找到 ---- */
  if (!task) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <EmptyState message="未找到该行程，可能已被删除或任务 ID 不正确。" />
      </div>
    );
  }

  const isTerminal =
    task.status === TaskStatus.COMPLETED ||
    task.status === TaskStatus.FAILED ||
    task.status === TaskStatus.CANCELLED;

  // 是否有结构化行程数据（用于显示时间线）
  const hasStructuredDays = !!(
    task.status === TaskStatus.COMPLETED &&
    task.result?.days &&
    task.result.days.length > 0 &&
    (isGenerateTask(task) || isOptimizeTask(task))
  );

  return (
    <>
      {/* 阅读进度条 */}
      <ReadingProgress />

      {/* 沉浸模式切换按钮 */}
      <ImmersiveToggle immersive={immersive} onToggle={() => setImmersive((v) => !v)} />

      {/* 天导航侧边栏（仅在有结构化行程数据时显示） */}
      {hasStructuredDays && (
        <DayNavigator
          days={dayNumbers}
          activeDay={activeDay}
          onDayClick={handleNavDayClick}
        />
      )}

      {/* 主体布局：桌面端为 flex 行（侧边栏 + 主内容），移动端为单列 */}
      <div className={`transition-all duration-300 ${hasStructuredDays ? 'lg:pl-16' : ''}`}>
        <div className={`transition-all duration-300 mx-auto ${immersive ? 'max-w-full px-4 lg:px-8' : 'max-w-3xl px-2 lg:px-4'}`}>

          {/* 顶栏：面包屑 + 取消按钮 */}
          {!immersive && (
            <div className="flex items-center justify-between mb-6">
              {breadcrumb}
              {!isTerminal && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 active:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {cancelling ? '取消中...' : '✖️ 取消任务'}
                </button>
              )}
            </div>
          )}

          {/* 轮询中错误提示 */}
          {cancelError && <ErrorAlert message={cancelError} />}
          {error && <ErrorAlert message={error} />}

          {/* 元信息卡片（沉浸模式下隐藏） */}
          {!immersive && (
            <div className="mb-6">
              <TaskMetaCard task={task} compact title={pageTitle ?? undefined} subtitle={pageSubtitle ?? undefined} />
            </div>
          )}

          {/* 操作按钮区：加入行程清单 + 优化 */}
          {!immersive && hasStructuredDays && (
            <div data-testid="itinerary-primary-actions" className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:gap-3">
              {!addToTripSuccess && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddToTrip(true);
                    setAddToTripError(null);
                    // 标题预填：复用页眉 pageTitle（{destination}{days}日游），避免 AI summary 长句入库
                    setTripTitle(pageTitle || '我的行程');
                    // 日期预填：AI 生成日期的天范围首末；plannedDate 默认取首天
                    const days = task.result?.days;
                    if (days && days.length > 0) {
                      const firstDate = days[0]?.date;
                      const lastDate = days[days.length - 1]?.date;
                      if (firstDate) {
                        setTripDate(firstDate);
                        setTripDates(firstDate === lastDate ? firstDate : `${firstDate} ~ ${lastDate}`);
                      }
                    }
                  }}
                  className="button-primary h-11 min-h-11 w-full min-w-0 gap-1.5 whitespace-nowrap px-3 text-[13px] leading-none sm:text-sm"
                >
                  <ClipboardList aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.9} />
                  <span>加入行程清单</span>
                </button>
              )}
              {addToTripSuccess && (
                <Link
                  href={`/trips/${addToTripSuccess}`}
                  className="flex h-11 min-h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-green-200 bg-green-50 px-3 text-[13px] font-semibold leading-none text-green-700 transition-colors active:bg-green-100 sm:text-sm"
                >
                  <Check aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2.1} />
                  <span>已加入，查看行程</span>
                </Link>
              )}
              {!showOptimize && (
                <button
                  type="button"
                  onClick={() => setShowOptimize(true)}
                  className="button-secondary h-11 min-h-11 shrink-0 gap-1.5 whitespace-nowrap px-3 text-[13px] leading-none sm:px-4 sm:text-sm"
                >
                  <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.9} />
                  <span>优化</span>
                </button>
              )}
            </div>
          )}

          {/* 加入行程清单弹窗 */}
          {!immersive && showAddToTrip && hasStructuredDays && (
            <div className="bg-white rounded-2xl border border-blue-200 shadow-sm mb-6 overflow-hidden">
              <div className="px-5 py-4 border-b border-blue-100 flex items-center justify-between">
                <h2 className="text-base font-semibold text-blue-900">加入行程清单</h2>
                <button
                  type="button"
                  onClick={() => { setShowAddToTrip(false); setAddToTripError(null); }}
                  className="text-gray-400 active:text-gray-600 text-sm px-2 py-1"
                >
                  取消
                </button>
              </div>
              <form onSubmit={handleAddToTrip} className="px-5 py-4 space-y-4">
                {addToTripError && <ErrorAlert message={addToTripError} />}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    行程名称 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={tripTitle}
                    onChange={(e) => setTripTitle(e.target.value)}
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
                    placeholder="例如：云南七日游"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    计划出发日期 <span className="text-gray-400 font-normal">（已按 AI 日程预填，可修改）</span>
                  </label>
                  <input
                    type="date"
                    value={tripDate}
                    onChange={(e) => setTripDate(e.target.value)}
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
                  />
                </div>
                {tripDates && (
                  <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                    <span className="text-blue-500 text-sm mt-px">📅</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-blue-700 font-medium">AI 生成的日程范围</p>
                      <p className="text-xs text-blue-600 mt-0.5">{tripDates}</p>
                    </div>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={addingToTrip}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-40 transition-all shadow-sm"
                >
                  {addingToTrip ? '加入中...' : '确认加入'}
                </button>
              </form>
            </div>
          )}

          {/* 优化表单 */}
          {!immersive && showOptimize && hasStructuredDays && (
            <div className="bg-white rounded-xl border border-purple-200 shadow-sm mb-6">
              <div className="px-5 py-4 border-b border-purple-100 flex items-center justify-between">
                <h2 className="text-base font-semibold text-purple-900">优化此行程</h2>
                <button
                  type="button"
                  onClick={() => { setShowOptimize(false); setOptimizeError(null); }}
                  className="text-gray-400 active:text-gray-600 text-sm min-h-0 min-w-0 px-2 py-1"
                >
                  取消
                </button>
              </div>
              <form onSubmit={handleOptimize} className="px-5 py-4 space-y-4">
                {optimizeError && <ErrorAlert message={optimizeError} />}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    优化目标
                  </label>
                  <select
                    required
                    value={optimizeGoal}
                    onChange={(e) => setOptimizeGoal(e.target.value)}
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:bg-white transition-all"
                  >
                    <option value="">请选择目标...</option>
                    <option value="降低预算">降低预算</option>
                    <option value="减少奔波">减少奔波</option>
                    <option value="增加亲子友好">增加亲子友好</option>
                    <option value="增加美食体验">增加美食体验</option>
                    <option value="增加文化体验">增加文化体验</option>
                    <option value="压缩行程">压缩行程</option>
                    <option value="延长行程">延长行程</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    额外限制 <span className="text-gray-400 font-normal">（选填）</span>
                  </label>
                  <input
                    type="text"
                    value={optimizeConstraints}
                    onChange={(e) => setOptimizeConstraints(e.target.value)}
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:bg-white transition-all"
                    placeholder="例如：预算不超过3000"
                  />
                </div>

                <button
                  type="submit"
                  disabled={optimizing}
                  className="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white active:bg-purple-700 disabled:opacity-40 transition-all shadow-sm shadow-purple-200"
                >
                  {optimizing ? '提交中...' : '开始优化'}
                </button>
              </form>
            </div>
          )}

          {/* ---- 等待中 ---- */}
          {!isTerminal && (
            <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
              <p className="mt-4 text-gray-600 font-medium">
                {task.status === TaskStatus.PENDING ? '等待调度...' : 'AI 正在生成行程...'}
              </p>
              <p className="mt-1 text-xs text-gray-400">页面每 2 秒自动更新</p>
            </div>
          )}

          {/* ---- 完成：生成/小红书 ---- */}
          {hasStructuredDays && isGenerateTask(task) && (
            <ItineraryContent
              summary={task.result!.summary}
              days={task.result!.days}
              estimatedBudget={task.result!.estimatedBudget}
              tips={task.result!.tips}
              planningInfo={planningInfo}
              expandedDays={expandedDays}
              nodeRevisions={revisions}
              onEditNode={handleEditNode}
              justSavedKeys={justSavedKeys}
              onToggleDay={(day) => {
                setExpandedDays((prev) => {
                  const next = new Set(prev);
                  if (next.has(day)) next.delete(day);
                  else next.add(day);
                  return next;
                });
              }}
            />
          )}

          {/* ---- 完成：优化 ---- */}
          {hasStructuredDays && isOptimizeTask(task) && (
            <OptimizeDisplay
              data={task.result!}
              expandedDays={expandedDays}
              onToggleDay={(day) => {
                setExpandedDays((prev) => {
                  const next = new Set(prev);
                  if (next.has(day)) next.delete(day);
                  else next.add(day);
                  return next;
                });
              }}
            />
          )}

          {/* ---- 完成但无结果 ---- */}
          {task.status === TaskStatus.COMPLETED && !hasStructuredDays && (
            <div className="bg-white rounded-2xl border border-amber-200 p-10 text-center shadow-sm">
              <h2 className="font-semibold text-amber-900">行程结构无效</h2>
              <p className="mt-2 text-sm text-amber-800">
                本次结果无法安全展示或继续操作，请返回首页重新生成。
              </p>
              <Link
                href="/"
                className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                返回首页重试
              </Link>
            </div>
          )}

          {/* ---- 失败 ---- */}
          {task.status === TaskStatus.FAILED && (
            <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-sm">
              <p className="text-gray-500">
                {task.errorMessage || '任务处理失败，无详细错误信息。'}
              </p>
            </div>
          )}

          {/* ---- 已取消 ---- */}
          {task.status === TaskStatus.CANCELLED && (
            <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-sm">
              <p className="text-gray-500">该任务已被取消。</p>
            </div>
          )}

          {/* 底部返回（沉浸模式下隐藏） */}
          {!immersive && (
            <div className="flex items-center gap-4 pt-8 mt-8 border-t border-gray-200">
              <Link href="/" className="text-sm text-blue-600 hover:underline">
                &larr; 返回任务列表
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* 节点修正弹窗 */}
      <NodeRevisionModal
        open={revisionModalOpen}
        dayIndex={revisionTarget?.dayIndex ?? 1}
        itemIndex={revisionTarget?.itemIndex ?? 0}
        initial={
          revisionTarget
            ? revisions.find(
                (r) => r.dayIndex === revisionTarget.dayIndex && r.itemIndex === revisionTarget.itemIndex,
              ) ?? null
            : null
        }
        originalLat={revisionTarget?.item.poi?.latitude ?? null}
        originalLng={revisionTarget?.item.poi?.longitude ?? null}
        originalTransport={revisionTarget ? parseOriginalTransport(revisionTarget.item) : null}
        saving={revisionSaving}
        saveError={revisionSaveError}
        onSave={handleSaveRevision}
        onDelete={
          revisionTarget && revisions.some(
            (r) => r.dayIndex === revisionTarget.dayIndex && r.itemIndex === revisionTarget.itemIndex,
          )
            ? handleDeleteRevision
            : undefined
        }
        onClose={() => {
          setRevisionModalOpen(false);
          setRevisionTarget(null);
          setRevisionSaveError(null);
        }}
      />
    </>
  );
}
