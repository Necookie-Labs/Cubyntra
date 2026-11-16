/**
 * Playback controller logic, driven headlessly through a fake twin.
 */

import { describe, expect, it } from 'vitest';
import type { CubeState, Move } from '../src/cube/types';
import { createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, formatMove, parseAlgorithm } from '../src/cube/transforms';
import { PlaybackController, statesAlong, type PlaybackSnapshot } from '../src/three/playback';

interface Call {
  kind: 'turn' | 'sync';
  notation?: string;
  state: CubeState;
  durationMs?: number;
}

/** A twin that records what it was asked to do. Turns finish when `finish()` is called, or at once. */
class FakeTwin {
  calls: Call[] = [];
  shown: CubeState = createSolvedCubeState();
  manual = false;
  private pending: Array<() => void> = [];

  animateMove(move: Move, targetState: CubeState, durationMs?: number): Promise<void> {
    this.calls.push({ kind: 'turn', notation: formatMove(move), state: targetState, durationMs });
    const done = () => {
      this.shown = targetState;
    };
    if (!this.manual) {
      done();
      return Promise.resolve();
    }
    return new Promise((resolve) => this.pending.push(() => (done(), resolve())));
  }

  requestSync(state: CubeState): void {
    this.calls.push({ kind: 'sync', state });
    this.shown = state;
  }

  finish(): void {
    this.pending.shift()?.();
  }

