'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

type FeedbackTone = 'success' | 'error' | 'info';

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ToastMessage {
  id: number;
  message: string;
  tone: FeedbackTone;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (accepted: boolean) => void;
}

interface FeedbackContextValue {
  notify: (message: string, tone?: FeedbackTone) => void;
  confirmAction: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const toneStyle: Record<FeedbackTone, string> = {
  success: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-primary-200 bg-primary-50 text-primary-900',
};

const toneIcon = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

/** 提供统一的非阻塞反馈与可访问确认对话框，避免浏览器原生弹窗割裂应用体验。 */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const nextToastId = useRef(1);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message: string, tone: FeedbackTone = 'info') => {
    const id = nextToastId.current++;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => dismissToast(id), 4_500);
  }, [dismissToast]);

  const confirmAction = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setPendingConfirm({ options, resolve });
  }), []);

  const finishConfirm = useCallback((accepted: boolean) => {
    setPendingConfirm((current) => {
      current?.resolve(accepted);
      return null;
    });
    window.requestAnimationFrame(() => previousFocusRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!pendingConfirm) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finishConfirm(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [finishConfirm, pendingConfirm]);

  return (
    <FeedbackContext.Provider value={{ notify, confirmAction }}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-[70] mx-auto flex max-w-md flex-col gap-2 px-3 sm:top-5"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => {
          const Icon = toneIcon[toast.tone];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-card ${toneStyle[toast.tone]}`}
              role={toast.tone === 'error' ? 'alert' : 'status'}
            >
              <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1 text-sm leading-5">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="grid min-h-8 min-w-8 place-items-center rounded-lg opacity-70 hover:bg-white/60 hover:opacity-100"
                aria-label="关闭提示"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {pendingConfirm && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-gray-950/35 px-4 py-8 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) finishConfirm(false);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-confirm-title"
            aria-describedby="app-confirm-description"
            className="glass-strong w-full max-w-sm rounded-2xl p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                pendingConfirm.options.danger
                  ? 'bg-red-50 text-red-700'
                  : 'bg-primary-50 text-primary-700'
              }`}>
                {pendingConfirm.options.danger
                  ? <AlertTriangle aria-hidden="true" className="h-5 w-5" />
                  : <Info aria-hidden="true" className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <h2 id="app-confirm-title" className="text-lg font-bold text-gray-950">
                  {pendingConfirm.options.title}
                </h2>
                <p id="app-confirm-description" className="mt-1.5 text-sm leading-6 text-gray-600">
                  {pendingConfirm.options.description}
                </p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => finishConfirm(false)}
                className="button-secondary px-4"
              >
                {pendingConfirm.options.cancelLabel ?? '取消'}
              </button>
              <button
                type="button"
                onClick={() => finishConfirm(true)}
                className={pendingConfirm.options.danger
                  ? 'inline-flex min-h-12 items-center justify-center rounded-xl bg-red-700 px-4 text-sm font-bold text-white transition-colors hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700'
                  : 'button-primary px-4'}
              >
                {pendingConfirm.options.confirmLabel ?? '确认'}
              </button>
            </div>
          </section>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useAppFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useAppFeedback 必须在 FeedbackProvider 内使用');
  return context;
}
