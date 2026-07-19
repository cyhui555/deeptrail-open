'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  days: number[];
  activeDay: number;
  onDayClick: (day: number) => void;
}

/**
 * 天维度导航组件。
 *
 * <p>桌面端（lg 断点以上）显示为左侧固定侧边栏，圆形锚点按钮纵向排列。
 * 移动端显示为顶部横向滚动 Tab 栏。通过 IntersectionObserver 自动高亮当前可见的天。
 */
export function DayNavigator({ days, activeDay, onDayClick }: Props) {
  return (
    <>
      {/* 桌面端：左侧固定侧边栏 */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-16 z-30 flex-col items-center justify-center gap-2 bg-gradient-to-b from-gray-50/80 to-white/80 backdrop-blur-sm border-r border-gray-100"
        aria-label="行程日期导航"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {days.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => onDayClick(day)}
            aria-label={`第 ${day} 天`}
            aria-current={activeDay === day ? 'step' : undefined}
            className={`relative flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold transition duration-200 ${
              activeDay === day
                ? 'bg-primary-700 text-white shadow-md shadow-primary-200 scale-110'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-primary-300 hover:text-primary-700'
            }`}
          >
            {day}
          </button>
        ))}
      </aside>

      {/* 移动端：顶部横向滚动 Tab 栏 */}
      <nav aria-label="行程日期导航" className="sticky top-14 z-20 -mx-4 border-b border-white/70 bg-surface/90 px-4 py-1.5 backdrop-blur-sm max-[480px]:-mx-3.5 max-[480px]:px-3.5 sm:top-16 sm:-mx-6 sm:px-6 lg:hidden">
        <div className="scrollbar-hide flex snap-x gap-1 overflow-x-auto pb-0.5">
          {days.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => onDayClick(day)}
              aria-label={`第 ${day} 天`}
              aria-current={activeDay === day ? 'step' : undefined}
              className="flex min-h-11 min-w-11 shrink-0 snap-start items-center justify-center whitespace-nowrap p-1"
            >
              <span className={`inline-flex h-9 items-center justify-center rounded-lg px-3 text-[13px] font-semibold transition duration-200 ${
                activeDay === day
                  ? 'bg-primary-700 text-white shadow-sm'
                  : 'border border-white/80 bg-white/75 text-gray-600'
              }`}>
                第 {day} 天
              </span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

/**
 * 跟踪当前可见天的 hook。
 *
 * <p>使用 IntersectionObserver 监听所有 id="day-{n}" 的元素，返回当前最靠上的可见天序号。
 */
export function useActiveDay(days: number[], offset = 100): number {
  const [activeDay, setActiveDay] = useState(days[0] || 1);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // 清理旧的 observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      // 找到第一个进入视口（或最接近顶部）的 entry
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visible.length > 0) {
        const dayAttr = visible[0].target.getAttribute('data-day');
        if (dayAttr) {
          setActiveDay(Number(dayAttr));
        }
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersect, {
      rootMargin: `-${offset}px 0px -40% 0px`,
      threshold: 0,
    });

    // 观察所有天的元素
    days.forEach((day) => {
      const el = document.getElementById(`day-${day}`);
      if (el) {
        observerRef.current!.observe(el);
      }
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [days, offset]);

  return activeDay;
}

/**
 * 滚动到指定天的工具函数。
 */
export function scrollToDay(day: number) {
  const el = document.getElementById(`day-${day}`);
  if (el) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
}

/**
 * 合并了 activeDay 状态 + 滚动回调的便捷 hook。
 */
export function useDayNavigation(days: number[]) {
  const activeDay = useActiveDay(days);
  const handleDayClick = useCallback((day: number) => {
    scrollToDay(day);
  }, []);

  return { activeDay, handleDayClick };
}
