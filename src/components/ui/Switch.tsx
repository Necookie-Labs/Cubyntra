/**
 * Cubyntra - Switch
 * Necookie Labs (c) 2026
 *
 * An on/off setting: a labelled row with a rounded track and a white knob standing on a small
 * edge. role="switch" with aria-checked, so it is announced as a switch; the label and an
 * optional hint name and describe it.
 */

import React, { useId } from 'react';
import { cx } from './cx';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  /** One line under the label; also the switch's accessible description. */
  hint?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, hint, disabled, className }) => {
  const labelId = useId();
  const hintId = useId();
  const switchId = useId();
  return (
    <div className={cx('flex items-center justify-between gap-4', className)}>
      <div className="min-w-0">
        {/* A real label: clicking the words toggles the switch, as people expect. */}
        <label id={labelId} htmlFor={switchId} className={cx('block text-sm font-bold text-ink', !disabled && 'cursor-pointer')}>
          {label}
        </label>
        {hint && (
          <div id={hintId} className="mt-0.5 text-xs text-muted">
            {hint}
          </div>
        )}
      </div>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'vx-hit relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 p-0.5 transition-colors duration-150',
          checked ? 'border-primary-edge bg-primary' : 'border-line bg-well',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        {/* The knob is white in both themes (on-primary), on a 2px raised edge. */}
        <span
          aria-hidden
          className={cx(
            'block h-6 w-6 rounded-full bg-on-primary shadow-[inset_0_-2px_0_0_var(--vx-raised-edge)] transition-transform duration-150 ease-press',
            checked ? 'translate-x-6' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
};
