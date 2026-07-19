import {
  CalendarDays,
  ClipboardList,
  Clock3,
  FileText,
  MapPin,
  Navigation,
  Users,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

/** 将模型请求中的 ISO 本地时间压缩为移动端可读格式，且不改变时区语义。 */
function formatPlanningTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}` : value;
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
  const planningItems: Array<{
    key: string;
    label: string;
    value: string;
    icon: LucideIcon;
    wide?: boolean;
  }> = [];

  if (planningInfo?.departureLocation) {
    planningItems.push({ key: 'departure', label: '出发地', value: planningInfo.departureLocation, icon: Navigation });
  }
  if (planningInfo?.destination) {
    planningItems.push({ key: 'destination', label: '目的地', value: planningInfo.destination, icon: MapPin });
  }
  if (planningInfo?.days != null && planningInfo.days > 0) {
    planningItems.push({ key: 'days', label: '天数', value: `${planningInfo.days} 天`, icon: CalendarDays });
  }
  if (planningInfo?.peopleCount != null && planningInfo.peopleCount > 0) {
    planningItems.push({ key: 'people', label: '人数', value: `${planningInfo.peopleCount} 人`, icon: Users });
  }
  if (planningInfo?.departureTime) {
    planningItems.push({
      key: 'time',
      label: '出发时间',
      value: formatPlanningTime(planningInfo.departureTime),
      icon: Clock3,
      wide: true,
    });
  }
  if (planningInfo?.budget) {
    planningItems.push({ key: 'budget', label: '预算', value: planningInfo.budget, icon: WalletCards, wide: true });
  }

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
        <section className="rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50 to-surface p-4 shadow-sm sm:p-6">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-primary-900">
            <ClipboardList aria-hidden="true" className="h-4 w-4" strokeWidth={1.9} />
            规划概要
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {planningItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className={`min-w-0 ${item.wide ? 'col-span-2 min-[380px]:col-span-1' : ''}`}>
                  <dt className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary-600" strokeWidth={1.8} />
                    {item.label}
                  </dt>
                  <dd className="mt-1 truncate font-semibold text-primary-900" title={item.value}>{item.value}</dd>
                </div>
              );
            })}
          </dl>
          {planningInfo.preferences && planningInfo.preferences.length > 0 && (
            <div className="mt-4 border-t border-primary-100 pt-3 text-sm">
              <p className="mb-2 text-xs text-gray-500">偏好</p>
              <div className="flex flex-wrap gap-1.5">
                {planningInfo.preferences.map((pref, i) => (
                  <span key={i} className="inline-flex min-h-7 items-center rounded-lg bg-primary-100 px-2 text-xs text-primary-800">
                    {pref}
                  </span>
                ))}
              </div>
            </div>
          )}
          {planningInfo.specialRequirements && (
            <div className="mt-3 flex items-start gap-2 border-t border-primary-100 pt-3 text-sm">
              <FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" strokeWidth={1.8} />
              <div className="min-w-0">
                <p className="text-xs text-gray-500">特殊需求</p>
                <p className="mt-1 break-words text-primary-900">{planningInfo.specialRequirements}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 概览 */}
      {summary && (
        <div className="rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50 to-surface p-4 shadow-sm sm:p-6">
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
