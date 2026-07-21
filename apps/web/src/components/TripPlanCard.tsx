'use client';

import Link from 'next/link';
import { CalendarDays, Footprints, MapPin, Trash2 } from 'lucide-react';
import type { TripPlanSummary } from '@/types';

const statusLabel: Record<string, string> = {
  PLANNED: '计划中',
  ONGOING: '进行中',
  COMPLETED: '已完成',
};

const statusVariant: Record<string, string> = {
  PLANNED: 'badge--warn',
  ONGOING: 'badge--info',
  COMPLETED: 'badge--success',
};

interface TripPlanCardProps {
  plan: TripPlanSummary;
  deleting?: boolean;
  onDelete?: (plan: TripPlanSummary) => void;
}

/** 行程清单卡片组件，主视觉用 destination + tripDates，避免长标题影响观感（PRD AC-4）。 */
export function TripPlanCard({ plan, deleting = false, onDelete }: TripPlanCardProps) {
  // 主视觉改造：destination 有值时作主标题，tripDates 作副标题；destination 为空 fallback 到 title（AC-6）
  const hasDestination = !!plan.destination;
  const primaryText = hasDestination ? plan.destination : plan.title;
  const secondaryText = hasDestination ? plan.tripDates : plan.tripDates;

  return (
    <article className="glass-light surface-card--hoverable relative cursor-pointer rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100/80 text-primary-700">
            <MapPin aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <Link
              href={`/trips/${plan.id}`}
              className="after:absolute after:inset-0 after:rounded-2xl focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary-600 focus-visible:after:ring-offset-2"
              aria-label={`查看行程：${primaryText}`}
            >
              <h3 className="truncate text-lg font-bold tracking-[-0.025em] text-gray-900">{primaryText}</h3>
            </Link>
            {secondaryText && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                <span className="truncate">{secondaryText}</span>
              </p>
            )}
          </div>
        </div>
        <span className={`badge shrink-0 ${statusVariant[plan.status] || 'badge--muted'}`}>
          {statusLabel[plan.status] || plan.status}
        </span>
      </div>
      {plan.summary && (
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-gray-600">{plan.summary}</p>
      )}
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/70 pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500">
          {plan.plannedDate && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
              出行日期：{plan.plannedDate}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Footprints aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
            打卡进度：{plan.checkinProgress}
          </span>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(plan)}
            disabled={deleting}
            className="relative z-10 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-40"
            aria-label={`删除行程：${primaryText}`}
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
            <span className="hidden sm:inline">删除</span>
          </button>
        )}
      </div>
    </article>
  );
}
