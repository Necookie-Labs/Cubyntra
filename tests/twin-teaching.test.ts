/**
 * Teaching twin: a whole guided solve played headlessly on the real engine through the playback
 * controller. After every step the twin's logical state, its painted colors and the colors
 * rebuilt from cubie geometry all equal the plan's expected state, the twin is held in the
 * plan's `gripAfter`, and the spotlight sits on the highlighted pieces.
 */

import { describe, expect, it, vi } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import { runGuidedSolve, type MethodId, type StepPlan } from '../src/tutor';
import { piecePosition, slotPosition } from '../src/twin/mapping';
import { focusMove, stepMoves, TeachingTwinController, type TeachingSurface } from '../src/twin/teaching';
import type { CubeEngine } from '../src/three/engine';
import { randomScramble, seededRandom } from './helpers/scrambles';
import {
  builtColors,
  cubieAt,
  installEngineGlobals,
  litPositions,
  makeEngine,
  pumpFrames,
  pumpUntil,
  readStateFromGeometry,
  readStateFromMaterials,
  withFakeRenderer,
} from './helpers/twinHarness';

vi.mock('three', async (orig) => withFakeRenderer(await orig<typeof import('three')>()));
const { CubeEngine: Engine } = await import('../src/three/engine');
installEngineGlobals();

// The engine is a teaching surface as it stands.
const asSurface = (engine: CubeEngine): TeachingSurface => engine;

/** A twin that has really turned through a scramble, so its geometry is ground truth. */
async function scrambledTwin(seed: number): Promise<{ engine: CubeEngine; state: ReturnType<typeof createSolvedCubeState> }> {
  const engine = makeEngine(Engine);
  let state = createSolvedCubeState();
  const turns: Promise<void>[] = [];
  for (const move of randomScramble(seededRandom(seed), 25)) {
    state = applyMoves(state, [move]);
    turns.push(engine.animateMove(move, state, 10));
  }
  await pumpUntil(Promise.all(turns));
  expect(readStateFromGeometry(engine)).toEqual(state);
  return { engine, state };
}

const outlineOf = (engine: CubeEngine) =>
  (engine as unknown as { slotOutline: { group: { visible: boolean; position: { toArray(): number[] } } } }).slotOutline.group;

function expectAidsOn(engine: CubeEngine, plan: StepPlan, state: typeof plan.expectedState, geometry = true): void {
  const expected = plan.highlightPieces.map((p) => piecePosition(state, p).join(',')).sort();
  expect(litPositions(engine)).toEqual(expected);
  // Geometry agrees: the lit cubies are the pieces with those colors.
  for (const piece of geometry ? plan.highlightPieces : []) {
    expect(builtColors(cubieAt(engine, piecePosition(state, piece))).sort()).toEqual([...piece.colors].sort());
  }
  const outline = outlineOf(engine);
  expect(outline.visible).toBe(Boolean(plan.targetSlot));
  if (plan.targetSlot) expect(outline.position.toArray()).toEqual([...slotPosition(state, plan.targetSlot)]);
}

describe('teaching twin guided solve', () => {
  it.each<[MethodId, number]>([
    ['beginner', 101],
    ['cfop', 202],
  ])('plays a full %s solve with the twin matching every expected state', async (method, seed) => {
    const { engine, state: scrambled } = await scrambledTwin(seed);
    const solve = runGuidedSolve(scrambled, method);
    const played: StepPlan[] = [];
    const twin = new TeachingTwinController(asSurface(engine), { onStepPlayed: (p) => played.push(p) });

    for (const plan of solve.steps) {
      await pumpUntil(twin.show(plan));
      expect(engine.playback.getSnapshot().state).toEqual(plan.startState);
      expect(readStateFromMaterials(engine)).toEqual(plan.startState);
      expect(engine.getGrip()).toEqual(plan.grip);
      expectAidsOn(engine, plan, plan.startState);

      for (let i = 0; i < stepMoves(plan).length; i++) void engine.playback.stepForward();
      await pumpUntil(engine.playback.whenIdle());

      const where = `${plan.stage} step ${plan.stepIndex} (${plan.caseId})`;
      expect(engine.playback.getSnapshot().state, where).toEqual(plan.expectedState);
      expect(readStateFromMaterials(engine), where).toEqual(plan.expectedState);
      expect(readStateFromGeometry(engine), where).toEqual(plan.expectedState);
      expect(engine.getGrip(), where).toEqual(plan.gripAfter);
      expect(engine.isBusy()).toBe(false);
      expectAidsOn(engine, plan, plan.expectedState);
    }

    expect(played).toEqual(solve.steps);
    expect(readStateFromGeometry(engine)).toEqual(solve.finalState);
    twin.dispose();
    engine.dispose();
  });
});

