'use client';

import { useState, useEffect } from 'react';
import { ListTodo, Sparkles, MessageSquare } from 'lucide-react';
import type { OptimizeRequest, TaskSummary, TaskDetail, PageResult } from '@/types';
import { TaskType, isGenerateTask } from '@/types';
import { fetchTaskList, fetchTaskStatus } from '@/lib/api';
import { FormField } from './FormField';
import { usePersistentDraft } from '@/hooks/usePersistentDraft';

interface Props {
  onSubmit: (data: OptimizeRequest) => Promise<boolean>;
  loading: boolean;
  active?: boolean;
  submissionDisabled?: boolean;
}

const typeLabels: Record<string, string> = {
  [TaskType.GENERATE]: '生成行程',
  [TaskType.XIAOHONGSHU]: '小红书生成',
};

export function OptimizeForm({
  onSubmit,
  loading,
  active = true,
  submissionDisabled = false,
}: Props) {
  const [form, setForm, clearDraft] = usePersistentDraft<OptimizeRequest>('planner-optimize-v1', {
    currentItinerary: '',
    optimizationGoal: '',
    constraints: '',
  });
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [tasksRequested, setTasksRequested] = useState(false);

  useEffect(() => {
    // 表单保持挂载以保留草稿，但只在用户首次打开该 Tab 时加载候选行程。
    if (!active || tasksRequested) return;
    setTasksRequested(true);
    // 与服务端单页上限保持一致，避免切换 Tab 时触发参数校验失败。
    fetchTaskList('COMPLETED', 1, 100)
      .then((data: PageResult<TaskSummary>) => {
        setTasks(data.records.filter(
          (t) => t.type === TaskType.GENERATE || t.type === TaskType.XIAOHONGSHU,
        ));
      })
      .catch(() => {})
      .finally(() => setTasksLoading(false));
  }, [active, tasksRequested]);

  const handleTaskSelect = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSelectedTaskDetail(null);
    if (!taskId) {
      setForm((p) => ({ ...p, currentItinerary: '' }));
      return;
    }
    setPreviewLoading(true);
    try {
      const detail = await fetchTaskStatus(taskId);
      setSelectedTaskDetail(detail);
      if (isGenerateTask(detail) && detail.result) {
        setForm((p) => ({ ...p, currentItinerary: JSON.stringify(detail.result) }));
      }
    } catch {
      // ignore fetch errors for preview
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || submissionDisabled) return;
    const submitted = await onSubmit(form);
    if (submitted) {
      clearDraft();
      setSelectedTaskId('');
      setSelectedTaskDetail(null);
    }
  };

  const preview = selectedTaskDetail && isGenerateTask(selectedTaskDetail)
    ? selectedTaskDetail.result
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField
        label="选择已完成的行程"
        icon={<ListTodo />}
        required
        focusRingClass="field-wrap--purple"
      >
        {tasksLoading ? (
          <div className="h-10 animate-pulse" aria-hidden />
        ) : tasks.length === 0 ? (
          <p className="text-sm text-gray-500">
            暂无可选取的行程，请先在「生成行程」中生成一个行程。
          </p>
        ) : (
          <select
            required
            value={selectedTaskId}
            onChange={(e) => handleTaskSelect(e.target.value)}
          >
            <option value="">请选择已完成的行程...</option>
            {tasks.map((t) => (
              <option key={t.taskId} value={t.taskId}>
                {t.summary || typeLabels[t.type] || t.type} ·{' '}
                {new Date(
                  t.completedAt || t.submittedAt,
                ).toLocaleString('zh-CN')}
              </option>
            ))}
          </select>
        )}
      </FormField>

      {previewLoading && (
        <div className="glass-light rounded-xl p-4 animate-pulse h-24" />
      )}
      {preview && !previewLoading && (
        <div className="bg-white/40 backdrop-blur-sm rounded-xl border border-purple-200/50 p-4">
          <h4 className="text-sm font-medium text-purple-900 mb-2">
            已选行程预览
          </h4>
          {preview.summary && (
            <p className="text-sm text-purple-800 mb-1">
              <span className="font-medium">摘要：</span>
              {preview.summary}
            </p>
          )}
          {preview.days && (
            <p className="text-sm text-purple-800 mb-1">
              <span className="font-medium">天数：</span>
              {preview.days.length} 天
            </p>
          )}
          {preview.estimatedBudget && (
            <p className="text-sm text-purple-800">
              <span className="font-medium">预估预算：</span>
              {preview.estimatedBudget}
            </p>
          )}
        </div>
      )}

      <FormField
        label="优化目标"
        icon={<Sparkles />}
        required
        focusRingClass="field-wrap--purple"
      >
        <select
          required
          value={form.optimizationGoal}
          onChange={(e) =>
            setForm((p) => ({ ...p, optimizationGoal: e.target.value }))
          }
        >
          <option value="">请选择目标...</option>
          <option value="降低预算">降低预算</option>
          <option value="减少奔波">减少奔波</option>
          <option value="增加亲子友好">增加亲子友好</option>
          <option value="增加美食体验">增加美食体验</option>
          <option value="增加文化体验">增加文化体验</option>
          <option value="压缩行程">压缩行程</option>
          <option value="延长行程">延长行程</option>
        </select>
      </FormField>

      <FormField
        label="额外限制"
        hint="选填"
        icon={<MessageSquare />}
        focusRingClass="field-wrap--purple"
      >
        <input
          type="text"
          value={form.constraints}
          onChange={(e) =>
            setForm((p) => ({ ...p, constraints: e.target.value }))
          }
          placeholder="例如：预算不超过3000"
        />
      </FormField>

      <button
        type="submit"
        disabled={loading || submissionDisabled || !form.currentItinerary}
        title={submissionDisabled ? '请先重新检测 AI 规划服务' : undefined}
        className="button-primary w-full px-4"
      >
        {loading ? '提交中...' : submissionDisabled ? 'AI 服务暂不可用' : '开始优化行程'}
      </button>
    </form>
  );
}
