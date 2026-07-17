'use client';

import { ErrorAlert } from '@/components/ErrorAlert';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="glass-strong space-y-4 rounded-2xl p-6">
      <ErrorAlert message={error.message || '发生了意外错误'} />
      <button
        onClick={reset}
        className="button-primary px-5"
      >
        重试
      </button>
    </div>
  );
}
