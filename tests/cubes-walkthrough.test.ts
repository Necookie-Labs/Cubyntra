/**
 * Cubyntra - Full-solution walkthrough: grouping, the computer solution's parts, the copied text,
 * and (headless) that replaying every step of each method from the saved cube solves it
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { runGuidedSolve } from '../src/tutor';
import { solveCube } from '../src/solver/solver';
import { applyMoves, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import type { CubeState } from '../src/cube/types';
import {
  COMPUTER_PART_MOVES,
  buildWalkthrough,
  computerSolutionSteps,
  partSizes,
  solutionText,
  stepMoves,
  turnCount,
  type Walkthrough,
} from '../src/app-shell/walkthrough';
import { scrambledState } from './helpers/scrambles';

/** Plays every step in order from `state`, checking each starts where the last one ended. */
function replay(state: CubeState, walkthrough: Walkthrough): CubeState {
  let cube = state;
  for (const { plan } of walkthrough.steps) {
    expect(plan.startState).toEqual(cube);
    cube = applyMoves(cube, stepMoves(plan));
    expect(cube).toEqual(plan.expectedState);
  }
  return cube;
}

async function computerWalkthrough(state: CubeState): Promise<Walkthrough> {
  const result = await solveCube(state);
  expect(result.success).toBe(true);
  return buildWalkthrough('fewest', computerSolutionSteps(state, result.moves));
}

describe('walkthrough', () => {
  it('splits the computer solution into near-equal parts of at most 8 moves', () => {
    expect(COMPUTER_PART_MOVES).toBe(8);
    expect(partSizes(0)).toEqual([]);
    expect(partSizes(5)).toEqual([5]);
    expect(partSizes(8)).toEqual([8]);
    expect(partSizes(9)).toEqual([5, 4]);
    expect(partSizes(20)).toEqual([7, 7, 6]);
    expect(partSizes(22)).toEqual([8, 7, 7]);
  });

  it('wraps the computer solution as steps of one stage that chain from the saved cube', () => {
    const state = scrambledState(11, 25);
    const moves = parseAlgorithm("R U F' L2 D B R' U2 F L D' B2 U R2 F' D2 L' B U' R");
    // Any sequence chains; only a real solution solves (tested below).
    const steps = computerSolutionSteps(state, moves);
    const walkthrough = buildWalkthrough('fewest', steps);
    expect(walkthrough.stages).toHaveLength(1);
    expect(walkthrough.stages[0]).toMatchObject({ stage: 'computer', stageName: 'Computer solution', number: 0 });
    expect(steps.map((s) => s.algorithm.length)).toEqual([7, 7, 6]);
    expect(steps[1].caseName).toBe('Part 2 of 3: moves 8 to 14 of 20');
    expect(walkthrough.totalTurns).toBe(20);
    replay(state, walkthrough);
  });

  it('groups a guided solve by stage, in order, with move counts', () => {
    const state = scrambledState(3, 25);
    const solve = runGuidedSolve(state, 'beginner');
    const walkthrough = buildWalkthrough('beginner', solve.steps);
    expect(walkthrough.steps).toHaveLength(solve.steps.length);
    expect(walkthrough.totalTurns).toBe(solve.turnCount);
    expect(walkthrough.stages.flatMap((s) => s.steps.map((step) => step.index))).toEqual(solve.steps.map((_, i) => i));
    // Stages appear once each, in the method's order.
    const indexes = walkthrough.stages.map((s) => s.steps[0].plan.stageIndex);
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
    expect(new Set(walkthrough.stages.map((s) => s.stage)).size).toBe(walkthrough.stages.length);
    for (const stage of walkthrough.stages) {
      expect(stage.turns).toBe(stage.steps.reduce((n, s) => n + turnCount(stepMoves(s.plan)), 0));
    }
  });

  it('copies the whole solution in notation, grouped by stage', () => {
    const state = scrambledState(5, 25);
    const walkthrough = buildWalkthrough('cfop', runGuidedSolve(state, 'cfop').steps);
    const text = solutionText(walkthrough, 'Scan · 19 Nov, 14:32');
    const lines = text.split('\n');
    expect(lines[0]).toBe('Cubyntra: Scan · 19 Nov, 14:32');
    expect(lines[1]).toMatch(/^CFOP, \d+ moves in \d+ steps$/);
    expect(lines.filter((l) => /^\d+\. /.test(l))).toHaveLength(walkthrough.stages.length);
    expect(lines.filter((l) => l.startsWith('   Step '))).toHaveLength(walkthrough.steps.length);
    // The notation read back is every move of the solution.
    const moves = lines.filter((l) => l.startsWith('   Step ')).map((l) => l.slice(l.lastIndexOf(': ') + 2));
    expect(isCubeSolved(applyMoves(state, parseAlgorithm(moves.join(' '))))).toBe(true);
  });
});

describe('replaying the walkthrough solves the saved cube (headless)', () => {
  const cubes = [scrambledState(21, 25), scrambledState(22, 30), scrambledState(23, 18)];

  it.each(cubes.map((c, i) => [i, c] as const))("beginner's method, cube %i", (_i, state) => {
    expect(isCubeSolved(replay(state, buildWalkthrough('beginner', runGuidedSolve(state, 'beginner').steps)))).toBe(true);
  });

  it.each(cubes.map((c, i) => [i, c] as const))('CFOP 2-look, cube %i', (_i, state) => {
    expect(isCubeSolved(replay(state, buildWalkthrough('cfop', runGuidedSolve(state, 'cfop').steps)))).toBe(true);
  });

  it.each(cubes.map((c, i) => [i, c] as const))('CFOP full last layer, cube %i', (_i, state) => {
    const solve = runGuidedSolve(state, 'cfop', undefined, { lastLayer: 'full' });
    expect(isCubeSolved(replay(state, buildWalkthrough('cfop', solve.steps)))).toBe(true);
  });

  it.each(cubes.map((c, i) => [i, c] as const))('fewest moves, cube %i', async (_i, state) => {
    const walkthrough = await computerWalkthrough(state);
    expect(walkthrough.steps.every((s) => s.plan.algorithm.length <= COMPUTER_PART_MOVES)).toBe(true);
    expect(isCubeSolved(replay(state, walkthrough))).toBe(true);
  });
});
