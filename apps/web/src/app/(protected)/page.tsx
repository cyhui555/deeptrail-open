'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Compass,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TaskStatusBadge } from '@/components/TaskStatusBadge';
import { TaskForm } from '@/components/TaskForm';
import { OptimizeForm } from '@/components/OptimizeForm';
import { XiaohongshuForm } from '@/components/XiaohongshuForm';
import { ErrorAlert } from '@/components/ErrorAlert';
import {
  submitGenerateTask,
  submitOptimizeTask,
  submitXiaohongshuTask,
  fetchTaskList,
  fetchAiProviderStatus,
  getTripPlans,
} from '@/lib/api';
import type {
  AiProviderStatus,
  GenerateRequest,
  OptimizeRequest,
  XiaohongshuRequest,
  TaskSummary,
  PageResult,
  TripPlanSummary,
} from '@/types';
import { TaskStatus, TaskType } from '@/types';

type TabName = 'generate' | 'optimize' | 'xiaohongshu';

const tabs: Array<{ key: TabName; label: string; icon: LucideIcon }> = [
  { key: 'generate', label: '生成行程', icon: Compass },
  { key: 'optimize', label: '优化行程', icon: SlidersHorizontal },
  { key: 'xiaohongshu', label: '小红书', icon: BookOpen },
];

const typeLabels: Record<TaskType, string> = {
  [TaskType.GENERATE]: '生成行程',
  [TaskType.OPTIMIZE]: '优化行程',
  [TaskType.XIAOHONGSHU]: '小红书生成',
};

const taskTypeFilterOptions: Array<{ value: TaskType | ''; label: string }> = [
  { value: '', label: '全部类型' },
  { value: TaskType.GENERATE, label: '生成行程' },
  { value: TaskType.OPTIMIZE, label: '优化行程' },
  { value: TaskType.XIAOHONGSHU, label: '小红书生成' },
];

const taskStatusFilterOptions: Array<{ value: TaskStatus | ''; label: string }> = [
  { value: '', label: '全部状态' },
  { value: TaskStatus.PENDING, label: '等待中' },
  { value: TaskStatus.PROCESSING, label: '处理中' },
  { value: TaskStatus.COMPLETED, label: '已完成' },
  { value: TaskStatus.FAILED, label: '失败' },
  { value: TaskStatus.CANCELLED, label: '已取消' },
];

