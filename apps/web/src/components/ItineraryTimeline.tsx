'use client';

import { useState } from 'react';
import type { DayPlan, NodeRevision, ScheduleItem } from '@/types';

interface Props {
  days: DayPlan[];
  defaultExpanded?: boolean;
  /** 外部控制的展开天集合（受控模式）。 */
  expandedDays?: Set<number>;
  /** 展开/折叠某天的回调。 */
  onToggleDay?: (day: number) => void;
  /** 节点修正记录，用于展示坐标/交通修正徽章。 */
  nodeRevisions?: NodeRevision[];
  /** 打开节点修正弹窗。 */
  onEditNode?: (dayIndex: number, itemIndex: number, item: ScheduleItem) => void;
  /** 刚保存的节点键集合，用于提示变更已生效。 */
  justSavedKeys?: Set<string>;
}

/**
 * 时段类别枚举，用于区分不同时段的图标和配色。
 */
type PeriodCategory = 'morning' | 'forenoon' | 'afternoon' | 'evening' | 'night';

interface PeriodStyle {
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const periodStyles: Record<PeriodCategory, PeriodStyle> = {
  morning: {
    icon: '🌅',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  forenoon: {
    icon: '🌞',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  afternoon: {
    icon: '🌇',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  evening: {
    icon: '🌙',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
  },
  night: {
    icon: '🌃',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
};

/**
 * 日标题渐变色带，按天序号循环 5 种配色。
 */
const dayHeaderGradients = [
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
  'from-primary-700 to-primary-500',
];

/**
 * 根据 period 文本推断时段类别。
 *
 * <p>通过匹配关键词（早/晨/上/中/下/午/晚/夜）来确定时段。
 */
function getPeriodCategory(period: string): PeriodCategory {
  const text = period.toLowerCase();
  if (/早|晨/.test(text)) return 'morning';
  if (/上|中/.test(text)) return 'forenoon';
  if (/午|下/.test(text)) return 'afternoon';
  if (/晚/.test(text)) return 'evening';
  if (/夜/.test(text)) return 'night';
  return 'forenoon';
}

/**
 * 根据 period 文本推断时段样式（导出供清单详情页 / checkin 页面复用）。
 *
 * @param period 时段文本
 * @return 时段样式（图标、颜色、背景色、边框色）
 */
export function getPeriodStyle(period: string): PeriodStyle {
  const category = getPeriodCategory(period);
  return periodStyles[category];
}

/**
 * 提取一天的摘要文本（用于折叠态展示）。
 *
 * <p>取每个时段 description 的前 30 个字 + 餐饮数量 + 小贴士标记，
 * 让用户在不展开的情况下快速了解当天安排。
 */
function buildDaySummary(day: DayPlan): string {
  const parts: string[] = [];

  if (day.schedule && day.schedule.length > 0) {
    const highlights = day.schedule
      .map((s) => {
        const fragments: string[] = [];
        if (s.period) fragments.push(s.period);
        if (s.poi?.name) fragments.push(s.poi.name);
        if (s.description) {
          const brief = s.description.length > 20
            ? s.description.slice(0, 20) + '…'
            : s.description;
          fragments.push(brief);
        }
        return fragments.join(' · ');
      })
      .filter(Boolean)
      .join(' | ');
    if (highlights) parts.push(highlights);
  }

  if (day.meals && day.meals.length > 0) {
    parts.push(`${day.meals.length} 餐`);
  }

  if (day.accommodation && day.accommodation.name) {
    parts.push(`🏨 ${day.accommodation.name}`);
  }

  if (day.tip) {
    parts.push(`💡 ${day.tip.length > 30 ? day.tip.slice(0, 30) + '…' : day.tip}`);
  }

  return parts.join('  ·  ');
}

/**
 * 增强版行程时间线组件。
 *
 * <p>相较于原版，增加了以下特性：
 * <ul>
 *   <li>每个时段带图标和配色区分（早晨/上午/下午/晚上/深夜）</li>
 *   <li>日标题区渐变色带</li>
 *   <li>POI 信息卡片化，带阴影和左边框色条</li>
 *   <li>天维度折叠/展开：默认折叠为摘要行，点击展开完整内容</li>
 * </ul>
 */
export function ItineraryTimeline({
  days,
  defaultExpanded = false,
  expandedDays: controlledExpanded,
  onToggleDay,
  nodeRevisions = [],
  onEditNode,
  justSavedKeys = new Set<string>(),
}: Props) {
  // 多天默认折叠，只展开第一天；少天数（≤3）默认全部展开
  const shouldExpandByDefault = defaultExpanded || (days && days.length <= 3);
  const [internalExpanded, setInternalExpanded] = useState<Set<number>>(
    () => {
      if (!days) return new Set<number>();
      return new Set(shouldExpandByDefault ? days.map((d) => d.day) : [days[0]?.day].filter(Boolean));
    },
  );

  if (!days || days.length === 0) return null;

  // 受控模式优先使用外部状态
  const expandedDays = controlledExpanded ?? internalExpanded;

  const toggleDay = (day: number) => {
    if (onToggleDay) {
      onToggleDay(day);
    } else {
      setInternalExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(day)) {
          next.delete(day);
        } else {
          next.add(day);
        }
        return next;
      });
    }
  };

  const expandAll = () => {
    if (onToggleDay) {
      days.forEach((d) => {
        if (!expandedDays.has(d.day)) onToggleDay(d.day);
      });
    } else {
      setInternalExpanded(new Set(days.map((d) => d.day)));
    }
  };

  const collapseAll = () => {
    if (onToggleDay) {
      days.forEach((d) => {
        if (expandedDays.has(d.day)) onToggleDay(d.day);
      });
    } else {
      setInternalExpanded(new Set());
    }
  };

  return (
    <div className="relative">
      {/* 左侧竖线 */}
      <div className="absolute bottom-2 left-5 top-2 w-0.5 rounded-full bg-gradient-to-b from-primary-200 via-primary-100 to-primary-200" />

      {/* 全部展开/折叠工具栏 */}
      {days.length > 3 && (
        <div className="flex items-center justify-end gap-2 mb-4">
          <button
            type="button"
            onClick={expandAll}
            className="text-xs text-blue-600 hover:text-blue-700 active:opacity-60 px-2 py-1"
          >
            全部展开
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-xs text-gray-500 hover:text-gray-700 active:opacity-60 px-2 py-1"
          >
            全部折叠
          </button>
        </div>
      )}

      <div className="space-y-0">
        {days.map((day, dayIndex) => {
          const gradient = dayHeaderGradients[dayIndex % dayHeaderGradients.length];
          const isExpanded = expandedDays.has(day.day);
          const summary = buildDaySummary(day);
          const scheduleCount = day.schedule?.length || 0;

          return (
            <div
              key={day.day}
              id={`day-${day.day}`}
              data-day={day.day}
              className="relative pl-14 pb-6 last:pb-0 scroll-mt-16"
            >
              {/* 时间线圆点 */}
              <div className={`absolute left-[14px] top-5 w-4 h-4 rounded-full bg-white border-[3px] shadow-sm z-10 transition-colors duration-200 ${
                isExpanded ? 'border-blue-500' : 'border-gray-300'
              }`} />

              {/* 日卡片 */}
              <div className={`bg-white border rounded-2xl shadow-sm transition-all duration-300 overflow-hidden ${
                isExpanded ? 'border-gray-100' : 'border-gray-100 hover:border-gray-200'
              }`}>
                {/* 可点击的标题区 */}
                <button
                  type="button"
                  onClick={() => toggleDay(day.day)}
                  className={`w-full text-left transition-colors duration-200 ${
                    isExpanded
                      ? `bg-gradient-to-r ${gradient}`
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* 折叠/展开箭头 */}
                      <svg
                        className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                          isExpanded ? 'rotate-90 text-white' : 'rotate-0 text-gray-400'
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>

                      <h3 className={`font-bold text-base ${isExpanded ? 'text-white' : 'text-gray-900'}`}>
                        第 {day.day} 天
                      </h3>
                      {day.date && (
                        <span className={`text-sm font-normal ${isExpanded ? 'text-white/80' : 'text-gray-500'}`}>
                          {day.date}
                        </span>
                      )}
                      {day.theme && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          isExpanded
                            ? 'bg-white/25 text-white'
                            : 'bg-blue-50 text-blue-700'
                        }`}>
                          {day.theme}
                        </span>
                      )}
                      <span className={`text-xs ${isExpanded ? 'text-white/70' : 'text-gray-400'}`}>
                        {scheduleCount} 项活动
                      </span>
                    </div>
                  </div>
                </button>

                {/* 天摘要：始终显示（放在 button 外面，避免嵌套 <div> 导致浏览器修正 DOM） */}
                <div className={`px-5 pb-4 pt-3 ${
                  isExpanded ? 'bg-white' : 'bg-gradient-to-r from-gray-50 to-white border-t border-gray-100'
                }`}>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">当天亮点</p>
                  {summary ? (
                    <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">
                      {summary}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">暂无当天摘要</p>
                  )}
                </div>

                {/* 展开态：完整内容 */}
                {isExpanded && (
                  <div className="p-5 page-enter">
                    {/* 日程安排 */}
                    {day.schedule && day.schedule.length > 0 && (
                      <div className="space-y-4 mb-4">
                        {day.schedule.map((item, i) => {
                          const category = getPeriodCategory(item.period);
                          const style = periodStyles[category];
                          const revision = nodeRevisions.find(
                            (entry) => entry.dayIndex === day.day && entry.itemIndex === i,
                          );
                          const revisionKey = `${day.day}-${i}`;

                          return (
                            <div key={i} className={justSavedKeys.has(revisionKey) ? 'animate-pulse' : ''}>
                              {/* 时段行：标签 + 描述 */}
                              <div className={`flex gap-2 sm:gap-3 p-3 rounded-xl ${style.bgColor} border ${style.borderColor}`}>
                                {/* 时段标签 */}
                                <div className="shrink-0 w-14 sm:w-16 flex flex-col items-center justify-center">
                                  <span className="text-lg">{style.icon}</span>
                                  <span className={`text-xs font-medium ${style.color} mt-0.5`}>
                                    {item.period}
                                  </span>
                                </div>

                                {/* 内容 + POI 信息 */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-800 leading-relaxed">
                                    {item.description}
                                  </p>
                                  {/* POI 补充信息标签 */}
                                  {(item.poi?.address || item.poi?.category || item.poi?.admissionFee || item.poi?.openingHours || item.estimatedCost) && (
                                    <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-gray-500">
                                      {item.poi?.address && <span>📍 {item.poi.address}</span>}
                                      {item.poi?.category && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{item.poi.category}</span>}
                                      {item.poi?.rating && <span className="text-amber-600">★ {item.poi.rating}</span>}
                                      {item.poi?.admissionFee && <span>🎫 {item.poi.admissionFee}</span>}
                                      {item.poi?.openingHours && <span>🕐 {item.poi.openingHours}</span>}
                                      {item.estimatedDuration && <span className="text-gray-400">⏱ {item.estimatedDuration}</span>}
                                      {item.estimatedCost && <span className="text-gray-400">💰 {item.estimatedCost}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 独立 POI 信息卡片（存在 POI 时显示详细信息在实际按钮下方） */}
                              {item.poi && item.poi.name !== item.description && (
                                <div className="mt-1 ml-16 sm:ml-18 rounded-lg px-3 py-2 text-xs border bg-white border-gray-100 flex items-center gap-2">
                                  <span className="font-medium text-gray-700">{item.poi.name}</span>
                                  {revision?.correctedLat != null && revision?.correctedLng != null && (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">📍 坐标</span>
                                  )}
                                  {revision?.transportCorrected && (
                                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">🚗 交通</span>
                                  )}
                                  {onEditNode && (
                                    <button
                                      type="button"
                                      title="修正坐标或交通"
                                      aria-label={`修正${item.poi.name}的坐标或交通`}
                                      onClick={() => onEditNode(day.day, i, item)}
                                      className="ml-auto rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                                    >
                                      ✏️
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 餐饮 + 住宿 */}
                    {(day.meals && day.meals.length > 0 || day.accommodation) && (
                      <div className="border-t border-gray-100 pt-3 space-y-2">
                        {day.meals?.map((meal, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className="shrink-0">🍽️</span>
                            <div>
                              <span className="font-medium text-gray-700">{meal.type}</span>
                              <span className="text-gray-500">: {meal.recommendation}</span>
                              {meal.estimatedCost && (
                                <span className="text-gray-400 ml-1">（{meal.estimatedCost}）</span>
                              )}
                            </div>
                          </div>
                        ))}
                        {day.accommodation && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="shrink-0">🏨</span>
                            <div>
                              <span className="font-medium text-gray-700">住宿</span>
                              <span className="text-gray-500">: {day.accommodation.name}</span>
                              {day.accommodation.address && (
                                <span className="text-gray-400 ml-1">· {day.accommodation.address}</span>
                              )}
                              {day.accommodation.rating && (
                                <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded ml-1">
                                  ★ {day.accommodation.rating}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 交通 */}
                    {day.transportation && (
                      <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
                        <span>🚗</span>
                        {day.transportation}
                      </p>
                    )}

                    {/* 小贴士 */}
                    {day.tip && (
                      <div className="mt-3 pt-3 border-t border-amber-100 bg-amber-50/50 -mx-5 -mb-5 px-5 py-3">
                        <p className="text-xs text-amber-700 flex items-start gap-1.5">
                          <span className="shrink-0">💡</span>
                          <span>{day.tip}</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
