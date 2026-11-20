/**
 * Cubyntra - Block Link
 * Necookie Labs (c) 2026
 *
 * A link that looks like a BlockButton, for actions that go to another screen.
 */

import React from 'react';
import Link from 'next/link';
import {
  BLOCK_BUTTON_BASE,
  BLOCK_BUTTON_SIZE,
  cx,
  type BlockButtonSize,
  type BlockButtonVariant,
} from '@/components/ui';

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
      className={cx(BLOCK_BUTTON_BASE, BLOCK_BUTTON_SIZE[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {icon}
      {children}
    </Link>
  );
}
