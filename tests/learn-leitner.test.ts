/**
 * Cubyntra - Trainer spaced repetition (Leitner boxes counted in drills)
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { BOX_GAP, answerDrill, isLearned, nextCase, reviewCard, setProgress } from '../src/learn/leitner';
import { defaultTrainerState, type TrainerState } from '../src/learn/types';

const IDS = ['a', 'b', 'c', 'd'];

describe('reviewCard', () => {
  it('starts a new case in box 2 when it is got right and box 1 when it is missed', () => {
    expect(reviewCard(undefined, true, 0)).toEqual({ box: 2, due: BOX_GAP[2], seen: 1, missed: 0 });
    expect(reviewCard(undefined, false, 5)).toEqual({ box: 1, due: 5 + BOX_GAP[1], seen: 1, missed: 1 });
  });

  it('moves up one box per right answer, stopping at 5', () => {
    let card = reviewCard(undefined, true, 0);
    for (let turn = 1; turn < 10; turn++) card = reviewCard(card, true, turn);
    expect(card.box).toBe(5);
    expect(card.due).toBe(9 + BOX_GAP[5]);
    expect(card.seen).toBe(10);
  });

  it('sends a missed case back to box 1, whatever box it was in', () => {
    const card = reviewCard({ box: 4, due: 10, seen: 6, missed: 0 }, false, 10);
    expect(card).toEqual({ box: 1, due: 10 + BOX_GAP[1], seen: 7, missed: 1 });
  });

  it('brings missed cases back sooner than known ones', () => {
    for (let box = 1; box < BOX_GAP.length - 1; box++) expect(BOX_GAP[box]).toBeLessThan(BOX_GAP[box + 1]);
  });
});

describe('nextCase', () => {
  it('introduces cases in table order while nothing is due', () => {
    let state = defaultTrainerState();
    const order: string[] = [];
    let last: string | null = null;
    for (let i = 0; i < 4; i++) {
      last = nextCase(state, IDS, last);
      order.push(last!);
      state = answerDrill(state, last!, true);
    }
    expect(order).toEqual(['a', 'b', 'c', 'd']);
  });

  it('brings a missed case back two drills later', () => {
    let state = answerDrill(defaultTrainerState(), 'a', false); // turn 0 -> due 2
    expect(nextCase(state, IDS, 'a')).toBe('b');
    state = answerDrill(state, 'b', true); // turn 1
    expect(nextCase(state, IDS, 'b')).toBe('a');
  });

  it('prefers the most overdue case, then the lower box, then table order', () => {
    const state: TrainerState = {
      turn: 20,
      set: null,
      cards: {
        a: { box: 3, due: 18, seen: 3, missed: 0 },
        b: { box: 1, due: 18, seen: 2, missed: 1 },
        c: { box: 1, due: 12, seen: 2, missed: 1 },
        d: { box: 5, due: 50, seen: 9, missed: 0 },
      },
    };
    expect(nextCase(state, IDS)).toBe('c');
    expect(nextCase(state, IDS, 'c')).toBe('b');
    expect(nextCase(state, ['a', 'd'])).toBe('a');
  });

  it('picks the case due soonest once every case has been drilled and none is due', () => {
    const state: TrainerState = {
      turn: 3,
      set: null,
      cards: { a: { box: 4, due: 30, seen: 4, missed: 0 }, b: { box: 3, due: 9, seen: 3, missed: 0 } },
    };
    expect(nextCase(state, ['a', 'b'])).toBe('b');
  });

  it('never repeats the last case when another is available, but can with only one', () => {
    const state = answerDrill(defaultTrainerState(), 'a', false);
    const later = { ...state, turn: 10 };
    expect(nextCase(later, ['a', 'b'], 'a')).toBe('b');
    expect(nextCase(later, ['a'], 'a')).toBe('a');
    expect(nextCase(later, [], 'a')).toBeNull();
  });

  it('is deterministic: the same answers give the same drill order', () => {
    const run = () => {
      let state = defaultTrainerState();
      let last: string | null = null;
      const seen: string[] = [];
      for (let i = 0; i < 40; i++) {
        last = nextCase(state, IDS, last);
        seen.push(last!);
        state = answerDrill(state, last!, (i * 7) % 3 !== 0);
      }
      return seen;
    };
    expect(run()).toEqual(run());
  });

  it('shows a missed case more often than a known one over a session', () => {
    let state = defaultTrainerState();
    let last: string | null = null;
    const count: Record<string, number> = {};
    for (let i = 0; i < 60; i++) {
      last = nextCase(state, IDS, last);
      count[last!] = (count[last!] ?? 0) + 1;
      state = answerDrill(state, last!, last !== 'c'); // the student always misses c
    }
    for (const id of ['a', 'b', 'd']) expect(count.c).toBeGreaterThan(count[id]);
  });
});

describe('learned cases', () => {
  it('counts a case as learned from box 3 on', () => {
    expect(isLearned(undefined)).toBe(false);
    expect(isLearned({ box: 2, due: 0, seen: 1, missed: 0 })).toBe(false);
    expect(isLearned({ box: 3, due: 0, seen: 2, missed: 0 })).toBe(true);
  });

  it('reports learned, seen and total for a set', () => {
    let state = defaultTrainerState();
    state = answerDrill(state, 'a', true);
    state = answerDrill(state, 'a', true);
    state = answerDrill(state, 'b', false);
    expect(setProgress(state, IDS)).toEqual({ learned: 1, seen: 2, total: 4 });
  });
});
