/**
 * Cubyntra - Timer rules: WCA inspection penalties, trimmed averages, formatting, the
 * press / hold / release machine and scrambles
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import {
  ARM_MS,
  INITIAL_TIMER,
  bestAverage,
  bestSingle,
  currentAverage,
  effectiveMs,
  formatAverage,
  formatSolve,
  formatTime,
  inspectionCue,
  inspectionPenalty,
  inspectionSecondsLeft,
  timerReducer,
  trimmedAverage,
  type TimerEvent,
  type TimerMachine,
} from '../src/learn/timer';
import { generateScramble, scrambledState } from '../src/learn/scramble';
import type { Penalty, TimerSolve } from '../src/learn/types';
import { formatAlgorithm, isCubeSolved } from '../src/cube/transforms';
import { seededRandom } from './helpers/scrambles';

const solve = (seconds: number, penalty: Penalty = 'none'): TimerSolve => ({
  ms: Math.round(seconds * 1000),
  penalty,
  at: '2026-11-17T10:00:00.000Z',
  scramble: '',
});

describe('inspection (WCA A3)', () => {
  it('has no penalty before 15 s, +2 from 15 s, DNF from 17 s', () => {
    expect(inspectionPenalty(0)).toBe('none');
    expect(inspectionPenalty(14_999)).toBe('none');
    expect(inspectionPenalty(15_000)).toBe('+2');
    expect(inspectionPenalty(16_999)).toBe('+2');
    expect(inspectionPenalty(17_000)).toBe('DNF');
  });

  it('calls out 8 s and 12 s, then the penalties', () => {
    expect(inspectionCue(7_999)).toBe('none');
    expect(inspectionCue(8_000)).toBe('8s');
    expect(inspectionCue(12_000)).toBe('12s');
    expect(inspectionCue(15_000)).toBe('plus-two');
    expect(inspectionCue(17_000)).toBe('dnf');
  });

  it('counts down whole seconds from 15', () => {
    expect(inspectionSecondsLeft(0)).toBe(15);
    expect(inspectionSecondsLeft(1)).toBe(15);
    expect(inspectionSecondsLeft(1_000)).toBe(14);
    expect(inspectionSecondsLeft(14_500)).toBe(1);
    expect(inspectionSecondsLeft(16_000)).toBe(0);
  });
});

describe('results', () => {
  it('adds 2 seconds for +2 and has no time for a DNF', () => {
    expect(effectiveMs(solve(10))).toBe(10_000);
    expect(effectiveMs(solve(10, '+2'))).toBe(12_000);
    expect(effectiveMs(solve(10, 'DNF'))).toBeNull();
  });

  it('formats times, +2 and DNF', () => {
    expect(formatTime(9_876)).toBe('9.87');
    expect(formatTime(42_100)).toBe('42.10');
    expect(formatTime(63_459)).toBe('1:03.45');
    expect(formatTime(0)).toBe('0.00');
    expect(formatSolve(solve(12.34, '+2'))).toBe('14.34+');
    expect(formatSolve(solve(12.34, 'DNF'))).toBe('DNF');
    expect(formatAverage(null)).toBe('–');
    expect(formatAverage('DNF')).toBe('DNF');
  });

  it('finds the best single, never a DNF', () => {
    expect(bestSingle([])).toBeNull();
    expect(bestSingle([solve(9, 'DNF'), solve(12), solve(10, '+2'), solve(11.5)])).toBe(11_500);
    expect(bestSingle([solve(9, 'DNF')])).toBeNull();
  });
});

describe('averages (WCA trimmed mean)', () => {
  it('drops the best and the worst of five and rounds to hundredths', () => {
    // 10.00 11.00 12.00 13.00 20.00 -> mean of 11, 12, 13
    expect(trimmedAverage([solve(10), solve(20), solve(12), solve(11), solve(13)])).toBe(12_000);
    // 10.01 10.02 10.04 -> 10.0233 -> 10.02
    expect(trimmedAverage([solve(9), solve(10.01), solve(10.02), solve(10.04), solve(30)])).toBe(10_020);
    // 10.00 10.01 10.04 -> 10.0167 -> 10.02 (rounded, not truncated)
    expect(trimmedAverage([solve(9), solve(10), solve(10.01), solve(10.04), solve(30)])).toBe(10_020);
  });

  it('counts +2 in the time and drops one DNF as the worst', () => {
    expect(trimmedAverage([solve(10), solve(11, '+2'), solve(12), solve(9), solve(1, 'DNF')])).toBe(11_670);
  });

  it('is a DNF with two DNFs', () => {
    expect(trimmedAverage([solve(10), solve(11), solve(12), solve(1, 'DNF'), solve(2, 'DNF')])).toBe('DNF');
  });

  it('trims one best and one worst of twelve', () => {
    const twelve = [5, 30, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10].map((s) => solve(s));
    expect(trimmedAverage(twelve)).toBe(10_000);
    expect(currentAverage([solve(99), ...twelve], 12)).toBe(10_000);
  });

  it('needs enough solves', () => {
    expect(currentAverage([solve(1), solve(2), solve(3), solve(4)], 5)).toBeNull();
    expect(currentAverage(Array(11).fill(solve(10)), 12)).toBeNull();
  });

  it('finds the best average of five anywhere in the history', () => {
    const history = [20, 20, 20, 20, 20, 10, 10, 10, 10, 10, 30].map((s) => solve(s));
    expect(bestAverage(history, 5)).toBe(10_000);
    expect(currentAverage(history, 5)).toBe(10_000);
    const withDnf = [solve(1, 'DNF'), solve(1, 'DNF'), solve(10), solve(10), solve(10), solve(1, 'DNF'), solve(1, 'DNF')];
    expect(bestAverage(withDnf, 5)).toBe('DNF');
    expect(bestAverage([], 5)).toBeNull();
  });
});

describe('the timer machine', () => {
  const run = (events: TimerEvent[], from: TimerMachine = INITIAL_TIMER) => events.reduce(timerReducer, from);

  it('tap to inspect, hold to arm, release to start, press to stop', () => {
    let m = run([
      { type: 'press', at: 0 },
      { type: 'release', at: 100 },
    ]);
    expect(m.phase).toBe('inspecting');
    m = run([{ type: 'press', at: 5_000 }], m);
    expect(m.phase).toBe('holding');
    m = run([{ type: 'tick', at: 5_000 + ARM_MS }], m);
    expect(m.phase).toBe('armed');
    m = run([{ type: 'release', at: 6_000 }], m);
    expect(m.phase).toBe('running');
    m = run([{ type: 'press', at: 18_345 }], m);
    expect(m.phase).toBe('stopping');
    expect(m.result).toEqual({ ms: 12_340, penalty: 'none' });
    m = run([{ type: 'release', at: 18_500 }], m);
    expect(m.phase).toBe('idle');
    expect(m.result).toEqual({ ms: 12_340, penalty: 'none' });
  });

  it('does not start on a short press', () => {
    const m = run([
      { type: 'release', at: 0 },
      { type: 'press', at: 1_000 },
      { type: 'tick', at: 1_000 + ARM_MS - 1 },
      { type: 'release', at: 1_000 + ARM_MS - 1 },
    ]);
    expect(m.phase).toBe('inspecting');
  });

  it('gives +2 for starting between 15 and 17 seconds', () => {
    const m = run([
      { type: 'release', at: 0 },
      { type: 'press', at: 15_000 },
      { type: 'tick', at: 15_400 },
      { type: 'release', at: 15_500 },
      { type: 'press', at: 25_500 },
    ]);
    expect(m.result).toEqual({ ms: 10_000, penalty: '+2' });
  });

  it('is a DNF when inspection reaches 17 seconds', () => {
    const idle = run([
      { type: 'release', at: 0 },
      { type: 'tick', at: 17_000 },
    ]);
    expect(idle).toMatchObject({ phase: 'idle', result: { ms: 0, penalty: 'DNF' } });
    const holding = run([
      { type: 'release', at: 0 },
      { type: 'press', at: 16_000 },
      { type: 'tick', at: 17_100 },
    ]);
    expect(holding).toMatchObject({ phase: 'stopping', result: { penalty: 'DNF' } });
    expect(run([{ type: 'release', at: 17_200 }], holding).phase).toBe('idle');
  });

  it('cancels inspection or a solve without a result', () => {
    const inspecting = run([{ type: 'release', at: 0 }]);
    expect(run([{ type: 'cancel' }], inspecting)).toEqual(INITIAL_TIMER);
    const running = run(
      [
        { type: 'press', at: 1 },
        { type: 'tick', at: 400 },
        { type: 'release', at: 500 },
      ],
      inspecting
    );
    expect(running.phase).toBe('running');
    expect(run([{ type: 'cancel' }], running).phase).toBe('idle');
    expect(run([{ type: 'cancel' }], running).result).toBeNull();
  });

  it('keeps the last result while the next inspection runs', () => {
    const done: TimerMachine = { ...INITIAL_TIMER, result: { ms: 9_000, penalty: 'none' } };
    expect(run([{ type: 'release', at: 0 }], done).result).toEqual({ ms: 9_000, penalty: 'none' });
  });
});

describe('scrambles', () => {
  const AXIS: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };

  it('are 20 outer turns with no face twice in a row and no three turns on one axis', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const moves = generateScramble(seededRandom(seed));
      expect(moves).toHaveLength(20);
      const faces = moves.map((m) => (m.kind === 'face' ? m.face : '?'));
      for (let i = 1; i < faces.length; i++) expect(faces[i]).not.toBe(faces[i - 1]);
      for (let i = 2; i < faces.length; i++) {
        const sameAxis = AXIS[faces[i]] === AXIS[faces[i - 1]] && AXIS[faces[i - 1]] === AXIS[faces[i - 2]];
        expect(sameAxis).toBe(false);
      }
      expect(isCubeSolved(scrambledState(moves))).toBe(false);
    }
  });

  it('are reproducible from the same random source', () => {
    expect(formatAlgorithm(generateScramble(seededRandom(7)))).toBe(formatAlgorithm(generateScramble(seededRandom(7))));
  });
});
