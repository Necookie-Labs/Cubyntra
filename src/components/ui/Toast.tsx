'use client';

/**
 * Cubyntra - Toast
 * Necookie Labs (c) 2026
 *
 * A short message card that drops in at the bottom of the screen. It is a live region
 * (danger: alert, otherwise status) and dismisses itself after `duration` ms.
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cx } from './cx';
import { IconButton } from './IconButton';

export type ToastTone = 'info' | 'success' | 'warn' | 'danger';

export interface ToastProps {
  open: boolean;
  onDismiss: () => void;
  tone?: ToastTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Auto-dismiss delay in ms; 0 keeps it until dismissed. */
  duration?: number;
  /** Optional action, e.g. a BlockButton. */
  action?: React.ReactNode;
}

const TONE: Record<ToastTone, { badge: string; Icon: typeof Info }> = {
  info: { badge: 'bg-primary-soft text-ink', Icon: Info },
  success: { badge: 'bg-success text-on-success', Icon: CheckCircle2 },
  warn: { badge: 'bg-warn text-on-warn', Icon: AlertTriangle },
  danger: { badge: 'bg-danger text-on-danger', Icon: AlertTriangle },
};

export const Toast: React.FC<ToastProps> = ({
  open,
  onDismiss,
  tone = 'info',
  title,
  children,
  duration = 5000,
  action,
}) => {
  // Latest callback without restarting the timer on every parent render.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open || duration <= 0) return;
    const timer = window.setTimeout(() => dismissRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [open, duration]);

  if (!open || typeof document === 'undefined') return null;

  const { badge, Icon } = TONE[tone];
  return createPortal(
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      className="vx-panel vx-place fixed bottom-4 left-4 right-4 z-[60] mx-auto flex max-w-md items-start gap-3 p-3 sm:left-auto sm:right-6 sm:bottom-6"
    >
      <div aria-hidden className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', badge)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 py-1 text-sm">
        {title && <div className="font-bold text-ink">{title}</div>}
        {children && <div className="text-muted">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      <IconButton label="Dismiss" variant="ghost" size="sm" onClick={onDismiss}>
        <X className="h-4 w-4" />
      </IconButton>
    </div>,
    document.body
  );
};
