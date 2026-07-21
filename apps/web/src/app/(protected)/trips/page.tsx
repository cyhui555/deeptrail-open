'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, List, MapPinned, Plus } from 'lucide-react';
import { createTripPlan, deleteTripPlan, getTripPlans } from '@/lib/api';
import { TripPlanCard } from '@/components/TripPlanCard';
import { TripCalendar } from '@/components/TripCalendar';
import { ErrorAlert } from '@/components/ErrorAlert';
import { useAppFeedback } from '@/components/FeedbackProvider';
import type { PlanStatus, TripPlanSummary } from '@/types';

type ViewMode = 'list' | 'calendar';

const statusFilters: Array<{ value: PlanStatus | ''; label: string }> = [
  { value: '', label: '全部' },
  { value: 'PLANNED', label: '计划中' },
  { value: 'ONGOING', label: '进行中' },
  { value: 'COMPLETED', label: '已完成' },
];

/** 行程清单列表页面。 */
export default function TripsPage() {
  const router = useRouter();
  const { confirmAction, notify } = useAppFeedback();
  const [plans, setPlans] = useState<TripPlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PlanStatus | ''>('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [planTotal, setPlanTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [calendarPlans, setCalendarPlans] = useState<TripPlanSummary[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  // 新建空白清单表单
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDate, setCreateDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadPlans = useCallback(async (targetPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await getTripPlans(statusFilter || undefined, targetPage, 20);
      setPlans((current) => {
        if (!append) return result.records;
        const merged = new Map(current.map((plan) => [plan.id, plan]));
        result.records.forEach((plan) => merged.set(plan.id, plan));
        return Array.from(merged.values());
      });
      setPage(result.page);
      setTotalPages(result.totalPages);
      setPlanTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadPlans(1, false);
  }, [loadPlans]);

  /** 月历需要完整规划集合，按服务端允许的 100 条分页批量读取并按 ID 去重。 */
  const loadCalendarPlans = useCallback(async () => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const firstPage = await getTripPlans(statusFilter || undefined, 1, 100);
      const remainingPages = firstPage.totalPages > 1
        ? await Promise.all(Array.from(
          { length: firstPage.totalPages - 1 },
          (_, index) => getTripPlans(statusFilter || undefined, index + 2, 100),
        ))
        : [];
      const merged = new Map(firstPage.records.map((plan) => [plan.id, plan]));
      remainingPages.forEach((result) => {
        result.records.forEach((plan) => merged.set(plan.id, plan));
      });
      setCalendarPlans(Array.from(merged.values()));
    } catch (e) {
      setCalendarError(e instanceof Error ? e.message : '日期视图加载失败');
    } finally {
      setCalendarLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (viewMode === 'calendar') void loadCalendarPlans();
  }, [loadCalendarPlans, viewMode]);

  /** 提交新建空白清单（不关联 AI 任务，不自动启动打卡）。 */
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const planId = await createTripPlan({
        title: createTitle.trim(),
        plannedDate: createDate || undefined,
      });
      setShowCreate(false);
      setCreateTitle('');
      setCreateDate('');
      // 直接跳转到新清单详情页，用户可在其中手动添加行程点
      router.push(`/trips/${planId}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  /** 仅在服务端软删除成功后更新本地集合，失败时保留原行程供用户重试。 */
  const handleDeletePlan = async (plan: TripPlanSummary) => {
    if (deletingPlanId) return;
    const planName = plan.destination || plan.title;
    const accepted = await confirmAction({
      title: '删除这个行程？',
      description: `“${planName}”会从你的行程清单中移除，此操作目前不可撤销。`,
      confirmLabel: '确认删除',
      danger: true,
    });
    if (!accepted) return;

    setDeletingPlanId(plan.id);
    try {
      await deleteTripPlan(plan.id);
      setPlans((current) => current.filter((item) => item.id !== plan.id));
      setCalendarPlans((current) => current.filter((item) => item.id !== plan.id));
      const nextTotal = Math.max(0, planTotal - 1);
      const nextTotalPages = Math.ceil(nextTotal / 20);
      const nextPage = Math.min(page, Math.max(nextTotalPages, 1));
      setPlanTotal(nextTotal);
      setTotalPages(nextTotalPages);
      // 删除会让后续分页数据前移，补读当前末页以免列表少展示一条记录。
      await loadPlans(nextPage, true);
      notify(`已删除行程“${planName}”`, 'success');
    } catch (deleteError) {
      notify(deleteError instanceof Error ? deleteError.message : '删除失败，请稍后重试。', 'error');
    } finally {
      setDeletingPlanId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 sm:items-end sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-[-0.045em] text-gray-950 sm:text-4xl">我的行程</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">把计划、现场记录和旅行回忆放在同一条轨迹里。</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setCreateError(null);
          }}
          className="button-primary shrink-0 gap-1.5 px-3 sm:px-4"
        >
          <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          新建行程
        </button>
      </div>

      {/* 新建清单表单 */}
      {showCreate && (
        <div className="glass-strong overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/70 bg-primary-50/50 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">新建行程</h2>
              <p className="mt-0.5 text-xs text-gray-500">先创建清单，再逐步补充地点和路线。</p>
            </div>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setCreateError(null); }}
              className="rounded-full px-3 py-1 text-sm font-medium text-gray-500 hover:bg-white/70 active:text-gray-700"
            >
              取消
            </button>
          </div>
          <form onSubmit={handleCreatePlan} className="space-y-4 px-4 py-4 sm:px-5">
            {createError && <ErrorAlert message={createError} />}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                行程名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={200}
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                className="auth-input block"
                placeholder="例如：云南七日游"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                计划出行日期 <span className="text-gray-400 font-normal">（选填）</span>
              </label>
              <input
                type="date"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
                className="auth-input block"
              />
            </div>
            <p className="text-xs text-gray-400">创建后可在清单详情页手动添加行程点</p>
            <button
              type="submit"
              disabled={creating || !createTitle.trim()}
              className="button-primary w-full"
            >
              {creating ? '创建中...' : '创建行程'}
            </button>
          </form>
        </div>
      )}

      <div className="glass-light flex flex-col gap-2 rounded-2xl p-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-1 overflow-x-auto scrollbar-hide" aria-label="按行程状态筛选">
          {statusFilters.map((filter) => (
            <button
              type="button"
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              aria-pressed={statusFilter === filter.value}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                statusFilter === filter.value
                  ? 'bg-white/90 text-primary-800 shadow-card'
                  : 'text-gray-500 hover:bg-white/50 hover:text-gray-800'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-white/35 p-1" role="group" aria-label="行程查看方式">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${viewMode === 'list' ? 'bg-white text-primary-800 shadow-card' : 'text-gray-500 hover:text-gray-800'}`}
          >
            <List aria-hidden="true" className="h-3.5 w-3.5" />
            列表
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            aria-pressed={viewMode === 'calendar'}
            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${viewMode === 'calendar' ? 'bg-white text-primary-800 shadow-card' : 'text-gray-500 hover:text-gray-800'}`}
          >
            <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
            月历
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <>
          {loading && (
            <div className="space-y-3" aria-label="正在加载行程">
              {[1, 2].map((item) => (
                <div key={item} className="glass-light h-32 animate-pulse rounded-2xl" />
              ))}
            </div>
          )}
          {error && <ErrorAlert message={error} />}

          {!loading && !error && plans.length === 0 && !showCreate && (
            <div className="glass-light rounded-2xl p-9 text-center">
              <MapPinned aria-hidden="true" className="mx-auto h-8 w-8 text-primary-600" strokeWidth={1.6} />
              <p className="mt-4 font-semibold text-gray-800">{statusFilter ? '没有符合条件的行程' : '还没有行程'}</p>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                {statusFilter ? '切换状态查看其他规划。' : '创建一条空白行程，再把想去的地点慢慢放进去。'}
              </p>
            </div>
          )}

          <div className="grid gap-3">
            {plans.map((plan) => (
              <TripPlanCard
                key={plan.id}
                plan={plan}
                deleting={deletingPlanId === plan.id}
                onDelete={handleDeletePlan}
              />
            ))}
          </div>

          {!loading && !error && page < totalPages && (
            <button
              type="button"
              onClick={() => void loadPlans(page + 1, true)}
              disabled={loadingMore}
              className="button-secondary w-full px-4"
            >
              {loadingMore ? '正在加载...' : `加载更多行程（已显示 ${plans.length}/${planTotal}）`}
            </button>
          )}
        </>
      ) : (
        <>
          {calendarLoading && (
            <div className="glass-light h-[28rem] animate-pulse rounded-2xl" aria-label="正在加载行程月历" />
          )}
          {calendarError && (
            <div className="space-y-3">
              <ErrorAlert message={calendarError} />
              <button type="button" onClick={() => void loadCalendarPlans()} className="button-secondary w-full px-4">
                重新加载日期视图
              </button>
            </div>
          )}
          {!calendarLoading && !calendarError && calendarPlans.length === 0 ? (
            <div className="glass-light rounded-2xl p-9 text-center">
              <CalendarDays aria-hidden="true" className="mx-auto h-8 w-8 text-primary-600" strokeWidth={1.6} />
              <p className="mt-4 font-semibold text-gray-800">{statusFilter ? '这个状态下没有行程' : '还没有可安排的行程'}</p>
              <p className="mt-1 text-sm leading-6 text-gray-500">新建行程并设置日期后，就能在月历中查看规划。</p>
            </div>
          ) : !calendarLoading && !calendarError ? (
            <TripCalendar
              plans={calendarPlans}
              deletingPlanId={deletingPlanId}
              onDelete={handleDeletePlan}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
