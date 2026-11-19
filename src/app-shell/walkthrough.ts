/**
 * Cubyntra - Full-Solution Walkthrough
 * Necookie Labs (c) 2026
 *
 * The whole solution of a saved cube, as the walkthrough screen (`/cubes/[id]`) shows it: every
 * step grouped by stage, with move counts, and as text for "Copy all moves".
 *
 * The beginner's method and CFOP come from the tutor engine's guided solve (each step is a real
 * `StepPlan`). "Fewest moves" is the Kociemba computer solution: one move sequence that follows
 * no human method. So the twin can play it and the student can step through it like the others,
 * it is split into parts of at most `COMPUTER_PART_MOVES` moves, of near-equal length (20 moves
 * are 7 + 7 + 6, not 8 + 8 + 4), each wrapped as a step of one stage, "Computer solution". The
 * parts have no case, no highlighted pieces and no checkpoint; their method id is only there
 * because a step plan needs one.
 *
 * Pure TypeScript: no DOM, React or Three.js imports.
 */

import type { CubeState, Move } from '@/cube/types';
import { gripOf } from '@/cube/grip';
import { applyMoves, formatAlgorithm } from '@/cube/transforms';
import type { StepPlan } from '@/tutor/types';
import type { SolutionMethod } from '@/lib/studentProfile';

/** Longest part of the computer solution shown as one step. */
export const COMPUTER_PART_MOVES = 8;
export const COMPUTER_STAGE = 'computer';

/** How the method switch names each solution. */
export const SOLUTION_LABEL: Record<SolutionMethod, string> = {
  beginner: "Beginner's",
  cfop: 'CFOP',
  fewest: 'Fewest moves',
};

/** Longer names, for headings and the copied text. */
export const SOLUTION_TITLE: Record<SolutionMethod, string> = {
  beginner: "Beginner's method",
  cfop: 'CFOP',
  fewest: 'Fewest moves (computer solution)',
};

export interface WalkthroughStep {
  plan: StepPlan;
  /** Position in the whole solution, from 0. */
  index: number;
  /** Layer turns in the step (regrips are not counted). */
  turns: number;
}

export interface WalkthroughStage {
  stage: string;
  stageName: string;
  /** Position among the stages that have steps, from 0. */
  number: number;
  steps: WalkthroughStep[];
  turns: number;
}

export interface Walkthrough {
  method: SolutionMethod;
  steps: WalkthroughStep[];
  stages: WalkthroughStage[];
  /** Layer turns in the whole solution. */
  totalTurns: number;
}

/** Every move the twin plays for a step: setup (regrips, lining up), then the algorithm. */
export function stepMoves(plan: StepPlan): Move[] {
  return [...plan.setupMoves, ...plan.algorithm];
}

/** Layer turns only: whole-cube rotations (x y z) change the grip, not the cube. */
export function turnCount(moves: readonly Move[]): number {
  return moves.filter((m) => m.kind !== 'rotation').length;
}

/** Sizes of the parts `total` moves are split into: near-equal, none over `max`. */
export function partSizes(total: number, max = COMPUTER_PART_MOVES): number[] {
  if (total <= 0) return [];
  const parts = Math.ceil(total / max);
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * The computer solution of `state` (`moves`, which must solve it) as step plans the twin can
 * play: one per part, each starting where the last one ended.
 */
export function computerSolutionSteps(state: CubeState, moves: readonly Move[], max = COMPUTER_PART_MOVES): StepPlan[] {
  const grip = gripOf(state);
  const sizes = partSizes(moves.length, max);
  const steps: StepPlan[] = [];
  let start = state;
  let from = 0;
  sizes.forEach((size, i) => {
    const algorithm = moves.slice(from, from + size);
    const expected = applyMoves(start, algorithm);
    steps.push({
      method: 'cfop',
      stage: COMPUTER_STAGE,
      stageName: 'Computer solution',
      stageIndex: 0,
      stepIndex: i,
      caseId: `computer-${i + 1}`,
      caseName: `Part ${i + 1} of ${sizes.length}: moves ${from + 1} to ${from + size} of ${moves.length}`,
      setupMoves: [],
      algorithm,
      highlightPieces: [],
      facts: {
        goal: `Part ${i + 1} of the computer's ${moves.length}-move solution.`,
        lookFor: `Hold the cube with the ${grip.top} center on top and the ${grip.front} center in front, as scanned, the whole way through.`,
        why: 'A computer search found these moves. They do not follow a human method, so the cube only comes together at the very end.',
      },
      grip,
      gripAfter: grip,
      startState: start,
      expectedState: expected,
      checkpoint: { facesToShow: [], stickers: [] },
      progressBefore: i,
      progressAfter: i + 1,
    });
    start = expected;
    from += size;
  });
  return steps;
}

/** Groups the steps of a solution by stage, in order, with move counts. */
export function buildWalkthrough(method: SolutionMethod, plans: readonly StepPlan[]): Walkthrough {
  const steps = plans.map((plan, index) => ({ plan, index, turns: turnCount(stepMoves(plan)) }));
  const stages: WalkthroughStage[] = [];
  for (const step of steps) {
    let stage = stages.at(-1);
    if (!stage || stage.stage !== step.plan.stage) {
      stage = { stage: step.plan.stage, stageName: step.plan.stageName, number: stages.length, steps: [], turns: 0 };
      stages.push(stage);
    }
    stage.steps.push(step);
    stage.turns += step.turns;
  }
  return { method, steps, stages, totalTurns: steps.reduce((n, s) => n + s.turns, 0) };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "41 moves in 12 steps" style counts. */
export function countLabel(turns: number, steps: number): string {
  return `${plural(turns, 'move')} in ${plural(steps, 'step')}`;
}

/** The whole solution in notation, grouped by stage, for the clipboard. */
export function solutionText(walkthrough: Walkthrough, cubeName: string): string {
  const lines = [
    `Cubyntra: ${cubeName}`,
    `${SOLUTION_TITLE[walkthrough.method]}, ${countLabel(walkthrough.totalTurns, walkthrough.steps.length)}`,
  ];
  for (const stage of walkthrough.stages) {
    lines.push('', `${stage.number + 1}. ${stage.stageName} (${countLabel(stage.turns, stage.steps.length)})`);
    for (const step of stage.steps) {
      lines.push(`   Step ${step.index + 1}, ${step.plan.caseName}: ${formatAlgorithm(stepMoves(step.plan))}`);
    }
  }
  return lines.join('\n');
}
