'use client';

import { useState } from 'react';
import { FileText, Link, Hash, Users, MessageSquare } from 'lucide-react';
import type { XiaohongshuRequest } from '@/types';
import { FormField } from './FormField';
import { usePersistentDraft } from '@/hooks/usePersistentDraft';

interface Props {
  onSubmit: (data: XiaohongshuRequest) => Promise<boolean>;
  loading: boolean;
  submissionDisabled?: boolean;
}

export function XiaohongshuForm({ onSubmit, loading, submissionDisabled = false }: Props) {
  const [mode, setMode] = useState<'url' | 'paste'>('paste');
  const [form, setForm, clearDraft] = usePersistentDraft<XiaohongshuRequest>('planner-xiaohongshu-v1', {
    url: '',
    noteContent: '',
    days: undefined,
    peopleCount: undefined,
    specialRequirements: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || submissionDisabled) return;
    const data = { ...form };
    if (mode === 'url') {
      data.noteContent = undefined;
    } else {
      data.url = undefined;
    }
    const submitted = await onSubmit(data);
    if (submitted) clearDraft();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="field-label mb-2">输入方式</label>
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          <button
            type="button"
            onClick={() => setMode('paste')}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              mode === 'paste'
                ? 'bg-primary-700 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            粘贴笔记内容
          </button>
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              mode === 'url'
                ? 'bg-primary-700 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            粘贴笔记链接
          </button>
        </div>
      </div>

      {mode === 'paste' ? (
        <FormField
          label="小红书笔记内容"
          icon={<FileText />}
          required
          focusRingClass="field-wrap--red"
        >
          <textarea
            required
            value={form.noteContent ?? ''}
            onChange={(e) =>
              setForm((p) => ({ ...p, noteContent: e.target.value }))
            }
            rows={6}
            placeholder="直接复制粘贴小红书笔记的正文内容到这里..."
          />
        </FormField>
      ) : (
        <FormField
          label="小红书笔记链接"
          icon={<Link />}
          required
          focusRingClass="field-wrap--red"
        >
          <input
            type="url"
            required
            value={form.url ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
            placeholder="https://www.xiaohongshu.com/explore/xxx 或 https://xhslink.com/xxx"
          />
        </FormField>
      )}

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="天数"
          hint="选填"
          icon={<Hash />}
          focusRingClass="field-wrap--red"
        >
          <input
            type="number"
            min={1}
            value={form.days ?? ''}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                days: e.target.value ? parseInt(e.target.value) : undefined,
              }))
            }
          />
        </FormField>
        <FormField
          label="人数"
          hint="选填"
          icon={<Users />}
          focusRingClass="field-wrap--red"
        >
          <input
            type="number"
            min={1}
            value={form.peopleCount ?? ''}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                peopleCount: e.target.value
                  ? parseInt(e.target.value)
                  : undefined,
              }))
            }
          />
        </FormField>
      </div>

      <FormField
        label="特殊要求"
        hint="选填"
        icon={<MessageSquare />}
        focusRingClass="field-wrap--red"
      >
        <textarea
          value={form.specialRequirements}
          onChange={(e) =>
            setForm((p) => ({ ...p, specialRequirements: e.target.value }))
          }
          rows={2}
        />
      </FormField>

      <button
        type="submit"
        disabled={loading || submissionDisabled}
        title={submissionDisabled ? '请先重新检测 AI 规划服务' : undefined}
        className="button-primary w-full px-4"
      >
        {loading ? '提交中...' : submissionDisabled ? 'AI 服务暂不可用' : '从小红书生成行程'}
      </button>
    </form>
  );
}
