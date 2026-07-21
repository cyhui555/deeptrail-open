'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { TripPlanSummary } from '@/types';

const isoDatePattern = /\b\d{4}-\d{2}-\d{2}\b/g;
const weekLabels = ['一', '二', '三', '四', '五', '六', '日'];

const statusStyle: Record<string, string> = {
  PLANNED: 'border-amber-200/80 bg-amber-50/90 text-amber-900',
  ONGOING: 'border-blue-200/80 bg-blue-50/90 text-blue-900',
  COMPLETED: 'border-green-200/80 bg-green-50/90 text-green-900',
};

interface TripDateRange {
  start: Date;
  end: Date;
}

interface DatedTrip {
  plan: TripPlanSummary;
  range: TripDateRange;
}

interface TripCalendarProps {
  plans: TripPlanSummary[];
  deletingPlanId?: string | null;
  onDelete: (plan: TripPlanSummary) => void;
}

/** 只接受严格 ISO 日期，避免把模糊自然语言日期错误投影到月历。 */
function parseStrictIsoDate(value: string): Date | null {
  const parsed = parseISO(value);
  if (!isValid(parsed) || format(parsed, 'yyyy-MM-dd') !== value) return null;
  return parsed;
}

function parseDateRange(value?: string): TripDateRange | null {
  const matches = value?.match(isoDatePattern) ?? [];
  const firstDate = matches[0];
  if (!firstDate) return null;
  const start = parseStrictIsoDate(firstDate);
  const end = parseStrictIsoDate(matches[1] ?? firstDate);
  if (!start || !end || end.getTime() < start.getTime()) return null;
  return { start, end };
}

/** 优先使用 AI 日程范围，缺失或非法时回退到用户设置的计划日期。 */
export function getTripPlanDateRange(plan: TripPlanSummary): TripDateRange | null {
  return parseDateRange(plan.tripDates) ?? parseDateRange(plan.plannedDate);
}

function containsDate(range: TripDateRange, date: Date): boolean {
  const time = date.getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
}

