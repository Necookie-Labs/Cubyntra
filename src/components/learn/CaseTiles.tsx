/**
 * Cubyntra - Case tiles
 * Necookie Labs (c) 2026
 *
 * One small square per case of a trainer set, filled by how well the case is known: an empty
 * well (never drilled), half full (drilling), full leaf (learned: box 3 or more) and full leaf
 * with a dark base (box 5). The fill level shows the state without relying on color, and each
 * tile's name says it in words.
 * With `onSelect` the tiles are buttons that pick the case to drill.
 */

import React from 'react';
import { cx } from '@/components/ui';
import { LEARNED_BOX } from '@/learn/leitner';
import { MAX_BOX, type TrainerCard } from '@/learn/types';

export type CaseLevel = 'new' | 'drilling' | 'learned' | 'solid';

export function caseLevel(card: TrainerCard | undefined): CaseLevel {
  if (!card) return 'new';
  if (card.box >= MAX_BOX) return 'solid';
  return card.box >= LEARNED_BOX ? 'learned' : 'drilling';
}

const LEVEL_CLASS: Record<CaseLevel, string> = {
  new: 'bg-well border-line-soft',
  drilling: 'bg-leaf-soft border-line',
  learned: 'bg-leaf border-line',
  solid: 'bg-leaf border-line shadow-[inset_0_-3px_0_0_var(--vx-leaf-edge)]',
};

/** A drilling tile is filled halfway: the fill level, not only its tint, tells it from learned. */
function Fill({ level }: { level: CaseLevel }) {
  return level === 'drilling' ? <span aria-hidden data-fill="half" className="block h-1/2 w-full bg-leaf" /> : null;
}

export const LEVEL_WORD: Record<CaseLevel, string> = {
  new: 'not drilled yet',
  drilling: 'drilling',
  learned: 'learned',
  solid: 'known well',
};

export interface CaseTilesProps {
  cases: readonly { id: string; name: string }[];
  cards: Readonly<Record<string, TrainerCard>>;
  label: string;
  /** The case on screen, outlined. */
  currentId?: string | null;
  onSelect?: (caseId: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function CaseTiles({ cases, cards, label, currentId, onSelect, size = 'md', className }: CaseTilesProps) {
  // Buttons grow to 44px on phones (they sit too close to borrow a bigger hit area).
  const box = size === 'sm' ? 'h-3 w-3' : onSelect ? 'h-11 w-11 lg:h-6 lg:w-6' : 'h-6 w-6';
  return (
    <ul aria-label={label} className={cx('flex flex-wrap', size === 'sm' ? 'gap-1' : 'gap-1.5', className)}>
      {cases.map((c) => {
        const level = caseLevel(cards[c.id]);
        const name = `${c.name}: ${LEVEL_WORD[level]}`;
        const tile = cx(
          'flex flex-col justify-end border-2',
          box,
          LEVEL_CLASS[level],
          currentId === c.id && 'outline-2 outline-offset-1 outline-ink'
        );
        return (
          <li key={c.id} data-level={level}>
            {onSelect ? (
              <button
                type="button"
                aria-label={name}
                title={name}
                aria-current={currentId === c.id ? 'true' : undefined}
                className={cx(tile, 'hover:-translate-y-px')}
                onClick={() => onSelect(c.id)}
              >
                <Fill level={level} />
              </button>
            ) : (
              <span role="img" aria-label={name} title={name} className={tile}>
                <Fill level={level} />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The key to the tile colors. */
export function CaseLegend({ className }: { className?: string }) {
  return (
    <ul aria-label="Key" className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted', className)}>
      {(Object.keys(LEVEL_CLASS) as CaseLevel[]).map((level) => (
        <li key={level} className="flex items-center gap-1.5">
          <span aria-hidden className={cx('flex h-3 w-3 flex-col justify-end border-2', LEVEL_CLASS[level])}>
            <Fill level={level} />
          </span>
          {LEVEL_WORD[level]}
        </li>
      ))}
    </ul>
  );
}
