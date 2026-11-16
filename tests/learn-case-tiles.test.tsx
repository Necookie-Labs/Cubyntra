// @vitest-environment jsdom
/**
 * Cubyntra - Trainer case tiles: state in words and in the fill level, not color alone
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { CaseLegend, CaseTiles } from '@/components/learn/CaseTiles';
import type { TrainerCard } from '@/learn/types';

afterEach(cleanup);

const cases = [
  { id: 'a', name: 'Case A' },
  { id: 'b', name: 'Case B' },
  { id: 'c', name: 'Case C' },
  { id: 'd', name: 'Case D' },
];
const cards: Record<string, TrainerCard> = {
  b: { box: 1, due: 0, seen: 1, missed: 1 },
  c: { box: 3, due: 0, seen: 3, missed: 0 },
  d: { box: 5, due: 0, seen: 6, missed: 0 },
};

describe('CaseTiles', () => {
  it('names each state and fills a drilling tile halfway', () => {
    render(<CaseTiles cases={cases} cards={cards} label="Cases" />);
    const tiles = within(screen.getByRole('list', { name: 'Cases' })).getAllByRole('img');
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'Case A: not drilled yet',
      'Case B: drilling',
      'Case C: learned',
      'Case D: known well',
    ]);
    expect(tiles.map((t) => t.querySelector('[data-fill="half"]') !== null)).toEqual([false, true, false, false]);
  });

  it('shows the same fill in the key', () => {
    render(<CaseLegend />);
    const key = screen.getByRole('list', { name: 'Key' });
    expect(within(key).getByText('drilling').parentElement!.querySelector('[data-fill="half"]')).not.toBeNull();
  });
});