function chunkWeeks(days: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

/** 按月展示行程范围；窄屏使用“迷你月历 + 当日议程”避免七列内容拥挤。 */
export function TripCalendar({ plans, deletingPlanId, onDelete }: TripCalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(today);

  const { datedTrips, undatedPlans } = useMemo(() => {
    const dated: DatedTrip[] = [];
    const undated: TripPlanSummary[] = [];
    plans.forEach((plan) => {
      const range = getTripPlanDateRange(plan);
      if (range) dated.push({ plan, range });
      else undated.push(plan);
    });
    return { datedTrips: dated, undatedPlans: undated };
  }, [plans]);

  const calendarDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 1 }),
  }), [visibleMonth]);
  const weeks = useMemo(() => chunkWeeks(calendarDays), [calendarDays]);

  const plansForDate = (date: Date) => datedTrips
    .filter(({ range }) => containsDate(range, date))
    .map(({ plan }) => plan);

  const changeMonth = (month: Date) => {
    const nextMonth = startOfMonth(month);
    setVisibleMonth(nextMonth);
    setSelectedDate(isSameMonth(today, nextMonth) ? today : nextMonth);
  };

  const selectedPlans = plansForDate(selectedDate);
  const monthHasPlans = calendarDays.some((date) => (
    isSameMonth(date, visibleMonth) && plansForDate(date).length > 0
  ));

  const renderPlanAction = (plan: TripPlanSummary, date?: Date, compact = false) => (
    <div
      key={plan.id}
      className={`relative flex min-w-0 items-center rounded-lg border ${statusStyle[plan.status] ?? 'border-gray-200 bg-white/80 text-gray-800'}`}
    >
      <Link
        href={`/trips/${plan.id}`}
        className={`min-w-0 flex-1 truncate font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-600 ${compact ? 'px-1.5 py-1 text-[10px]' : 'px-3 py-2 text-sm'}`}
        aria-label={date
          ? `查看${plan.destination || plan.title}，${format(date, 'M月d日', { locale: zhCN })}`
          : `查看行程：${plan.destination || plan.title}`}
        title={plan.destination || plan.title}
      >
        {plan.destination || plan.title}
      </Link>
      <button
        type="button"
        onClick={() => onDelete(plan)}
        disabled={deletingPlanId === plan.id}
        className={`relative z-10 grid shrink-0 place-items-center rounded-md text-current/70 transition-colors hover:bg-white/75 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-40 ${compact ? 'mr-0.5 h-6 w-6' : 'mr-1 h-8 w-8'}`}
        aria-label={`删除行程：${plan.destination || plan.title}`}
      >
        <Trash2 aria-hidden="true" className={compact ? 'h-3 w-3' : 'h-4 w-4'} strokeWidth={1.8} />
      </button>
    </div>
  );

  return (
    <section className="glass-light overflow-hidden rounded-2xl" aria-label={`${format(visibleMonth, 'yyyy年M月', { locale: zhCN })}行程月历`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 px-3 py-3 sm:px-5 sm:py-4">
        <div>
          <h2 className="text-lg font-bold text-gray-950 sm:text-xl">
            {format(visibleMonth, 'yyyy年M月', { locale: zhCN })}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">按日期查看已加入的行程规划</p>
        </div>
        <div className="flex items-center gap-1" aria-label="切换月份">
          <button
            type="button"
            onClick={() => changeMonth(subMonths(visibleMonth, 1))}
            className="grid h-10 w-10 place-items-center rounded-xl text-gray-600 hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
            aria-label="上个月"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => changeMonth(today)}
            className="min-h-10 rounded-xl px-3 text-xs font-semibold text-primary-800 hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
          >
            今天
          </button>
          <button
            type="button"
            onClick={() => changeMonth(addMonths(visibleMonth, 1))}
            className="grid h-10 w-10 place-items-center rounded-xl text-gray-600 hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
            aria-label="下个月"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-3 sm:hidden">
        <div className="grid grid-cols-7 gap-1" aria-hidden="true">
          {weekLabels.map((label) => (
            <span key={label} className="py-1 text-center text-[10px] font-semibold text-gray-400">{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="选择日期">
          {calendarDays.map((date) => {
            const dayPlans = plansForDate(date);
            const inMonth = isSameMonth(date, visibleMonth);
            const selected = isSameDay(date, selectedDate);
            return (
              <button
                type="button"
                key={format(date, 'yyyy-MM-dd')}
                onClick={() => setSelectedDate(date)}
                disabled={!inMonth}
                aria-pressed={selected}
                aria-label={`${format(date, 'M月d日', { locale: zhCN })}${dayPlans.length > 0 ? `，${dayPlans.length}个行程` : '，无行程'}`}
                className={`relative grid min-h-10 place-items-center rounded-lg text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${
                  selected
                    ? 'bg-primary-700 font-bold text-white'
                    : isSameDay(date, today)
                      ? 'bg-primary-100 font-bold text-primary-900'
                      : inMonth
                        ? 'text-gray-700 hover:bg-white/70'
                        : 'text-gray-300'
                }`}
              >
                <span>{format(date, 'd')}</span>
                {dayPlans.length > 0 && inMonth && (
                  <span className={`absolute bottom-0.5 min-w-4 rounded px-0.5 text-[8px] leading-3 ${selected ? 'bg-white/20 text-white' : 'bg-primary-100 text-primary-800'}`}>
                    {dayPlans.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-white/70 pt-3">
          <p className="mb-2 text-xs font-semibold text-gray-600">
            {format(selectedDate, 'M月d日 EEEE', { locale: zhCN })}
          </p>
          {selectedPlans.length > 0 ? (
            <div className="space-y-2">
              {selectedPlans.map((plan) => renderPlanAction(plan, selectedDate))}
            </div>
          ) : (
            <p className="rounded-xl bg-white/45 px-3 py-4 text-center text-xs text-gray-500">这一天还没有行程安排</p>
          )}
        </div>
      </div>

      <div className="hidden p-4 sm:block">
        <table className="w-full table-fixed border-separate border-spacing-1" aria-label="月度行程安排">
          <caption className="sr-only">{format(visibleMonth, 'yyyy年M月', { locale: zhCN })}行程安排</caption>
          <thead>
            <tr>
              {weekLabels.map((label) => (
                <th key={label} scope="col" className="pb-2 text-center text-xs font-semibold text-gray-500">周{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={format(week[0], 'yyyy-MM-dd')}>
                {week.map((date) => {
                  const dayPlans = plansForDate(date);
                  const inMonth = isSameMonth(date, visibleMonth);
                  return (
                    <td
                      key={format(date, 'yyyy-MM-dd')}
                      className={`align-top ${inMonth ? '' : 'opacity-35'}`}
                    >
                      <div className={`min-h-28 rounded-xl border p-1.5 ${isSameDay(date, today) ? 'border-primary-300 bg-primary-50/55' : 'border-white/70 bg-white/35'}`}>
                        <time
                          dateTime={format(date, 'yyyy-MM-dd')}
                          aria-current={isSameDay(date, today) ? 'date' : undefined}
                          className={`mb-1 block px-1 text-xs font-semibold ${isSameDay(date, today) ? 'text-primary-800' : 'text-gray-500'}`}
                        >
                          {format(date, 'd')}
                        </time>
                        <div className="space-y-1">
                          {dayPlans.map((plan) => renderPlanAction(plan, date, true))}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!monthHasPlans && (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary-200 bg-white/35 px-4 py-5 text-sm text-gray-500">
            <CalendarDays aria-hidden="true" className="h-4 w-4 text-primary-600" />
            这个月还没有已安排日期的行程
          </div>
        )}
      </div>

      {undatedPlans.length > 0 && (
        <div className="border-t border-white/70 px-3 py-4 sm:px-5">
          <h3 className="text-sm font-bold text-gray-800">待安排日期</h3>
          <p className="mt-0.5 text-xs text-gray-500">这些行程尚未设置可识别的日期，不会从日期视图中消失。</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {undatedPlans.map((plan) => renderPlanAction(plan))}
          </div>
        </div>
      )}
    </section>
  );
}
