/**
 * Cubyntra - Page scaffolding
 * Necookie Labs (c) 2026
 *
 * Every screen starts the same way: an optional small label, one pixel-font heading and at
 * most one line of plain text, on the 8px grid.
 */

import React from 'react';
import { cx } from '@/components/ui';

export function PageContainer({
  children,
  width = 'md',
  className,
}: {
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const max = { md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[width];
  return <div className={cx('mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10', max, className)}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  titleId,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  titleId?: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow && <p className="text-xs font-bold tracking-wide text-muted">{eyebrow}</p>}
        <h1 id={titleId} className="text-3xl leading-none text-ink sm:text-4xl">
          {title}
        </h1>
        {lede && <p className="max-w-prose text-base leading-relaxed text-muted">{lede}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A section inside a page: a small heading and its content. */
export function PageSection({
  title,
  children,
  className,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  aside?: React.ReactNode;
}) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={cx('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-lg leading-tight text-ink">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The flat busy indicator with a status message. */
export function Busy({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <span aria-hidden className="vx-loader">
        <span />
        <span />
        <span />
      </span>
      <p className="text-sm font-bold text-muted">{label}</p>
    </div>
  );
}
