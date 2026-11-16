/**
 * Cubyntra - Helpers for Tutor Stage Tests
 *
 * Hand-made cubes are built backwards: start from a solved cube and undo the moves a student
 * would do, so the expected plan is known before the planner runs.
 */

import { expect } from 'vitest';
import { CubeState } from '../../src/cube/types';
import { createSolvedCubeState } from '../../src/cube/constants';
import { gripOf, viewInGrip } from '../../src/cube/grip';
import { findCorner, findEdge, isLayerSolved, isMiddleLayerSolved } from '../../src/cube/pieces';
import { applyMoves, formatAlgorithm, invertAlgorithm, parseAlgorithm } from '../../src/cube/transforms';
import { planNextStepIn } from '../../src/tutor/engine';
import { MethodDefinition, StepPlan } from '../../src/tutor/types';

/** Solved, held with white on top and green in front (the orientation a scan is stored in). */
export const whiteTop = createSolvedCubeState();

/** Solved, held with yellow on top and green in front (red on the left, orange on the right). */
export const yellowTop = applyMoves(whiteTop, parseAlgorithm('z2'));

/** The yellow-on-top cube a student has before doing `solution`. */
export function before(solution: string, from: CubeState = yellowTop): CubeState {
  return applyMoves(from, invertAlgorithm(parseAlgorithm(solution)));
}

export const firstTwoLayersSolved = (s: CubeState) => isLayerSolved(s, 'white') && isMiddleLayerSolved(s, 'white');

/** Setup and algorithm as one notation string. */
export const allMoves = (plan: StepPlan) => formatAlgorithm([...plan.setupMoves, ...plan.algorithm]);

/** Asserts everything the engine promises about one plan, and returns it. */
export function checkedPlan(method: MethodDefinition, state: CubeState): StepPlan {
  const plan = planNextStepIn(method, state);
  if (!plan) throw new Error('Expected a plan, but the cube is solved');

  // Replays exactly, in the grip the plan says it ends in.
  const replayed = applyMoves(plan.startState, [...plan.setupMoves, ...plan.algorithm]);
  expect(replayed).toEqual(plan.expectedState);
  expect(gripOf(plan.expectedState)).toEqual(plan.gripAfter);
  expect(plan.progressAfter).toBeGreaterThan(plan.progressBefore);
  // Regrips come first and are never part of the algorithm.
  expect(plan.algorithm.some((m) => m.kind === 'rotation')).toBe(false);
  expect(plan.algorithm.length).toBeGreaterThan(0);

  // Checkpoint: one or two faces, and only stickers that changed or belong to a highlighted piece.
  expect(plan.checkpoint.facesToShow.length).toBeGreaterThanOrEqual(1);
  expect(plan.checkpoint.facesToShow.length).toBeLessThanOrEqual(2);
  expect(plan.checkpoint.stickers.length).toBeGreaterThan(0);
  const carried = viewInGrip(plan.startState, plan.gripAfter).state;
  const placed = plan.highlightPieces.flatMap((piece) => {
    const c = piece.colors;
    if (piece.kind === 'edge') return findEdge(plan.expectedState, [c[0], c[1]]).stickers;
    if (piece.kind === 'corner') return findCorner(plan.expectedState, [c[0], c[1], c[2]]).stickers;
    return [];
  });
  for (const s of plan.checkpoint.stickers) {
    expect(plan.checkpoint.facesToShow).toContain(s.face);
    const changed = carried[s.face][s.index] !== plan.expectedState[s.face][s.index];
    const highlighted = placed.some((p) => p.face === s.face && p.index === s.index);
    expect(changed || highlighted).toBe(true);
  }

  // Facts for the coach are always filled in.
  for (const text of [plan.caseId, plan.caseName, plan.facts.goal, plan.facts.lookFor, plan.facts.why]) {
    expect(text.length).toBeGreaterThan(0);
  }
  if (plan.facts.repeat) {
    const { unit, times } = plan.facts.repeat;
    expect(formatAlgorithm(plan.algorithm)).toBe(Array(times).fill(formatAlgorithm(unit)).join(' '));
  }
  return plan;
}

/** Follows checked plans until `done` holds; returns the steps taken. */
export function followUntil(
  method: MethodDefinition,
  start: CubeState,
  done: (state: CubeState) => boolean,
  maxSteps = 12
): { steps: StepPlan[]; state: CubeState } {
  const steps: StepPlan[] = [];
  let state = start;
  while (!done(state)) {
    if (steps.length >= maxSteps) throw new Error(`Not done after ${maxSteps} steps`);
    const plan = checkedPlan(method, state);
    steps.push(plan);
    state = plan.expectedState;
  }
  return { steps, state };
}
