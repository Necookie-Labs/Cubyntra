/**
 * Cubyntra - Tutor Engine
 * Necookie Labs (c) 2026
 *
 * Picks every move of a guided solve. Given a cube state and a method, it finds the stage the
 * cube is in, asks that stage's planner for one small step, replays the step on the logical
 * cube, and only returns it if the replay raises the method's progress. Deterministic: the same
 * state, method and grip always give the same plan. Claude explains plans; it never makes them.
 */

import { CubeState, Face, Move } from '../cube/types';
import { FACES } from '../cube/constants';
import { StickerRef } from '../cube/geometry';
import { Grip, gripOf, isValidGrip, viewInGrip } from '../cube/grip';
import { centerColors, findRotation } from '../cube/orientation';
import { findCorner, findEdge } from '../cube/pieces';
import { applyMoves, formatAlgorithm, isCubeSolved, parseAlgorithm } from '../cube/transforms';
import { countTurns } from './helpers';
import {
  CheckpointSpec,
  GuidedSolve,
  MethodDefinition,
  PieceRef,
  StageDefinition,
  StepDraft,
  StepPlan,
  TutorPlanError,
  TutorProgress,
} from './types';

/** Steps per stage never reach this, so `stageIndex * STAGE_SPAN + withinStage` is ordered. */
export const STAGE_SPAN = 1000;

/** A guided solve longer than this means a planner is going in circles. */
export const MAX_GUIDED_STEPS = 200;

function stageIndexOf(state: CubeState, definition: MethodDefinition): number {
  if (isCubeSolved(state)) return definition.stages.length;
  const index = definition.stages.findIndex((stage) => !stage.isComplete(state));
  // An unsolved cube that passes every detector would be a detector bug; keep it on the last stage.
  return index < 0 ? definition.stages.length - 1 : index;
}

/** The stage a cube is in, or null when it is solved. */
export function currentStageIn(definition: MethodDefinition, state: CubeState): StageDefinition | null {
  return definition.stages[stageIndexOf(state, definition)] ?? null;
}

/** The same cube turned (by the shortest whole-cube rotation) so the stage's color is on top. */
function stageView(state: CubeState, stage: StageDefinition): CubeState {
  const rotation = findRotation(centerColors(state), { U: stage.top });
  if (!rotation) throw new TutorPlanError('Cube centers are not in a reachable orientation');
  return rotation.length ? applyMoves(state, rotation) : state;
}

/** How far through the method a cube is. Every planned step raises `value`. */
export function progressIn(definition: MethodDefinition, state: CubeState): TutorProgress {
  const method = definition.id;
  const stageIndex = stageIndexOf(state, definition);
  const stage = definition.stages[stageIndex];
  if (!stage) {
    return { method, stageIndex, stage: null, withinStage: 0, value: stageIndex * STAGE_SPAN, done: true };
  }
  const withinStage = stage.progress(stageView(state, stage));
  if (!Number.isInteger(withinStage) || withinStage < 0 || withinStage >= STAGE_SPAN) {
    throw new TutorPlanError(`Stage "${stage.id}" reported progress ${withinStage}`);
  }
  return {
    method,
    stageIndex,
    stage: stage.id,
    withinStage,
    value: stageIndex * STAGE_SPAN + withinStage,
    done: false,
  };
}

const SINGLE_ROTATIONS: readonly Move[] = parseAlgorithm("y y' y2 x x' x2 z z' z2");

/** The shortest regrip to a grip: one rotation whenever one is enough (so a flip is `z2`). */
function rotationTo(start: CubeState, target: Grip): Move[] {
  if (start.U[4] === target.top && start.F[4] === target.front) return [];
  for (const move of SINGLE_ROTATIONS) {
    const turned = applyMoves(start, [move]);
    if (turned.U[4] === target.top && turned.F[4] === target.front) return [move];
  }
  const rotation = findRotation(centerColors(start), { U: target.top, F: target.front });
  if (!rotation) throw new TutorPlanError('Cube centers are not in a reachable orientation');
  return rotation;
}

/** The regrip that puts the stage's color on top, keeping the same front when that is possible. */
function regripFor(start: CubeState, stage: StageDefinition): Move[] {
  if (start.U[4] === stage.top) return [];
  const sameFront: Grip = { top: stage.top, front: start.F[4] };
  if (isValidGrip(sameFront)) return rotationTo(start, sameFront);
  const rotation = findRotation(centerColors(start), { U: stage.top });
  if (!rotation) throw new TutorPlanError('Cube centers are not in a reachable orientation');
  return rotation;
}

/** Folds the regrips a step starts with into the shortest single regrip. */
function mergeLeadingRegrips(start: CubeState, setup: Move[]): Move[] {
  let count = 0;
  while (count < setup.length && setup[count].kind === 'rotation') count++;
  if (count < 2) return setup;
  const turned = applyMoves(start, setup.slice(0, count));
  return [...rotationTo(start, gripOf(turned)), ...setup.slice(count)];
}

function pieceStickers(state: CubeState, piece: PieceRef): StickerRef[] {
  const c = piece.colors;
  if (piece.kind === 'edge') return findEdge(state, [c[0], c[1]]).stickers;
  if (piece.kind === 'corner') return findCorner(state, [c[0], c[1], c[2]]).stickers;
  const face = FACES.find((f) => state[f][4] === c[0]);
  return face ? [{ face, index: 4 }] : [];
}