describe('TeachingTwinController', () => {
  async function firstPlans(seed: number, method: MethodId = 'cfop') {
    const { engine, state } = await scrambledTwin(seed);
    return { engine, steps: runGuidedSolve(state, method).steps };
  }

  it('plays a step to the end with play(), regrips included, and reports it once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const { engine, steps } = await firstPlans(7, 'beginner');
      // A step that starts with a regrip shows it as an animated whole-cube turn.
      const plan = steps.find((s) => s.setupMoves[0]?.kind === 'rotation') ?? steps[0];
      const onStepPlayed = vi.fn();
      const twin = new TeachingTwinController(engine, { onStepPlayed });
      // The twin has to stand where the plan starts for its geometry to stay meaningful.
      await pumpUntil(twin.show(plan));

      const done = engine.playback.play();
      let finished = false;
      void done.then(() => (finished = true));
      for (let guard = 0; guard < 100_000 && !finished; guard++) {
        pumpFrames(1);
        vi.advanceTimersByTime(17);
        await Promise.resolve();
      }
      expect(finished).toBe(true);
      expect(readStateFromMaterials(engine)).toEqual(plan.expectedState);
      expect(engine.getGrip()).toEqual(plan.gripAfter);
      expect(onStepPlayed).toHaveBeenCalledTimes(1);
      expect(onStepPlayed).toHaveBeenCalledWith(plan);

      // Seeking back and to the end again is not "playing" the step.
      await pumpUntil(engine.playback.seek(0));
      await pumpUntil(engine.playback.seek(stepMoves(plan).length));
      expect(onStepPlayed).toHaveBeenCalledTimes(1);
      twin.dispose();
      engine.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('switches to the next plan mid-turn without a stale animation', async () => {
    const { engine, steps } = await firstPlans(11);
    const [a, b] = steps;
    const twin = new TeachingTwinController(engine);
    await pumpUntil(twin.show(a));
    void engine.playback.stepForward();
    void engine.playback.stepForward();
    for (let i = 0; i < 20 && !engine.isBusy(); i++) await Promise.resolve();
    pumpFrames(3); // first turn in flight
    expect(engine.isBusy()).toBe(true);

    // Jump to a later step (as a rescan would): the turn in flight lands, the rest is dropped.
    await pumpUntil(twin.show(b));
    pumpFrames(60);
    expect(engine.isBusy()).toBe(false);
    const snap = engine.playback.getSnapshot();
    expect(snap.index).toBe(0);
    expect(snap.moves).toEqual(stepMoves(b));
    expect(readStateFromMaterials(engine)).toEqual(b.startState);
    expect(twin.getPlan()).toBe(b);
    // Geometry is off by the turn that landed; the paint and the aids follow the logical state.
    expectAidsOn(engine, b, b.startState, false);
    twin.dispose();
    engine.dispose();
  });

  it('keeps only the last of several quick plan changes', async () => {
    const { engine, steps } = await firstPlans(12);
    const twin = new TeachingTwinController(engine);
    const shows = [twin.show(steps[0]), twin.show(steps[1]), twin.show(steps[2])];
    await pumpUntil(Promise.all(shows));
    expect(twin.getPlan()).toBe(steps[2]);
    expect(engine.playback.getSnapshot().moves).toEqual(stepMoves(steps[2]));
    expect(readStateFromMaterials(engine)).toEqual(steps[2].startState);
    twin.dispose();
    engine.dispose();
  });

  it('toggles the "after" preview of the expected state', async () => {
    const { engine, steps } = await firstPlans(13);
    const ghost = vi.spyOn(engine, 'setGhostState');
    const twin = new TeachingTwinController(engine, { showGhost: true });
    await pumpUntil(twin.show(steps[0]));
    expect(ghost).toHaveBeenLastCalledWith(steps[0].expectedState);
    twin.setGhostVisible(false);
    expect(ghost).toHaveBeenLastCalledWith(null);
    twin.setGhostVisible(true);
    expect(ghost).toHaveBeenLastCalledWith(steps[0].expectedState);
    await pumpUntil(twin.show(steps[1]));
    expect(ghost).toHaveBeenLastCalledWith(steps[1].expectedState);
    twin.dispose();
    expect(ghost).toHaveBeenLastCalledWith(null);
    engine.dispose();
  });

  it('clears the aids for no plan, and after dispose ignores playback', async () => {
    const { engine, steps } = await firstPlans(14);
    const twin = new TeachingTwinController(engine);
    await pumpUntil(twin.show(steps[0]));
    await pumpUntil(twin.show(null));
    expect(litPositions(engine)).toHaveLength(27);
    expect(outlineOf(engine).visible).toBe(false);
    expect(engine.playback.getSnapshot().total).toBe(0);
    twin.dispose();
    const spot = vi.spyOn(engine, 'setSpotlight');
    engine.playback.load(steps[1].startState, stepMoves(steps[1]));
    await pumpUntil(engine.playback.whenIdle());
    expect(spot).not.toHaveBeenCalled();
    engine.dispose();
  });
});

describe('focusMove', () => {
  it('is the move turning, inverted when stepping back, else the next one', () => {
    const moves = parseAlgorithm("R U'");
    const base = { moves, total: 2, playing: false, speed: 1 as const, loop: false, state: createSolvedCubeState() };
    expect(focusMove({ ...base, index: 0, activeIndex: null, direction: null })?.notation).toBe('R');
    expect(focusMove({ ...base, index: 1, activeIndex: 1, direction: 'forward' })?.notation).toBe("U'");
    expect(focusMove({ ...base, index: 2, activeIndex: 1, direction: 'back' })?.notation).toBe('U');
    expect(focusMove({ ...base, index: 2, activeIndex: null, direction: null })).toBeNull();
  });
});
