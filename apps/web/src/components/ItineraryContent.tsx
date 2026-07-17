import { ItineraryTimeline } from '@/components/ItineraryTimeline';
import type { DayPlan, NodeRevision, ScheduleItem } from '@/types';

/** 规划概要信息（从任务请求 JSON 中提取的用户输入参数）。 */
export interface PlanningInfo {
  /** 出发地。 */
  departureLocation?: string;
  /** 出发时间。 */
  departureTime?: string;
  /** 目的地。 */
  destination?: string;
  /** 出行天数。 */
  days?: number;
  /** 出行人数。 */
  peopleCount?: number;
  /** 预算描述。 */
  budget?: string;
  /** 偏好标签列表。 */
  preferences?: string[];
  /** 特殊需求文本。 */
  specialRequirements?: string;
}

interface Props {
  summary?: string;
  days?: DayPlan[];
  estimatedBudget?: string;
  tips?: string[];
  /** 规划概要信息（用户提交时的输入参数）。 */
  planningInfo?: PlanningInfo;
  /** 外部控制的展开天集合（受控模式）。未传入时组件自行管理。 */
  expandedDays?: Set<number>;
  /** 展开/折叠某天的回调。 */
  onToggleDay?: (day: number) => void;
  /** 节点修正记录及编辑入口，仅任务详情页传入。 */
  nodeRevisions?: NodeRevision[];
  onEditNode?: (dayIndex: number, itemIndex: number, item: ScheduleItem) => void;
  justSavedKeys?: Set<string>;
}

/**
 * 结构化行程内容区块（概览 + 时间线 + 预算 + 提示）。
 *
 * <p>供生成行程和优化行程共用，确保两种任务类型的结构化行程展示视觉一致。
 * 所有卡片使用统一的渐变背景、rounded-2xl 圆角和 shadow-sm 阴影。
 */
export function ItineraryContent({
  summary,
  days,
  estimatedBudget,
  tips,
  planningInfo,
  expandedDays,
  onToggleDay,
  nodeRevisions,
  onEditNode,
  justSavedKeys,
}: Props) {
  const hasDays = days && days.length > 0;
  const hasTips = tips && tips.length > 0;
  const hasPlanningInfo = planningInfo && (
    planningInfo.departureLocation ||
    planningInfo.departureTime ||
    planningInfo.destination ||
    planningInfo.days ||
    planningInfo.peopleCount ||
    planningInfo.budget ||
    (planningInfo.preferences && planningInfo.preferences.length > 0) ||
    planningInfo.specialRequirements
  );

  if (!hasDays) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        行程结构无效，已阻止展示非结构化模型内容。请重新生成。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 规划概要（用户提交时的输入参数） */}
      {hasPlanningInfo && (
        <div className="rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50 to-surface p-6 shadow-sm">
          <h2 className="text-base font-semibold text-cyan-900 mb-3">📋 规划概要</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {planningInfo.departureLocation && (
              <div className="flex items-start gap-1.5">
                <span className="shrink-0">🛫</span>
                <span className="text-gray-500">出发地：</span>
                <span className="text-cyan-800 font-medium">{planningInfo.departureLocation}</span>
              </div>
            )}
            {planningInfo.destination && (
              <div className="flex items-start gap-1.5">
                <span className="shrink-0">📍</span>
                <span className="text-gray-500">目的地：</span>
                <span className="text-cyan-800 font-medium">{planningInfo.destination}</span>
              </div>
            )}
            {planningInfo.days != null && planningInfo.days > 0 && (
              <div className="flex items-start gap-1.5">
                <span className="shrink-0">📅</span>
                <span className="text-gray-500">天数：</span>
                <span className="text-cyan-800 font-medium">{planningInfo.days} 天</span>
              </div>
            )}
            {planningInfo.peopleCount != null && planningInfo.peopleCount > 0 && (
              <div className="flex items-start gap-1.5">
                <span className="shrink-0">👥</span>
                <span className="text-gray-500">人数：</span>
                <span className="text-cyan-800 font-medium">{planningInfo.peopleCount} 人</span>
              </div>
            )}
            {planningInfo.departureTime && (
              <div className="flex items-start gap-1.5">
                <span className="shrink-0">🕐</span>
                <span className="text-gray-500">出发时间：</span>
                <span className="text-cyan-800 font-medium">{planningInfo.departureTime}</span>
              </div>
            )}
            {planningInfo.budget && (
              <div className="flex items-start gap-1.5">
                <span className="shrink-0">💰</span>
                <span className="text-gray-500">预算：</span>
                <span className="text-cyan-800 font-medium">{planningInfo.budget}</span>
              </div>
            )}
          </div>
          {planningInfo.preferences && planningInfo.preferences.length > 0 && (
            <div className="mt-3 flex items-start gap-1.5 text-sm">
              <span className="shrink-0">🏷️</span>
              <span className="text-gray-500">偏好：</span>
              <div className="flex flex-wrap gap-1.5">
                {planningInfo.preferences.map((pref, i) => (
                  <span key={i} className="inline-block bg-cyan-100 text-cyan-700 text-xs px-2 py-0.5 rounded-full">
                    {pref}
                  </span>
                ))}
              </div>
            </div>
          )}
          {planningInfo.specialRequirements && (
            <div className="mt-3 flex items-start gap-1.5 text-sm">
              <span className="shrink-0">📝</span>
              <span className="text-gray-500 shrink-0">特殊需求：</span>
              <span className="text-cyan-800">{planningInfo.specialRequirements}</span>
            </div>
          )}
        </div>
      )}

      {/* 概览 */}
      {summary && (
        <div className="rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50 to-surface p-6 shadow-sm">
          <h2 className="text-base font-semibold text-blue-900 mb-2">行程概览</h2>
          <p className="text-sm text-blue-800 leading-relaxed">{summary}</p>
        </div>
      )}

      {/* 每日行程时间线 */}
      {hasDays && (
        <ItineraryTimeline
          days={days!}
          expandedDays={expandedDays}
          onToggleDay={onToggleDay}
          nodeRevisions={nodeRevisions}
          onEditNode={onEditNode}
          justSavedKeys={justSavedKeys}
        />
      )}

      {/* 预算 */}
      {estimatedBudget && (
        <div className="rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-green-900 mb-2">预算估算</h2>
          <p className="text-sm text-green-800">{estimatedBudget}</p>
        </div>
      )}

      {/* 出行提示 */}
      {hasTips && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-100 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-amber-900 mb-3">出行提示</h2>
          <ul className="space-y-2">
            {tips!.map((tip, i) => (
              <li key={i} className="text-sm text-amber-800 flex gap-2">
                <span className="text-amber-500 shrink-0 mt-0.5">●</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
