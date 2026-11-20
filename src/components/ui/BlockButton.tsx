/**
 * Cubyntra - Block Button
 * Necookie Labs (c) 2026
 *
 * A raised button: a rounded face standing on a solid darker bottom edge. Pressing sinks the
 * face onto its edge (see .vx-block in globals.css, ADR-018).
 */

import React from 'react';
import { cx } from './cx';

export type BlockButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type BlockButtonSize = 'sm' | 'md' | 'lg';

export interface BlockButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BlockButtonVariant;
  size?: BlockButtonSize;
  /** Icon shown before the label. */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

/**
 * Sizes shared by BlockButton and BlockLink. The 2px of extra bottom padding keeps the label
 * centred on the face rather than on the face plus its bottom edge.
 */
export const BLOCK_BUTTON_SIZE: Record<BlockButtonSize, string> = {
  sm: 'h-9 rounded-md px-3.5 pb-0.5 text-sm gap-1.5',
  md: 'h-11 px-5 pb-0.5 text-[15px] gap-2',
  lg: 'h-13 px-7 pb-0.5 text-base gap-2.5',
};

/** The label type every raised button shares: the rounded face, extra bold, a touch of tracking. */
export const BLOCK_BUTTON_BASE =
  'vx-block inline-flex shrink-0 items-center justify-center font-display font-extrabold tracking-wide whitespace-nowrap select-none';

export const BlockButton: React.FC<BlockButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  fullWidth = false,
  type = 'button',
  className,
  children,
  ...rest
}) => (
  <button
    type={type}
    data-variant={variant}
    className={cx(BLOCK_BUTTON_BASE, BLOCK_BUTTON_SIZE[size], fullWidth && 'w-full', className)}
    {...rest}
  >
    {icon}
    {children}
  </button>
);
