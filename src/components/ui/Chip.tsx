/**
 * Cubyntra - Chip
 * Necookie Labs (c) 2026
 *
 * A small pill for status and labels. Soft tones are ink on a tint, the solid tones carry
 * their own on-color, so every tone keeps AA contrast; the tone is also carried by the
 * optional icon, not by color alone. `accent` is the teal brand pill.
 */

import React from 'react';
import { cx } from './cx';

export type ChipTone = 'neutral' | 'success' | 'warn' | 'danger' | 'solid' | 'accent';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  icon?: React.ReactNode;
}

const TONE: Record<ChipTone, string> = {
  neutral: 'border-line-soft bg-well text-ink',
  success: 'border-success-edge bg-success-soft text-ink',
  warn: 'border-warn-edge bg-warn-soft text-ink',
  danger: 'border-danger bg-danger-soft text-ink',
  solid: 'border-primary-edge bg-primary text-on-primary',
  accent: 'border-accent-edge bg-accent text-on-accent',
};

export const Chip: React.FC<ChipProps> = ({ tone = 'neutral', icon, className, children, ...rest }) => (
  <span
    className={cx(
      'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs font-bold whitespace-nowrap',
      TONE[tone],
      className
    )}
    {...rest}
  >
    {icon}
    {children}
  </span>
);
