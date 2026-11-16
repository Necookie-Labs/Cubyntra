/**
 * Cubyntra - Icon Button
 * Necookie Labs (c) 2026
 *
 * A square block holding only an icon. An icon alone has no accessible name, so `label` is
 * required: it becomes the aria-label and the tooltip.
 */

import React from 'react';
import { cx } from './cx';
import type { BlockButtonVariant } from './BlockButton';

export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Accessible name, read by screen readers and shown as the tooltip. */
  label: string;
  /** The icon (decorative; hidden from assistive technology). */
  children: React.ReactNode;
  variant?: BlockButtonVariant;
  size?: IconButtonSize;
  ref?: React.Ref<HTMLButtonElement>;
}

const SIZE: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8 pb-0.5',
  md: 'h-10 w-10 pb-1',
  lg: 'h-12 w-12 pb-1',
};

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  children,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  title,
  className,
  ...rest
}) => {
  if (typeof label !== 'string' || label.trim() === '') {
    throw new Error('IconButton needs a non-empty label for its accessible name.');
  }
  return (
    <button
      type={type}
      data-variant={variant}
      aria-label={label}
      title={title ?? label}
      className={cx('vx-block inline-flex shrink-0 items-center justify-center select-none', SIZE[size], className)}
      {...rest}
    >
      <span aria-hidden className="inline-flex">
        {children}
      </span>
    </button>
  );
};
