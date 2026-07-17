'use client';

import { useState } from 'react';
import {
  MapPin,
  Navigation,
  CalendarClock,
  CalendarDays,
  Users,
  MessageSquare,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { GenerateRequest } from '@/types';
import { FormField } from './FormField';
import { StepIndicator } from './StepIndicator';
import { DestinationAutocomplete } from './DestinationAutocomplete';
import { BudgetChips } from './BudgetChips';
import { PreferenceTags } from './PreferenceTags';
import { DATE_SHORTCUTS, resolveShortcut } from '@/lib/date';
import { usePersistentDraft } from '@/hooks/usePersistentDraft';

interface Props {
  onSubmit: (data: GenerateRequest) => Promise<boolean>;
  loading: boolean;
  submissionDisabled?: boolean;
}

const STEPS = [
  { title: '去哪' },
  { title: '怎么走' },
  { title: '个性化' },
];

const INITIAL_FORM: GenerateRequest = {
  departureLocation: '',
  departureTime: '',
  destination: '',
  days: 3,
  peopleCount: 2,
  budget: '',
  preferences: [],
  specialRequirements: '',
};

export function TaskForm({ onSubmit, loading, submissionDisabled = false }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm, clearDraft] = usePersistentDraft<GenerateRequest>(
    'planner-generate-v1',
    INITIAL_FORM,
  );

  const update = (field: keyof GenerateRequest, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const step1Valid =
    form.departureLocation.trim() !== '' && form.destination.trim() !== '';
  const step2Valid = form.days >= 1 && form.peopleCount >= 1;
  const canGoNext = (step === 1 && step1Valid) || (step === 2 && step2Valid);

  const handleNext = () => {
    if (canGoNext) setStep((s) => Math.min(3, s + 1) as 1 | 2 | 3);
  };

  const handlePrev = () => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3);

  /** 二次确认后立即提交，由父组件的 loading 状态防止重复请求。 */
  const handleConfirmSubmit = async () => {
    const submitted = await onSubmit(form);
    if (submitted) {
      clearDraft();
      setStep(1);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 任何进行中/等待中状态都阻止再次提交
    if (loading || submissionDisabled || showConfirm) return;
    // 非最终 step 时, 拦截 submit 事件(如按 Enter)并前进到下一步,
    // 避免用户在 step1/step2 按 Enter 直接触发任务提交, 跳过个性化选择
    if (!isFinalStep) {
      handleNext();
      return;
    }
    setShowConfirm(true);
  };

  /**
   * 拦截 form 级别 Enter 键.
   * 非最终 step 时, 浏览器对 type="button" 的按钮不会触发表单 submit,
   * 但部分浏览器/输入框仍会触发. 统一在 keydown 层拦截, 确保行为一致.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    // 最终 step 由 handleSubmit 处理(弹出确认框), 这里只拦截非最终 step
    if (!isFinalStep) {
      e.preventDefault();
      handleNext();
    }
  };

  // 二次确认弹层
  const [showConfirm, setShowConfirm] = useState(false);
  const closeConfirm = () => setShowConfirm(false);
  const confirmAndSubmit = () => {
    if (submissionDisabled) return;
    setShowConfirm(false);
    void handleConfirmSubmit();
  };

  const showBack = step > 1;
  const isFinalStep = step === 3;

  const preferencesCount = form.preferences?.length ?? 0;
  const submitLabel = (() => {
    if (loading) return '提交中...';
    if (submissionDisabled) return 'AI 服务暂不可用';
    const base = '开始生成行程';
    return preferencesCount > 0
      ? `${base} · 已选 ${preferencesCount} 项偏好`
      : base;
  })();

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
      <StepIndicator steps={STEPS} current={step} />

      <div className="step-enter space-y-4" key={step}>
        {step === 1 && (
          <>
            <FormField label="出发地" icon={<MapPin />} required>
              <input
                type="text"
                required
                value={form.departureLocation}
                onChange={(e) => update('departureLocation', e.target.value)}
                placeholder={'例如：北京'}
              />
            </FormField>

            <FormField label="目的地" icon={<Navigation />} required>
              <DestinationAutocomplete
                value={form.destination}
                onChange={(v) => update('destination', v)}
              />
            </FormField>

            <FormField label="出发时间" icon={<CalendarClock />} required>
              <input
                type="datetime-local"
                required
                value={form.departureTime}
                onChange={(e) =>
                  update('departureTime', e.target.value.replace('T', ' ') + ':00')
                }
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              {DATE_SHORTCUTS.map((sc) => (
                <button
                  key={sc.key}
                  type="button"
                  onClick={() => update('departureTime', resolveShortcut(sc.key))}
                  className="tag"
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="天数" icon={<CalendarDays />} required>
                <input
                  type="number"
                  required
                  min={1}
                  value={form.days}
                  onChange={(e) =>
                    update('days', parseInt(e.target.value) || 1)
                  }
                />
              </FormField>
              <FormField label="人数" icon={<Users />} required>
                <input
                  type="number"
                  required
                  min={1}
                  value={form.peopleCount}
                  onChange={(e) =>
                    update('peopleCount', parseInt(e.target.value) || 1)
                  }
                />
              </FormField>
            </div>
            <BudgetChips
              value={form.budget}
              onChange={(v) => update('budget', v)}
            />
          </>
        )}

        {step === 3 && (
          <>
            <PreferenceTags
              value={form.preferences ?? []}
              onChange={(v) => update('preferences', v)}
            />
            <FormField label="特殊要求" icon={<MessageSquare />}>
              <textarea
                value={form.specialRequirements}
                onChange={(e) =>
                  update('specialRequirements', e.target.value)
                }
                rows={2}
                placeholder={'例如：素食、轮椅通道'}
              />
            </FormField>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-5">
        {showBack ? (
          <button
            type="button"
            onClick={handlePrev}
            className="px-5 py-2.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            ← 上一步
          </button>
        ) : (
          <div />
        )}

        {isFinalStep ? (
          <button
            type="submit"
            disabled={loading || submissionDisabled}
            title={submissionDisabled ? '请先重新检测 AI 规划服务' : undefined}
            className="button-primary flex-1 gap-2 py-3 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              // 阻止默认行为, 避免 React 重渲染后按钮 type 从 button 变为 submit
              // 导致浏览器重新触发表单提交(Chromium 已知行为)
              e.preventDefault();
              handleNext();
            }}
            disabled={!canGoNext}
            className="button-primary flex-1 py-3 disabled:active:scale-100"
          >
            下一步 →
          </button>
        )}
      </div>

      {/* 二次确认弹层 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">确认提交行程规划？</h3>
                <p className="text-xs text-gray-500 mt-0.5">提交后将进入 AI 生成队列，请稍候</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">出发地</span>
                <span className="font-medium text-gray-900">{form.departureLocation}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">目的地</span>
                <span className="font-medium text-gray-900">{form.destination}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">出发时间</span>
                <span className="font-medium text-gray-900">
                  {form.departureTime.replace('T', ' ').replace(/:00$/, '') || '未设置'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">行程天数</span>
                <span className="font-medium text-gray-900">{form.days} 天</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={closeConfirm}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmAndSubmit}
                disabled={loading || submissionDisabled}
                className="button-primary min-h-0 flex-1 py-2.5"
              >
                {submissionDisabled ? 'AI 服务暂不可用' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
