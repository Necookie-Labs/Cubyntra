/**
 * Step plan to twin mapping: pieces named by colors land on the twin's cubie with those colors,
 * slots on the cubie between their centers, checkpoint faces on the face with their center.
 */

import { describe, expect, it, vi } from 'vitest';
import type { CubeColor, CubeState } from '../src/cube/types';
import { createSolvedCubeState } from '../src/cube/constants';
import { viewInGrip } from '../src/cube/grip';
import { CORNER_SLOTS, EDGE_SLOTS } from '../src/cube/pieces';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import { planNextStep, runGuidedSolve, type PieceRef } from '../src/tutor';
import { checkpointFaces, piecePosition, slotPosition, spotlightPositions } from '../src/twin/mapping';
import { randomScramble, seededRandom } from './helpers/scrambles';
import {
  builtColors,
  cubieAt,
  installEngineGlobals,
  makeEngine,
  pumpUntil,
  readStateFromGeometry,
  withFakeRenderer,
} from './helpers/twinHarness';

vi.mock('three', async (orig) => withFakeRenderer(await orig<typeof import('three')>()));
const { CubeEngine } = await import('../src/three/engine');
installEngineGlobals();

const solved = createSolvedCubeState();
const sorted = (colors: readonly CubeColor[]) => [...colors].sort();

/** Every edge and corner of a cube, named by the colors it shows. */
function allPieces(state: CubeState): PieceRef[] {
  return [
    ...EDGE_SLOTS.map((s) => ({ kind: 'edge' as const, colors: s.stickers.map((r) => state[r.face][r.index]) })),
    ...CORNER_SLOTS.map((s) => ({ kind: 'corner' as const, colors: s.stickers.map((r) => state[r.face][r.index]) })),
  ];
}

describe('piecePosition', () => {
  it('places pieces of a solved cube at their home cubies', () => {
    expect(piecePosition(solved, { kind: 'corner', colors: ['white', 'green', 'red'] })).toEqual([1, 1, 1]);
    expect(piecePosition(solved, { kind: 'corner', colors: ['red', 'white', 'green'] })).toEqual([1, 1, 1]);
    expect(piecePosition(solved, { kind: 'edge', colors: ['yellow', 'blue'] })).toEqual([0, -1, -1]);
    expect(piecePosition(solved, { kind: 'center', colors: ['orange'] })).toEqual([-1, 0, 0]);
  });

  it('follows a piece through a turn', () => {
    // R takes the UFR corner (white/green/red) to UBR.
    const afterR = applyMoves(solved, parseAlgorithm('R'));
    expect(piecePosition(afterR, { kind: 'corner', colors: ['white', 'green', 'red'] })).toEqual([1, 1, -1]);
    // y2 carries the white/green edge from UF to UB.
    const turned = applyMoves(solved, parseAlgorithm('y2'));
    expect(piecePosition(turned, { kind: 'edge', colors: ['white', 'green'] })).toEqual([0, 1, -1]);
    expect(piecePosition(turned, { kind: 'center', colors: ['green'] })).toEqual([0, 0, -1]);
  });

  it('throws for a piece the cube does not have', () => {
    expect(() => piecePosition(solved, { kind: 'edge', colors: ['white', 'yellow'] })).toThrow();
  });

  it("matches the engine's cubies on scrambled cubes, held in other grips too", async () => {
    for (let n = 0; n < 4; n++) {
      // The twin starts solved and only turns, so its geometry is ground truth for where pieces are.
      const moves = [...randomScramble(seededRandom(77 + n), 20), ...parseAlgorithm(n % 2 ? 'x y' : 'z2')];
      const engine = makeEngine(CubeEngine);
      let state = solved;
      const turns: Promise<void>[] = [];
      for (const move of moves) {
        state = applyMoves(state, [move]);
        turns.push(engine.animateMove(move, state, 10));
      }
      await pumpUntil(Promise.all(turns));
      expect(readStateFromGeometry(engine)).toEqual(state);

      for (const piece of allPieces(state)) {
        const cubie = cubieAt(engine, piecePosition(state, piece));
        expect(sorted(builtColors(cubie)), piece.colors.join('/')).toEqual(sorted(piece.colors));
      }
      for (const center of ['white', 'yellow', 'red', 'orange', 'blue', 'green'] as const) {
        expect(builtColors(cubieAt(engine, piecePosition(state, { kind: 'center', colors: [center] })))).toEqual([center]);
      }
      engine.dispose();
    }
  });
});

describe('spotlightPositions', () => {
  it("lights the plan's pieces where they are in its start state", () => {
    const state = applyMoves(solved, randomScramble(seededRandom(5), 25));
    for (const method of ['beginner', 'cfop'] as const) {
      const plan = planNextStep(state, method)!;
      const lit = spotlightPositions(plan.startState, plan.highlightPieces);
      expect(lit).toHaveLength(plan.highlightPieces.length);
      plan.highlightPieces.forEach((piece, i) => expect(lit[i].position).toEqual(piecePosition(plan.startState, piece)));
    }
  });
});

describe('slotPosition', () => {
  it('finds the cubie between the named centers', () => {
    expect(slotPosition(solved, { kind: 'corner', colors: ['yellow', 'red', 'green'] })).toEqual([1, -1, 1]);
    expect(slotPosition(solved, { kind: 'edge', colors: ['blue', 'orange'] })).toEqual([-1, 0, -1]);
    expect(slotPosition(solved, { kind: 'center', colors: ['white'] })).toEqual([0, 1, 0]);
    // Held yellow on top (z2): the white/red/green slot is now down-front-left.
    const yellowTop = viewInGrip(solved, { top: 'yellow', front: 'green' }).state;
    expect(slotPosition(yellowTop, { kind: 'corner', colors: ['white', 'red', 'green'] })).toEqual([-1, -1, 1]);
  });

  it('rejects colors that do not meet at one cubie', () => {
    expect(() => slotPosition(solved, { kind: 'edge', colors: ['white', 'yellow'] })).toThrow(/Not a edge slot/);
    expect(() => slotPosition(solved, { kind: 'corner', colors: ['white', 'red'] })).toThrow();
  });

  it("puts every F2L target slot on the plan's down layer, where the pair goes", () => {
    const solve = runGuidedSolve(applyMoves(solved, randomScramble(seededRandom(9), 25)), 'cfop');
    const f2l = solve.steps.filter((s) => s.stage === 'f2l' && s.targetSlot);
    expect(f2l.length).toBeGreaterThan(0);
    for (const step of f2l) {
      const slot = step.targetSlot!;
      const position = slotPosition(step.expectedState, slot);
      expect(position[1]).toBe(-1);
      // After the step the target corner is home.
      expect(piecePosition(step.expectedState, slot)).toEqual(position);
    }
  });
});

describe('checkpointFaces', () => {
  it('maps faces to themselves on the expected state and follows the centers otherwise', () => {
    const plan = planNextStep(applyMoves(solved, randomScramble(seededRandom(3), 25)), 'beginner')!;
    const faces = checkpointFaces(plan);
    expect(faces.map((f) => f.twinFace)).toEqual(plan.checkpoint.facesToShow);
    for (const f of faces) expect(f.centerColor).toBe(plan.expectedState[f.face][4]);

    // The same cube turned upside down: each face is found by its center.
    const flipped = applyMoves(plan.expectedState, parseAlgorithm('x2'));
    for (const f of checkpointFaces(plan, flipped)) {
      expect(flipped[f.twinFace][4]).toBe(f.centerColor);
    }
  });
});
