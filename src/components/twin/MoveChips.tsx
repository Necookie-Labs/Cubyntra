'use client';

/**
 * Cubyntra - Move Chips
 * Necookie Labs (c) 2026
 *
 * One chip per move of an algorithm. The current move is highlighted, finished moves are dimmed
 * and each chip is named in plain language for screen readers ("Turn the right side up"). An
 * optional toggle spells out the current move in words under the row.
 */

import React, { useState } from 'react';
import type { Move } from '@/cube/types';
import { moveName } from '@/cube/moveNames';
import { BlockButton, cx } from '@/components/ui';

export type MoveChipState = 'done' | 'current' | 'upcoming';

/** Done before `current`, current at `current`, upcoming after. */
export function moveChipState(index: number, current: number): MoveChipState {
  if (index < current) return 'done';
  return index === current ? 'current' : 'upcoming';
}

const STATE_CLASS: Record<MoveChipState, string> = {
  // Done chips sit flat and sunk; the current one is a blue face on its edge; upcoming ones are
  // raised like a secondary button.
  done: 'border-line-soft bg-well text-muted',
  current: 'border-primary border-b-primary-edge bg-primary text-on-primary shadow-[inset_0_-2px_0_0_var(--vx-primary-edge)]',
  upcoming: 'border-line-soft border-b-raised-edge bg-raised text-ink shadow-[inset_0_-2px_0_0_var(--vx-raised-edge)]',
};

export interface MoveChipsProps {
  moves: readonly Move[];
  /**
   * The move in focus: the one animating, or the next one to play. `moves.length` means every
   * move is done.
   */
  current: number;
  /** Makes each chip a button (e.g. to seek to just before that move). */
  onSelect?: (index: number) => void;
  /** Shows the "In words" toggle. Default true. */
  plainLanguageToggle?: boolean;
  /** Whether the words are shown at first. */
  defaultPlainLanguage?: boolean;
  className?: string;
}

export const MoveChips: React.FC<MoveChipsProps> = ({
  moves,
  current,
  onSelect,
  plainLanguageToggle = true,
  defaultPlainLanguage = false,
  className,
}) => {
  const [plain, setPlain] = useState(defaultPlainLanguage);
  const focus = moves[current];

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <ol aria-label="Moves" className="flex flex-wrap gap-2">
        {moves.map((move, i) => {
          const state = moveChipState(i, current);
          const name = moveName(move);
          const chipClass = cx(
            'inline-flex h-9 min-w-10 items-center justify-center rounded-md border-2 px-2.5 pb-0.5 font-mono text-sm font-bold',
            STATE_CLASS[state]
          );
          const common = {
            'aria-label': name,
            'aria-current': state === 'current' ? ('step' as const) : undefined,
            'data-state': state,
            title: name,
          };
          return onSelect ? (
            <li key={i}>
              <button type="button" className={cx(chipClass, 'vx-hit')} onClick={() => onSelect(i)} {...common}>
                {move.notation}
              </button>
            </li>
          ) : (
            <li key={i} className={chipClass} {...common}>
              {move.notation}
            </li>
          );
        })}
      </ol>

      {plainLanguageToggle && (
        <div className="flex flex-wrap items-center gap-2">
          <BlockButton size="sm" variant="ghost" aria-pressed={plain} onClick={() => setPlain((p) => !p)}>
            In words
          </BlockButton>
          {plain && (
            <p aria-live="polite" className="text-sm font-bold text-ink">
              {focus ? moveName(focus) : 'All moves done'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
