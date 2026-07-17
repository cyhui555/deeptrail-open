'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookHeart,
  CheckCircle2,
  LoaderCircle,
  Pencil,
  Save,
  Sparkles,
} from 'lucide-react';
import { StarRating } from '@/components/StarRating';
import { TripsSubNav } from '@/components/TripsSubNav';
import { useAppFeedback } from '@/components/FeedbackProvider';
import { getReview, submitReview, updateSummary } from '@/lib/api';
import type { JourneyReview } from '@/types';

/** 旅行回忆页：收集评价，并允许用户校订 AI 生成的旅程总结。 */
export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.planId as string;
  const [review, setReview] = useState<JourneyReview | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);
  const { notify } = useAppFeedback();

  const loadReview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReview(planId);
      setReview(data);
      if (data) {
        setRating(data.rating);
        setComment(data.userComment || '');
        setSummary(data.aiSummary || '');
      }
    } catch {
      notify('旅行回忆加载失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify, planId]);

  useEffect(() => {
    if (planId) void loadReview();
    return () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    };
  }, [loadReview, planId]);

  const handleSubmit = async () => {
    if (rating === 0) {
      notify('请先选择整体评分', 'info');
      return;
    }
    setSubmitting(true);
    try {
      await submitReview(planId, { rating, comment });
      notify('评价已保存，正在整理旅行总结', 'success');
      refreshTimerRef.current = window.setTimeout(() => void loadReview(), 3_000);
    } catch (error) {
      notify(error instanceof Error ? error.message : '评价提交失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSummary = async () => {
    setSubmitting(true);
    try {
      await updateSummary(planId, summary);
      setEditing(false);
      notify('旅行总结已保存', 'success');
      await loadReview();
    } catch (error) {
      notify(error instanceof Error ? error.message : '总结保存失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-label="正在加载旅行回忆">
        <div className="h-10 w-24 animate-pulse rounded-xl bg-primary-100" />
        <div className="glass-light h-72 animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-5">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        返回
      </button>

      <TripsSubNav planId={planId} active="review" />

      <section className="glass-strong overflow-hidden rounded-2xl shadow-card">
        <header className="border-b border-white/70 bg-gradient-to-br from-primary-50/85 to-transparent p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-700 text-white shadow-sm">
              <BookHeart aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-black tracking-tight text-gray-950">旅行回忆</h1>
              <p className="mt-1 text-sm leading-6 text-gray-600">留下感受，整理这次旅行真正值得记住的部分。</p>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-5 sm:p-6">
          {review ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-100 bg-primary-50/55 px-4 py-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">整体评分</p>
                  <div className="mt-1"><StarRating value={review.rating} readonly /></div>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-bold text-green-700">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> 已完成
                </span>
              </div>

              {review.userComment && (
                <div>
                  <h2 className="text-sm font-bold text-gray-950">我的评价</h2>
                  <p className="mt-2 whitespace-pre-wrap rounded-xl bg-white/65 px-4 py-3 text-sm leading-6 text-gray-700">
                    {review.userComment}
                  </p>
                </div>
              )}

              {review.aiSummary && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-gray-950">
                      <Sparkles aria-hidden="true" className="h-4 w-4 text-primary-700" />
                      旅行总结{review.summaryEdited ? '（已校订）' : ''}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setEditing((current) => !current)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-primary-700 hover:bg-primary-50"
                    >
                      <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                      {editing ? '取消编辑' : '编辑'}
                    </button>
                  </div>
                  {editing ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={summary}
                        onChange={(event) => setSummary(event.target.value)}
                        className="auth-input block min-h-36 resize-y"
                        rows={6}
                        aria-label="旅行总结"
                      />
                      <button type="button" onClick={() => void handleSaveSummary()} disabled={submitting} className="button-primary gap-2 px-4">
                        {submitting
                          ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                          : <Save aria-hidden="true" className="h-4 w-4" />}
                        保存总结
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap rounded-xl bg-white/65 px-4 py-3 text-sm leading-6 text-gray-700">
                      {review.aiSummary}
                    </p>
                  )}
                </div>
              )}

              {review.poiCoverage && (
                <p className="text-sm text-gray-500">地点完成率：{review.poiCoverage}</p>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-900">这次旅行怎么样？</label>
                <StarRating value={rating} onChange={setRating} size="lg" />
              </div>
              <div>
                <label htmlFor="journey-comment" className="mb-1.5 block text-sm font-bold text-gray-900">
                  留下一段感受 <span className="font-normal text-gray-400">（选填）</span>
                </label>
                <textarea
                  id="journey-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="发生了什么、最喜欢哪里、下次会怎么走……"
                  className="auth-input block min-h-28 resize-y"
                  rows={4}
                  maxLength={2000}
                />
              </div>
              <button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="button-primary w-full gap-2 px-4 sm:w-auto">
                {submitting && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}
                {submitting ? '正在保存…' : '完成这次旅行'}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
