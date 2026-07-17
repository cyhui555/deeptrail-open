import { addDays, nextSaturday, format } from 'date-fns';

/** 快捷日期选项元数据，渲染在出发时间 FormField 下方 */
export const DATE_SHORTCUTS: { label: string; key: string }[] = [
  { label: '明天', key: 'tomorrow' },
  { label: '本周末', key: 'weekend' },
  { label: '下周末', key: 'next_weekend' },
  { label: '一周后', key: 'days7' },
];

export function getTomorrow(): string {
  return quickFormat(addDays(new Date(), 1));
}

export function getDaysFromNow(n: number): string {
  return quickFormat(addDays(new Date(), n));
}

export function getThisWeekend(): string {
  return quickFormat(nextSaturday(new Date()));
}

export function getNextWeekend(): string {
  return quickFormat(addDays(nextSaturday(new Date()), 7));
}

/** 解析快捷 key → datetime-local input 可用的字符串（YYYY-MM-DDTHH:mm，时间设为 09:00） */
export function resolveShortcut(key: string): string {
  switch (key) {
    case 'tomorrow':
      return getTomorrow();
    case 'weekend':
      return getThisWeekend();
    case 'next_weekend':
      return getNextWeekend();
    case 'days7':
      return getDaysFromNow(7);
    default:
      return '';
  }
}

function quickFormat(d: Date): string {
  return `${format(d, 'yyyy-MM-dd')}T09:00`;
}
