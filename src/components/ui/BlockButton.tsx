/**
 * Cubyntra - Block Button
 * Necookie Labs (c) 2026
 *
 * A voxel block: flat face, light top lip, darker bottom edge. Pressing sinks it 2px and
 * shrinks the bottom edge (see .vx-block in globals.css).
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

// Heights sit on the 8px grid. The extra bottom padding keeps the label centred on the
// face rather than on the face plus its 4px bottom edge.
const SIZE: Record<BlockButtonSize, string> = {
  sm: 'h-8 px-3 pb-0.5 text-xs gap-1.5',
  md: 'h-10 px-4 pb-1 text-sm gap-2',
  lg: 'h-12 px-6 pb-1 text-base gap-2',
};

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
    className={cx(
      'vx-block inline-flex shrink-0 items-center justify-center font-bold whitespace-nowrap select-none',
      SIZE[size],
      fullWidth && 'w-full',
      className
    )}
    {...rest}
  >
    {icon}
    {children}
  </button>
);
