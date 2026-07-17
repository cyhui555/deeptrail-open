import { ItineraryContent } from '@/components/ItineraryContent';
import type { OptimizeResponse } from '@/types';

interface Props {
  data: OptimizeResponse;
  /** 外部控制的展开天集合（受控模式）。 */
  expandedDays?: Set<number>;
  /** 展开/折叠某天的回调。 */
  onToggleDay?: (day: number) => void;
}

/**
 * 优化结果展示组件。
 *
 * <p>仅渲染包含 days 的结构化时间线；历史纯文本结果按无效结构安全降级。
 * 结构化行程部分复用 {@link ItineraryContent}，与生成行程保持视觉一致。
 */
export function OptimizeDisplay({ data, expandedDays, onToggleDay }: Props) {
  const hasStructuredData = data.days && data.days.length > 0;

  return (
    <>
      {/* 优化思路 */}
      {data.reasoning && (
        <div className="mb-6 rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50 to-surface p-6 shadow-sm">
          <h3 className="font-semibold text-purple-900 mb-1">优化思路</h3>
          <p className="text-sm text-purple-800 leading-relaxed">{data.reasoning}</p>
        </div>
      )}

      {/* 变更项 */}
      {data.changes && data.changes.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">变更项</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {data.changes.map((change, i) => (
              <div key={i} className="px-6 py-4">
                <p className="text-sm font-medium text-gray-900">{change.item}</p>
                <div className="mt-1.5 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-red-600 font-medium">调整前：</span>
                    <span className="text-gray-500">{change.from || '-'}</span>
                  </div>
                  <div>
                    <span className="text-green-600 font-medium">调整后：</span>
                    <span className="text-gray-500">{change.to || '-'}</span>
                  </div>
                </div>
                {change.reason && (
                  <p className="mt-1 text-xs text-gray-400">原因：{change.reason}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 结构化行程（与生成行程共用同一套 UI） */}
      {hasStructuredData ? (
        <ItineraryContent
          summary={data.summary}
          days={data.days}
          estimatedBudget={data.estimatedBudget}
          tips={data.tips}
          expandedDays={expandedDays}
          onToggleDay={onToggleDay}
        />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          优化结果缺少有效行程结构，已阻止展示原始模型内容。请重新生成后再优化。
        </div>
      )}
    </>
  );
}