/** 优先返回正在执行的旅行，其次返回日期最近的待出发旅行。 */
function selectPriorityTrip(plans: TripPlanSummary[]): TripPlanSummary | null {
  const ongoing = plans.find((plan) => plan.status === 'ONGOING');
  if (ongoing) return ongoing;

  const planned = plans
    .filter((plan) => plan.status === 'PLANNED')
    .sort((left, right) => {
      const leftTime = left.plannedDate ? new Date(`${left.plannedDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.plannedDate ? new Date(`${right.plannedDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
  return planned[0] ?? null;
}

export default function Home() {
  const [tab, setTab] = useState<TabName>('generate');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiProviderStatus | null>(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(true);
  const [aiStatusCheckFailed, setAiStatusCheckFailed] = useState(false);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskLoadError, setTaskLoadError] = useState<string | null>(null);
  const [submittedTaskId, setSubmittedTaskId] = useState<string | null>(null);
  const [taskPage, setTaskPage] = useState(1);
  const [taskTotal, setTaskTotal] = useState(0);
  const [taskTotalPages, setTaskTotalPages] = useState(0);
  const [taskTypeFilter, setTaskTypeFilter] = useState<TaskType | ''>('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatus | ''>('');
  const [trips, setTrips] = useState<TripPlanSummary[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripLoadError, setTripLoadError] = useState(false);

  const loadAiStatus = useCallback(async () => {
    setAiStatusLoading(true);
    setAiStatusCheckFailed(false);
    try {
      setAiStatus(await fetchAiProviderStatus());
    } catch {
      setAiStatus(null);
      setAiStatusCheckFailed(true);
    } finally {
      setAiStatusLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async (page = 1, silent = false) => {
    try {
      if (!silent) setTasksLoading(true);
      setTaskLoadError(null);
      const data: PageResult<TaskSummary> = await fetchTaskList(
        taskStatusFilter || undefined,
        page,
        10,
        taskTypeFilter || undefined,
      );
      setTasks(data?.records ?? []);
      setTaskPage(data?.page ?? 1);
      setTaskTotal(data?.total ?? 0);
      setTaskTotalPages(data?.totalPages ?? 0);
    } catch {
      // 保留已加载的数据，让网络抖动不会把任务列表误呈现为空状态。
      setTaskLoadError('最近任务暂时加载失败，请稍后重试。');
    } finally {
      if (!silent) setTasksLoading(false);
    }
  }, [taskStatusFilter, taskTypeFilter]);

  const loadTrips = useCallback(async () => {
    setTripsLoading(true);
    setTripLoadError(false);
    try {
      // 正在进行与待出发行程并行读取，避免先查一类再查另一类形成首页瀑布请求。
      const [ongoing, planned] = await Promise.all([
        getTripPlans('ONGOING', 1, 1),
        getTripPlans('PLANNED', 1, 100),
      ]);
      setTrips([...ongoing.records, ...planned.records]);
    } catch {
      setTripLoadError(true);
    } finally {
      setTripsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAiStatus();
  }, [loadAiStatus]);

  useEffect(() => {
    // 筛选条件变化时清除上一组结果并回到第一页，避免短暂展示不匹配的旧任务。
    setTasks([]);
    setTaskPage(1);
    void loadTasks(1);
  }, [loadTasks]);

  useEffect(() => {
    void loadTrips();
  }, [loadTrips]);

  const hasActiveTasks = tasks.some(
    (task) => task.status === TaskStatus.PENDING || task.status === TaskStatus.PROCESSING,
  );

  useEffect(() => {
    // 生成中的任务快速更新；空闲时降低轮询频率，且刷新过程不替换已有内容为骨架。
    const interval = setInterval(
      () => void loadTasks(taskPage, true),
      hasActiveTasks ? 5_000 : 30_000,
    );
    return () => clearInterval(interval);
  }, [hasActiveTasks, loadTasks, taskPage]);

  const aiSubmissionDisabled = aiStatusLoading || !aiStatus?.available;
  const priorityTrip = selectPriorityTrip(trips);
  const hasTaskFilters = Boolean(taskTypeFilter || taskStatusFilter);
  const submissionErrorMessage = (value: unknown) => {
    const message = value instanceof Error ? value.message : '提交失败';
    return message.includes('SPRING_AI_OPENAI_API_KEY') || message.includes('AI 生成功能')
      ? 'AI 规划服务暂不可用，请重新检测后再试。'
      : message;
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: TabName) => {
    const currentIndex = tabs.findIndex((item) => item.key === current);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = tabs[nextIndex].key;
    setTab(nextTab);
    setError(null);
    requestAnimationFrame(() => document.getElementById(`planner-tab-${nextTab}`)?.focus());
  };

  const handleGenerate = async (data: GenerateRequest) => {
    setError(null);
    if (aiSubmissionDisabled) {
      setError('AI 规划服务暂不可用，请重新检测后再试。');
      return false;
    }
    setSubmitting(true);
    try {
      const res = await submitGenerateTask(data);
      setSubmittedTaskId(res.taskId);
      await loadTasks(1, true);
      return true;
    } catch (e) {
      setError(submissionErrorMessage(e));
      void loadAiStatus();
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleOptimize = async (data: OptimizeRequest) => {
    setError(null);
    if (aiSubmissionDisabled) {
      setError('AI 规划服务暂不可用，请重新检测后再试。');
      return false;
    }
    setSubmitting(true);
    try {
      const res = await submitOptimizeTask(data);
      setSubmittedTaskId(res.taskId);
      await loadTasks(1, true);
      return true;
    } catch (e) {
      setError(submissionErrorMessage(e));
      void loadAiStatus();
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleXiaohongshu = async (data: XiaohongshuRequest) => {
    setError(null);
    if (aiSubmissionDisabled) {
      setError('AI 规划服务暂不可用，请重新检测后再试。');
      return false;
    }
    setSubmitting(true);
    try {
      const res = await submitXiaohongshuTask(data);
      setSubmittedTaskId(res.taskId);
      await loadTasks(1, true);
      return true;
    } catch (e) {
      setError(submissionErrorMessage(e));
      void loadAiStatus();
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="home-layout">
      <header className="home-editorial home-editorial-panel flex flex-col justify-between">
        {tripsLoading ? (
          <div className="space-y-4" aria-label="正在加载当前旅行">
            <div className="h-4 w-24 animate-pulse rounded bg-primary-100/80" />
            <div className="h-16 w-3/4 animate-pulse rounded-xl bg-white/55" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-white/45" />
          </div>
        ) : priorityTrip ? (
          <>
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-primary-700">
                {priorityTrip.status === 'ONGOING' ? '正在旅行' : '下一次出发'}
              </p>
              <h1 className="mt-5 max-w-[12ch] text-4xl font-bold leading-[1.08] tracking-[-0.055em] text-gray-950 sm:text-5xl">
                {priorityTrip.destination || priorityTrip.title}
              </h1>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">
                {priorityTrip.plannedDate && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays aria-hidden="true" className="h-4 w-4 text-primary-700" />
                    {priorityTrip.plannedDate}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <MapPin aria-hidden="true" className="h-4 w-4 text-primary-700" />
                  {priorityTrip.checkinProgress || '等待开始'}
                </span>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <Link
                href={priorityTrip.status === 'ONGOING'
                  ? `/trips/${priorityTrip.id}/checkin`
                  : `/trips/${priorityTrip.id}`}
                className="button-primary gap-2 px-5"
              >
                {priorityTrip.status === 'ONGOING' ? '继续旅行' : '查看行程'}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link href="/trips" className="button-secondary px-5">全部行程</Link>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-primary-700">从计划到出发</p>
              <h1 className="mt-5 max-w-[11ch] text-4xl font-bold leading-[1.08] tracking-[-0.055em] text-gray-950 sm:text-5xl">
                准备好下一次出发
              </h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-gray-600 sm:text-base">
                创建可执行的日程，到现场按下一站行动，再把沿途记忆留在同一次旅行里。
              </p>
              {tripLoadError && (
                <p className="mt-2 text-xs text-amber-800">暂时无法读取已有行程，你仍可继续规划。</p>
              )}
            </div>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <a href="#planner-title" className="button-primary gap-2 px-5">
                开始规划
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </a>
              <Link href="/trips" className="button-secondary px-5">创建空白行程</Link>
            </div>
          </>
        )}
      </header>

      <section className="home-planner space-y-3" aria-labelledby="planner-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="planner-title" className="text-2xl tracking-[-0.04em] text-gray-950">快速规划</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">选择一种方式，旅迹会保留你的每一步输入。</p>
          </div>
        </div>

        {aiSubmissionDisabled && (
          <div
            className="rounded-2xl border border-primary-200/80 bg-primary-50/90 px-4 py-3 shadow-sm"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/80 text-primary-700">
                <Sparkles aria-hidden="true" className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  {aiStatusLoading ? '正在检测 AI 规划服务' : 'AI 规划暂不可用'}
                </p>
                <p id="ai-readiness-message" className="mt-0.5 text-xs leading-5 text-gray-600">
                  {aiStatusLoading
                    ? '检测期间仍可填写并保留规划内容。'
                    : aiStatusCheckFailed
                      ? '暂时无法确认模型服务状态，请重新检测。'
                      : '模型服务尚未配置。现有行程、地图、打卡和 PDF 导出仍可使用。'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadAiStatus()}
                disabled={aiStatusLoading}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-primary-200 bg-white/80 px-3 text-xs font-medium text-primary-800 transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 ${aiStatusLoading ? 'animate-spin' : ''}`}
                />
                {aiStatusLoading ? '检测中' : '重新检测'}
              </button>
            </div>
          </div>
        )}

        {/* 三种任务共享一条分段控制，避免把导航误做成三张同质卡片。 */}
        <div className="app-segmented glass-light" role="tablist" aria-label="规划方式">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                id={`planner-tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`planner-panel-${t.key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => {
                  setTab(t.key);
                  setError(null);
                }}
                onKeyDown={(event) => handleTabKeyDown(event, t.key)}
                className={`app-segmented__item ${active ? 'app-segmented__item--active' : ''}`}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.9} />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="glass-strong overflow-hidden rounded-2xl">
          <div className="p-4 sm:p-6">
            {error && <div className="mb-3"><ErrorAlert message={error} /></div>}
            <div
              id="planner-panel-generate"
              role="tabpanel"
              aria-labelledby="planner-tab-generate"
              hidden={tab !== 'generate'}
            >
              <TaskForm
                onSubmit={handleGenerate}
                loading={submitting}
                submissionDisabled={aiSubmissionDisabled}
              />
            </div>
            <div
              id="planner-panel-optimize"
              role="tabpanel"
              aria-labelledby="planner-tab-optimize"
              hidden={tab !== 'optimize'}
            >
              <OptimizeForm
                onSubmit={handleOptimize}
                loading={submitting}
                active={tab === 'optimize'}
                submissionDisabled={aiSubmissionDisabled}
              />
            </div>
            <div
              id="planner-panel-xiaohongshu"
              role="tabpanel"
              aria-labelledby="planner-tab-xiaohongshu"
              hidden={tab !== 'xiaohongshu'}
            >
              <XiaohongshuForm
                onSubmit={handleXiaohongshu}
                loading={submitting}
                submissionDisabled={aiSubmissionDisabled}
              />
            </div>
          </div>
        </div>
      </section>

      <section
        className="home-recent"
        aria-labelledby="recent-title"
        aria-busy={tasksLoading && tasks.length === 0}
      >
        {submittedTaskId && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50/90 px-4 py-3">
            <p className="text-sm text-green-800">
              任务已提交！{' '}
              <Link href={`/itineraries/${submittedTaskId}`} className="font-semibold underline">
                查看任务
              </Link>
            </p>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 id="recent-title" className="text-2xl tracking-[-0.04em] text-gray-950">最近任务</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">继续整理还在生成或等待确认的行程。</p>
          </div>
          {taskTotal > 0 && (
            <span className="shrink-0 text-xs text-gray-500">
              {taskTotal} 个{hasTaskFilters ? '匹配任务' : '任务'}
            </span>
          )}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border border-white/65 bg-white/30 p-2" aria-label="筛选最近任务">
          <label className="min-w-0">
            <span className="mb-1 block px-1 text-[11px] font-semibold text-gray-500">任务类型</span>
            <select
              value={taskTypeFilter}
              onChange={(event) => setTaskTypeFilter(event.target.value as TaskType | '')}
              className="h-10 w-full rounded-xl border border-white/80 bg-white/70 px-2.5 text-xs font-semibold text-gray-700 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              aria-label="按任务类型筛选"
            >
              {taskTypeFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block px-1 text-[11px] font-semibold text-gray-500">执行状态</span>
            <select
              value={taskStatusFilter}
              onChange={(event) => setTaskStatusFilter(event.target.value as TaskStatus | '')}
              className="h-10 w-full rounded-xl border border-white/80 bg-white/70 px-2.5 text-xs font-semibold text-gray-700 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              aria-label="按任务状态筛选"
            >
              {taskStatusFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {hasTaskFilters && (
            <button
              type="button"
              onClick={() => {
                setTaskTypeFilter('');
                setTaskStatusFilter('');
              }}
              className="col-span-2 min-h-9 rounded-xl text-xs font-semibold text-primary-800 hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
            >
              清除筛选
            </button>
          )}
        </div>

        {taskLoadError && (
          <div
            className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3"
            role="alert"
          >
            <p className="text-xs leading-5 text-amber-900">{taskLoadError}</p>
            <button
              type="button"
              onClick={() => void loadTasks(taskPage)}
              className="shrink-0 rounded-lg border border-amber-300 bg-white/80 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-white"
            >
              重试
            </button>
          </div>
        )}

        {tasksLoading && tasks.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-light h-[72px] animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : tasks.length === 0 && !taskLoadError ? (
          <div className="glass-light rounded-2xl p-8 text-center text-gray-500">
            <p className="text-sm leading-6">
              {hasTaskFilters ? '没有符合筛选条件的任务。' : '暂无任务，提交一个开始吧！'}
            </p>
            {hasTaskFilters && (
              <button
                type="button"
                onClick={() => {
                  setTaskTypeFilter('');
                  setTaskStatusFilter('');
                }}
                className="mt-3 min-h-10 rounded-xl px-4 text-xs font-semibold text-primary-800 hover:bg-white/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
              >
                查看全部任务
              </button>
            )}
          </div>
        ) : tasks.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {tasks.map((task) => (
              <Link
                key={task.taskId}
                href={`/itineraries/${task.taskId}`}
                className="tap-active glass-light block rounded-2xl px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-card-hover active:scale-[0.98]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {task.summary || typeLabels[task.type] || task.type}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {typeLabels[task.type] || task.type} · {new Date(task.submittedAt).toLocaleString('zh-CN', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </div>
              </Link>
            ))}
          </div>
        ) : null}

        {taskTotalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={tasksLoading || taskPage <= 1}
              onClick={() => void loadTasks(taskPage - 1)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600 disabled:opacity-30"
            >
              上一页
            </button>
            <span className="text-xs text-gray-500">
              {taskPage} / {taskTotalPages}
            </span>
            <button
              type="button"
              disabled={tasksLoading || taskPage >= taskTotalPages}
              onClick={() => void loadTasks(taskPage + 1)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600 disabled:opacity-30"
            >
              下一页
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
