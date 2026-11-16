/**
 * Cubyntra - Block Link
 * Necookie Labs (c) 2026
 *
 * A link that looks like a BlockButton, for actions that go to another screen.
 */

import React from 'react';
import Link from 'next/link';
import { cx, type BlockButtonSize, type BlockButtonVariant } from '@/components/ui';

const SIZE: Record<BlockButtonSize, string> = {
  sm: 'h-8 px-3 pb-0.5 text-xs gap-1.5',
  md: 'h-10 px-4 pb-1 text-sm gap-2',
  lg: 'h-12 px-6 pb-1 text-base gap-2',
};

export interface BlockLinkProps extends Omit<React.ComponentProps<typeof Link>, 'className'> {
  variant?: BlockButtonVariant;
  size?: BlockButtonSize;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}

export function BlockLink({
  variant = 'secondary',
  size = 'md',
  icon,
  fullWidth,
  className,
  children,
  ...rest
}: BlockLinkProps) {
  return (
    <Link
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
    </Link>
  );
}
