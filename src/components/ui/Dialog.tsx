'use client';

/**
 * Cubyntra - Dialog
 * Necookie Labs (c) 2026
 *
 * A modal panel over a flat scrim. role="dialog" with aria-modal and a labelled title;
 * focus moves in on open, Tab is trapped inside, Escape closes, and focus returns to the
 * element that opened it.
 */

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from './cx';
import { IconButton } from './IconButton';
import { trapTab } from './focus';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** One line under the title; also the dialog's accessible description. */
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Actions row at the bottom. */
  footer?: React.ReactNode;
  /** Element to focus on open; defaults to an enabled [data-autofocus] child, else the dialog itself. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Icon block shown before the title. */
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Close when the scrim is clicked (default true). */
  dismissOnScrim?: boolean;
  className?: string;
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocusRef,
  icon,
  size = 'md',
  dismissOnScrim = true,
  className,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus in on open and give it back on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    // A disabled target (a camera button waiting for the camera) cannot take focus: the
    // dialog itself takes it then, so focus never stays behind the scrim.
    const target =
      initialFocusRef?.current ??
      panel?.querySelector<HTMLElement>('[data-autofocus]:not(:disabled)') ??
      panel;
    target?.focus();
    return () => {
      if (previous && previous.isConnected) previous.focus();
    };
  }, [open, initialFocusRef]);

  if (!open || typeof document === 'undefined') return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (trapTab(e, panelRef.current)) e.preventDefault();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden
        data-testid="dialog-scrim"
        className="absolute inset-0 bg-scrim"
        onClick={dismissOnScrim ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cx(
          'vx-panel vx-place relative flex max-h-[90vh] w-full flex-col gap-4 p-6 pb-7 outline-none',
          WIDTH[size],
          className
        )}
      >
        <div className="flex shrink-0 items-start gap-3">
          {icon && (
            <div aria-hidden className="vx-block flex h-10 w-10 shrink-0 items-center justify-center pb-1" data-variant="primary">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xl leading-tight text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close" variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        {/* Only the body scrolls, so the title and the actions stay in view on a short screen. */}
        <div data-testid="dialog-body" className="-m-1 flex min-h-0 flex-col gap-4 overflow-y-auto p-1">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t-2 border-line-soft pt-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
};
