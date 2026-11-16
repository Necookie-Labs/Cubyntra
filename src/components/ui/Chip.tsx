/**
 * Cubyntra - Chip
 * Necookie Labs (c) 2026
 *
 * A small square tag for status and labels. Text is always ink on a soft tint, so every tone
 * keeps AA contrast; the tone is also carried by the optional icon, not by color alone.
 */

import React from 'react';
import { cx } from './cx';

export type ChipTone = 'neutral' | 'leaf' | 'warn' | 'danger' | 'solid';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  icon?: React.ReactNode;
}

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-well text-ink border-line-soft',
  leaf: 'bg-leaf-soft text-ink border-leaf-edge',
  warn: 'bg-warn-soft text-ink border-warn-edge',
  danger: 'bg-danger-soft text-ink border-danger',
  solid: 'bg-leaf text-on-leaf border-line',
};

export const Chip: React.FC<ChipProps> = ({ tone = 'neutral', icon, className, children, ...rest }) => (
  <span
    className={cx(
      'inline-flex h-6 items-center gap-1 border-2 px-2 text-xs font-bold whitespace-nowrap',
      TONE[tone],
      className
    )}
    {...rest}
  >
    {icon}
    {children}
  </span>
);
