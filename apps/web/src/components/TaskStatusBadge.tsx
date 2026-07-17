import { TaskStatus } from '@/types';
import { LoaderCircle } from 'lucide-react';

const variant: Record<TaskStatus, string> = {
  [TaskStatus.PENDING]: 'badge--warn',
  [TaskStatus.PROCESSING]: 'badge--info',
  [TaskStatus.COMPLETED]: 'badge--success',
  [TaskStatus.FAILED]: 'badge--danger',
  [TaskStatus.CANCELLED]: 'badge--muted',
};

const labelMap: Record<TaskStatus, string> = {
  [TaskStatus.PENDING]: '等待中',
  [TaskStatus.PROCESSING]: '处理中',
  [TaskStatus.COMPLETED]: '已完成',
  [TaskStatus.FAILED]: '失败',
  [TaskStatus.CANCELLED]: '已取消',
};

/** 任务状态徽章（等待中/处理中/已完成/失败/已取消），使用语义化 .badge 类族。 */
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`badge ${variant[status]}`}>
      {status === TaskStatus.PROCESSING && (
        <LoaderCircle aria-hidden="true" className="-ml-0.5 mr-1.5 h-3 w-3 animate-spin" />
      )}
      {labelMap[status]}
    </span>
  );
}
