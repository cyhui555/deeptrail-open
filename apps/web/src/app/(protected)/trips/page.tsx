'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPinned, Plus } from 'lucide-react';
import { createTripPlan, getTripPlans } from '@/lib/api';
import { TripPlanCard } from '@/components/TripPlanCard';
import { ErrorAlert } from '@/components/ErrorAlert';
import type { TripPlanSummary } from '@/types';

/** 行程清单列表页面。 */
export default function TripsPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<TripPlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

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

      {/* 状态筛选 */}
      <div className="glass-light flex gap-1 overflow-x-auto rounded-2xl p-1.5 scrollbar-hide" aria-label="按行程状态筛选">
        {['', 'PLANNED', 'ONGOING', 'COMPLETED'].map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => setStatusFilter(s)}
            aria-pressed={statusFilter === s}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-all ${
              statusFilter === s
                ? 'bg-white/90 text-primary-800 shadow-card'
                : 'text-gray-500 hover:bg-white/50 hover:text-gray-800'
            }`}
          >
            {s === '' ? '全部' : s === 'PLANNED' ? '计划中' : s === 'ONGOING' ? '进行中' : '已完成'}
          </button>
        ))}
      </div>

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
          <p className="mt-4 font-semibold text-gray-800">还没有行程</p>
          <p className="mt-1 text-sm leading-6 text-gray-500">创建一条空白行程，再把想去的地点慢慢放进去。</p>
        </div>
      )}

      <div className="grid gap-3">
        {plans.map((plan) => (
          <Link key={plan.id} href={`/trips/${plan.id}`} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500">
            <TripPlanCard plan={plan} />
          </Link>
        ))}
      </div>

      {!loading && !error && page < totalPages && (
        <button
          type="button"
          onClick={() => void loadPlans(page + 1, true)}
          disabled={loadingMore}
          className="button-secondary w-full px-4"
        >
          {loadingMore ? '正在加载...' : '加载更多行程'}
        </button>
      )}
    </div>
  );
}