const DEFAULT_FACE_ORDER: readonly Face[] = ['U', 'F', 'R', 'L', 'B', 'D'];

/** Weight of a sticker of a highlighted piece when choosing which faces to show. */
const PLACED_WEIGHT = 3;

/**
 * Chooses the one or two faces that say most about the step: those holding the placed pieces
 * and the most changed stickers. Only stickers that changed or belong to a highlighted piece
 * are listed, so the scan never has to judge parts of the cube the step left alone.
 */
function buildCheckpoint(
  start: CubeState,
  expected: CubeState,
  draft: StepDraft,
  stage: StageDefinition
): CheckpointSpec {
  const carried = viewInGrip(start, gripOf(expected)).state;
  const relevant = new Map<Face, Set<number>>(FACES.map((f) => [f, new Set<number>()]));
  const score = new Map<Face, number>(FACES.map((f) => [f, 0]));

  for (const face of FACES) {
    for (let i = 0; i < 9; i++) {
      if (carried[face][i] !== expected[face][i]) {
        relevant.get(face)!.add(i);
        score.set(face, score.get(face)! + 1);
      }
    }
  }
  for (const piece of draft.highlightPieces) {
    for (const ref of pieceStickers(expected, piece)) {
      relevant.get(ref.face)!.add(ref.index);
      score.set(ref.face, score.get(ref.face)! + PLACED_WEIGHT);
    }
  }

  const order = [...stage.check.prefer, ...DEFAULT_FACE_ORDER.filter((f) => !stage.check.prefer.includes(f))];
  const ranked = order
    .filter((f) => score.get(f)! > 0)
    .sort((a, b) => score.get(b)! - score.get(a)! || order.indexOf(a) - order.indexOf(b));
  const facesToShow = ranked.slice(0, 2);
  const stickers = facesToShow.flatMap((face) =>
    [...relevant.get(face)!].sort((a, b) => a - b).map((index) => ({ face, index }))
  );
  return { facesToShow, stickers };
}

/**
 * Plans the next step for a cube. `grip` is how the student holds it (default: as the state is
 * stored); a regrip, when the stage needs one, comes first in `setupMoves`. Returns null when
 * the cube is solved. Throws `TutorPlanError` if the plan does not replay to a state further
 * along the method, or if the cube cannot be held in `grip`.
 */
export function planNextStepIn(
  definition: MethodDefinition,
  state: CubeState,
  grip: Grip = gripOf(state),
  stepIndex = 0
): StepPlan | null {
  const method = definition.id;
  let startState: CubeState;
  try {
    startState = viewInGrip(state, grip).state;
  } catch (error) {
    throw new TutorPlanError(error instanceof Error ? error.message : String(error));
  }

  const before = progressIn(definition, startState);
  if (before.done) return null;
  const stage = definition.stages[before.stageIndex];

  const regrip = regripFor(startState, stage);
  const draft = stage.plan(regrip.length ? applyMoves(startState, regrip) : startState);
  const setupMoves = mergeLeadingRegrips(startState, [...regrip, ...draft.setupMoves]);
  const moves = [...setupMoves, ...draft.algorithm];
  const describe = () => `${method}/${stage.id}/${draft.caseId} "${formatAlgorithm(moves)}"`;

  if (countTurns(moves) === 0) {
    throw new TutorPlanError(`Plan turns nothing: ${describe()}`);
  }

  // Replay on the logical cube: the plan is only real if the cube ends up further along.
  const expectedState = applyMoves(startState, moves);
  const after = progressIn(definition, expectedState);
  if (after.value <= before.value) {
    throw new TutorPlanError(
      `Plan does not advance (${before.value} -> ${after.value}): ${describe()}`
    );
  }

  return {
    ...draft,
    setupMoves,
    method,
    ...(definition.options ? { options: definition.options } : {}),
    stage: stage.id,
    stageName: stage.name,
    stageIndex: before.stageIndex,
    stepIndex,
    grip,
    gripAfter: gripOf(expectedState),
    startState,
    expectedState,
    checkpoint: buildCheckpoint(startState, expectedState, draft, stage),
    progressBefore: before.value,
    progressAfter: after.value,
  };
}

/**
 * Plans and applies steps until the cube is solved, as a student who follows every step would.
 * Throws `TutorPlanError` if a plan fails or the solve runs past `MAX_GUIDED_STEPS`.
 */
export function runGuidedSolveIn(
  definition: MethodDefinition,
  state: CubeState,
  grip: Grip = gripOf(state)
): GuidedSolve {
  const method = definition.id;
  const steps: StepPlan[] = [];
  let current = viewInGrip(state, grip).state;
  let currentGrip = grip;
  for (;;) {
    const step = planNextStepIn(definition, current, currentGrip, steps.length);
    if (!step) break;
    steps.push(step);
    current = step.expectedState;
    currentGrip = step.gripAfter;
    if (steps.length > MAX_GUIDED_STEPS) {
      throw new TutorPlanError(`Guided ${method} solve passed ${MAX_GUIDED_STEPS} steps without finishing`);
    }
  }
  const moves = steps.flatMap((s) => [...s.setupMoves, ...s.algorithm]);
  return { method, steps, moves, turnCount: countTurns(moves), finalState: current };
}