  turns(): string[] {
    return this.calls.filter((c) => c.kind === 'turn').map((c) => c.notation!);
  }
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const noSleep = () => Promise.resolve();

const ALG = parseAlgorithm("R U R' U'");
const start = applyMoves(createSolvedCubeState(), parseAlgorithm('F2 L'));

function setup() {
  const twin = new FakeTwin();
  const pb = new PlaybackController(twin, { sleep: noSleep, turnMs: 300 });
  const seen: PlaybackSnapshot[] = [];
  pb.subscribe((s) => seen.push(s));
  pb.load(start, ALG);
  return { twin, pb, seen };
}

describe('statesAlong', () => {
  it('lists the start state and the state after each move', () => {
    const states = statesAlong(start, ALG);
    expect(states).toHaveLength(5);
    expect(states[0]).toBe(start);
    expect(states[4]).toEqual(applyMoves(start, ALG));
  });
});

describe('PlaybackController', () => {
  it('load shows the start state and rewinds', async () => {
    const { twin, pb } = setup();
    await pb.whenIdle();
    expect(twin.calls).toEqual([{ kind: 'sync', state: start }]);
    expect(pb.getSnapshot()).toMatchObject({ index: 0, total: 4, playing: false, activeIndex: null });
  });

  it('play animates every move with its exact target state, then stops at the end', async () => {
    const { twin, pb } = setup();
    await pb.play();
    expect(twin.turns()).toEqual(["R", "U", "R'", "U'"]);
    const targets = twin.calls.filter((c) => c.kind === 'turn').map((c) => c.state);
    expect(targets).toEqual(statesAlong(start, ALG).slice(1));
    expect(pb.getSnapshot()).toMatchObject({ index: 4, playing: false });
    expect(twin.shown).toEqual(applyMoves(start, ALG));
  });

  it('reports the active move while it animates, then the new index', async () => {
    const { twin, pb, seen } = setup();
    twin.manual = true;
    void pb.stepForward();
    await flush();
    expect(pb.getSnapshot()).toMatchObject({ index: 0, activeIndex: 0, direction: 'forward' });
    twin.finish();
    await pb.whenIdle();
    expect(pb.getSnapshot()).toMatchObject({ index: 1, activeIndex: null, direction: null });
    expect(seen.map((s) => [s.index, s.activeIndex])).toContainEqual([0, 0]);
  });

  it('stepBack plays the inverse of the previous move and lands on the earlier state', async () => {
    const { twin, pb } = setup();
    await pb.stepForward();
    await pb.stepForward();
    await pb.stepBack();
    expect(twin.turns()).toEqual(['R', 'U', "U'"]);
    expect(pb.getSnapshot().index).toBe(1);
    expect(twin.shown).toEqual(applyMoves(start, [ALG[0]]));
  });

  it('does nothing when stepping past either end', async () => {
    const { twin, pb } = setup();
    await pb.stepBack();
    await pb.seek(4);
    await pb.stepForward();
    expect(twin.turns()).toEqual([]);
    expect(pb.getSnapshot().index).toBe(4);
  });

  it('runs rapid commands in order without dropping any', async () => {
    const { twin, pb } = setup();
    twin.manual = true;
    void pb.stepForward();
    void pb.stepForward();
    void pb.stepForward();
    void pb.stepBack();
    for (let i = 0; i < 4; i++) {
      await flush();
      twin.finish();
    }
    await pb.whenIdle();
    expect(twin.turns()).toEqual(['R', 'U', "R'", 'R']);
    expect(pb.getSnapshot().index).toBe(2);
  });

  it('pause stops after the turn in flight', async () => {
    const { twin, pb } = setup();
    twin.manual = true;
    void pb.play();
    await flush();
    pb.pause();
    expect(pb.getSnapshot().playing).toBe(false);
    twin.finish();
    await pb.whenIdle();
    expect(twin.turns()).toEqual(['R']);
    expect(pb.getSnapshot().index).toBe(1);
  });

  it('seek jumps without animating and clamps to the algorithm', async () => {
    const { twin, pb } = setup();
    await pb.seek(3);
    expect(twin.turns()).toEqual([]);
    expect(twin.shown).toEqual(statesAlong(start, ALG)[3]);
    await pb.seek(99);
    expect(pb.getSnapshot().index).toBe(4);
    await pb.reset();
    expect(pb.getSnapshot().index).toBe(0);
    expect(twin.shown).toEqual(start);
  });

  it('half speed doubles the turn duration', async () => {
    const { twin, pb } = setup();
    pb.setSpeed(0.5);
    await pb.stepForward();
    pb.setSpeed(1);
    await pb.stepForward();
    expect(twin.calls.filter((c) => c.kind === 'turn').map((c) => c.durationMs)).toEqual([600, 300]);
    expect(() => pb.setSpeed(2 as 1)).toThrow();
  });

  it('play from the end starts again from the start state', async () => {
    const { twin, pb } = setup();
    await pb.seek(4);
    await pb.play();
    expect(twin.turns()).toEqual(["R", "U", "R'", "U'"]);
    expect(twin.calls.filter((c) => c.kind === 'sync').at(-1)!.state).toEqual(start);
  });

  it('loop wraps back to the start state and keeps playing until paused', async () => {
    const twin = new FakeTwin();
    let turnsSeen = 0;
    const pb = new PlaybackController(twin, { sleep: noSleep });
    pb.load(start, ALG);
    pb.setLoop(true);
    pb.subscribe((s) => {
      if (s.activeIndex !== null && ++turnsSeen === 6) pb.pause();
    });
    await pb.play();
    expect(twin.turns()).toEqual(["R", "U", "R'", "U'", 'R', 'U']);
    expect(pb.getSnapshot()).toMatchObject({ index: 2, playing: false, loop: true });
  });

  it('a new load cancels queued commands from the old algorithm', async () => {
    const { twin, pb } = setup();
    twin.manual = true;
    void pb.stepForward();
    void pb.stepForward();
    await flush();
    const other = parseAlgorithm('F');
    pb.load(createSolvedCubeState(), other);
    twin.finish();
    await pb.whenIdle();
    expect(twin.turns()).toEqual(['R']);
    expect(pb.getSnapshot()).toMatchObject({ index: 0, total: 1, activeIndex: null });
    expect(twin.shown).toEqual(createSolvedCubeState());
  });

  it('keeps the snapshot object stable between changes', async () => {
    const { pb } = setup();
    expect(pb.getSnapshot()).toBe(pb.getSnapshot());
    const before = pb.getSnapshot();
    pb.setLoop(true);
    expect(pb.getSnapshot()).not.toBe(before);
  });

  it('stops notifying after unsubscribe and dispose', async () => {
    const { pb, seen } = setup();
    const n = seen.length;
    pb.dispose();
    await pb.stepForward();
    expect(seen.length).toBe(n);
  });
});
