/**
 * Cubyntra - Segmented Control
 * Necookie Labs (c) 2026
 *
 * A row of block buttons where exactly one is chosen: a radiogroup. Arrow keys move the
 * choice (roving tabindex), so the whole group is one Tab stop.
 */

import React, { useRef } from 'react';
import { cx } from './cx';

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!forward && !back) return;
    e.preventDefault();
    const next = (index + (forward ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cx('flex gap-2', className)}>
      {options.map((option, i) => {
        const active = i === index;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-variant={active ? 'primary' : 'secondary'}
            onClick={() => onChange(option.value)}
            className="vx-block inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 px-3 pb-1 text-sm font-bold"
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
