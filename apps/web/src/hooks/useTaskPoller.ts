'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskDetail } from '@/types';
import { TaskStatus } from '@/types';
import { fetchTaskStatus } from '@/lib/api';

interface UseTaskPollerResult {
  task: TaskDetail | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/** 轮询上限：超过此间隔后不再继续增大（毫秒） */
const MAX_POLL_INTERVAL = 10_000;
/** 最大总轮询时长：超过后停止轮询并报超时错误（毫秒） */
const MAX_POLL_DURATION = 5 * 60 * 1000;

/**
 * 任务状态 Hook：优先使用同源 SSE，在连接失败时回退递归 setTimeout 轮询。
 *
 * - No overlapping requests (next poll only after current completes)
 * - Clean teardown on unmount
 * - Retries up to 3 consecutive failures before stopping
 * - Exponential backoff: 2s → 4s → 8s → 10s (上限)
 * - 总轮询超过 5 分钟自动超时，避免无限等待
 */
export function useTaskPoller(
  taskId: string | null,
  interval = 2000,
): UseTaskPollerResult {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const failCountRef = useRef(0);
  const startTimeRef = useRef(0);
  const currentIntervalRef = useRef(interval);

  const retry = useCallback(() => {
    failCountRef.current = 0;
    startTimeRef.current = 0;
    currentIntervalRef.current = interval;
    setError(null);
    setRetryCount((c) => c + 1);
  }, [interval]);

  useEffect(() => {
    if (!taskId) return;

    failCountRef.current = 0;
    startTimeRef.current = Date.now();
    currentIntervalRef.current = interval;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let eventSource: EventSource | null = null;
    let loadPromise: Promise<boolean> | null = null;

    const isTerminal = (data: TaskDetail) => (
      data.status === TaskStatus.COMPLETED
      || data.status === TaskStatus.FAILED
      || data.status === TaskStatus.CANCELLED
    );

    const loadStatus = (): Promise<boolean> => {
      // SSE 事件可能在短时间内连续到达；复用在途请求，避免并发响应乱序覆盖状态。
      if (loadPromise) return loadPromise;
      setLoading(true);
      const request = (async (): Promise<boolean> => {
        try {
          const data = await fetchTaskStatus(taskId);
          // taskId 变化或组件卸载后，旧请求不得回写新任务的状态。
          if (cancelled) return true;
          setTask(data);
          setError(null);
          failCountRef.current = 0;
          return isTerminal(data);
        } catch (e) {
          if (cancelled) return true;
          failCountRef.current++;
          setError(e instanceof Error ? e.message : '请求失败');
          return false;
        } finally {
          loadPromise = null;
          if (!cancelled) setLoading(false);
        }
      })();
      loadPromise = request;
      return request;
    };

    const poll = async () => {
      if (cancelled) return;
      const terminal = await loadStatus();
      if (cancelled || terminal) return;
      if (failCountRef.current < 3) {
        // 检查总轮询时长
        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed >= MAX_POLL_DURATION) {
          setError('任务执行时间较长，已停止自动刷新。请稍后手动刷新或重新提交任务。');
          return;
        }
      }
      if (failCountRef.current >= 3) return;
      // 指数退避：轮询间隔翻倍，不超过上限
      currentIntervalRef.current = Math.min(currentIntervalRef.current * 2, MAX_POLL_INTERVAL);
      timeoutId = setTimeout(poll, currentIntervalRef.current);
    };

    const start = async () => {
      const terminal = await loadStatus();
      if (cancelled || terminal) return;
      if (typeof window.EventSource === 'undefined') {
        timeoutId = setTimeout(poll, currentIntervalRef.current);
        return;
      }

      eventSource = new EventSource(`/api/itineraries/tasks/${taskId}/events`);
      eventSource.addEventListener('task-status', () => {
        void loadStatus().then((done) => {
          if (done) {
            eventSource?.close();
            eventSource = null;
          }
        });
      });
      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
        if (!cancelled) timeoutId = setTimeout(poll, currentIntervalRef.current);
      };
    };

    void start();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      eventSource?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, retryCount]);

  return { task, loading, error, retry };
}
