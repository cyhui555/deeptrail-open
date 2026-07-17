'use client';

import type { TaskDetail } from '@/types';
import { TaskType } from '@/types';
import { TaskStatusBadge } from '@/components/TaskStatusBadge';

interface Props {
  task: TaskDetail;
  compact?: boolean;
  /** 外部传入的标题，优先于 task.summary。 */
  title?: string;
  /** 外部传入的副标题/简介，展示在标题下方。 */
  subtitle?: string;
}

const typeLabels: Record<TaskType, string> = {
  [TaskType.GENERATE]: '生成行程',
  [TaskType.OPTIMIZE]: '优化行程',
  [TaskType.XIAOHONGSHU]: '小红书生成',
};

export function TaskMetaCard({ task, compact, title, subtitle }: Props) {
  const containerClass = compact
    ? 'bg-gray-50 rounded-lg border border-gray-200 p-4'
    : 'bg-white rounded-lg border border-gray-200 p-6';
  const gridClass = compact
    ? 'grid grid-cols-2 gap-3 text-sm'
    : 'grid grid-cols-2 gap-4 text-sm';
  const monoClass = compact ? 'font-mono text-xs break-all' : 'font-mono text-sm break-all';

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-3 mb-3">
        <h1 className={compact ? 'text-lg font-bold text-gray-900' : 'text-xl font-bold text-gray-900'}>
          {title || task.summary || `${typeLabels[task.type] || task.type}任务`}
        </h1>
        <TaskStatusBadge status={task.status} />
      </div>
      {subtitle && (
        <p className={`text-gray-500 leading-relaxed ${compact ? 'text-xs mb-2' : 'text-sm mb-3'}`}>
          {subtitle}
        </p>
      )}

      <dl className={gridClass}>
        <div>
          <dt className="text-gray-500">任务 ID</dt>
          <dd className={`${monoClass} text-gray-900`}>{task.taskId}</dd>
        </div>
        <div>
          <dt className="text-gray-500">提交时间</dt>
          <dd className="text-gray-900">{new Date(task.submittedAt).toLocaleString('zh-CN')}</dd>
        </div>
        {task.startedAt && (
          <div>
            <dt className="text-gray-500">开始时间</dt>
            <dd className="text-gray-900">{new Date(task.startedAt).toLocaleString('zh-CN')}</dd>
          </div>
        )}
        {task.completedAt && (
          <div>
            <dt className="text-gray-500">完成时间</dt>
            <dd className="text-gray-900">{new Date(task.completedAt).toLocaleString('zh-CN')}</dd>
          </div>
        )}
        {task.tokenUsed != null && (
          <div>
            <dt className="text-gray-500">Token 消耗</dt>
            <dd className="text-gray-900">{task.tokenUsed.toLocaleString()}</dd>
          </div>
        )}
        {task.durationMs != null && (
          <div>
            <dt className="text-gray-500">AI 耗时</dt>
            <dd className="text-gray-900">{(task.durationMs / 1000).toFixed(1)}s</dd>
          </div>
        )}
      </dl>

      {task.parsedContent && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm font-medium text-blue-800">AI 收到的笔记内容</p>
          <p className="text-sm text-blue-700 mt-1 whitespace-pre-wrap break-words">{task.parsedContent}</p>
        </div>
      )}

      {task.errorMessage && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm font-medium text-red-800">错误信息</p>
          <p className="text-sm text-red-700 mt-1">{task.errorMessage}</p>
        </div>
      )}
    </div>
  );
}
