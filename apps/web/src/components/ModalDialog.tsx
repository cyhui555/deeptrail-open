'use client';

import { useEffect, useRef } from 'react';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  dismissDisabled?: boolean;
  overlayClassName?: string;
  panelClassName?: string;
  children: React.ReactNode;
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * 通用模态对话框骨架。
 *
 * 对话框打开后将焦点限制在面板内，并在关闭时归还给原触发元素，
 * 避免键盘用户误操作到被遮罩覆盖的页面内容。
 */
export function ModalDialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  dismissDisabled = false,
  overlayClassName = '',
  panelClassName = '',
  children,
}: ModalDialogProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const dismissDisabledRef = useRef(dismissDisabled);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    dismissDisabledRef.current = dismissDisabled;
  }, [dismissDisabled]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusInitialElement = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const initial = panel.querySelector<HTMLElement>('[data-autofocus]')
        ?? panel.querySelector<HTMLElement>(focusableSelector)
        ?? panel;
      initial.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;

      if (event.key === 'Escape' && !dismissDisabledRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusInitialElement);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm ${overlayClassName}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !dismissDisabled) onClose();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`w-full rounded-2xl bg-white shadow-xl outline-none ${panelClassName}`}
      >
        {children}
      </section>
    </div>
  );
}
