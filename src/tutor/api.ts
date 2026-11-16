/**
 * Cubyntra - Tutor Engine API
 * Necookie Labs (c) 2026
 *
 * The engine by method id. This is what the twin, the checkpoint checker and the coach call.
 *
 * Learner settings (`MethodOptions`) pick a variant of a method. The only one so far is
 * `lastLayer` for CFOP: `'2-look'` (default) or `'full'` (57 OLL and 21 PLL cases). Every
 * function takes the options last and treats a missing value as the default.
 */

import { CubeState } from '../cube/types';
import { Grip, gripOf } from '../cube/grip';
import { currentStageIn, planNextStepIn, progressIn, runGuidedSolveIn } from './engine';
import { BEGINNER_METHOD } from './methods/beginner';
import { CFOP_FULL_METHOD, CFOP_METHOD } from './methods/cfop';
import {
  GuidedSolve,
  MethodDefinition,
  MethodId,
  MethodOptions,
  StageDefinition,
  StepPlan,
  TutorPlanError,
  TutorProgress,
} from './types';

export const METHODS: Readonly<Record<MethodId, MethodDefinition>> = {
  beginner: BEGINNER_METHOD,
  cfop: CFOP_METHOD,
};

/** The default method for an id, or the variant the learner settings select. */
export function getMethod(method: MethodId, options: MethodOptions = {}): MethodDefinition {
  const definition = METHODS[method];
  if (!definition) throw new TutorPlanError(`Unknown method "${method}"`);
  const lastLayer = options.lastLayer ?? '2-look';
  if (lastLayer !== '2-look' && lastLayer !== 'full') {
    throw new TutorPlanError(`Unknown last-layer setting "${String(lastLayer)}"`);
  }
  if (method === 'cfop' && lastLayer === 'full') return CFOP_FULL_METHOD;
  return definition;
}

/** The stage a cube is in, or null when it is solved. */
export function currentStage(
  state: CubeState,
  method: MethodId,
  options: MethodOptions = {}
): StageDefinition | null {
  return currentStageIn(getMethod(method, options), state);
}

/** How far through the method a cube is. Every planned step raises `value`. */
export function progress(state: CubeState, method: MethodId, options: MethodOptions = {}): TutorProgress {
  return progressIn(getMethod(method, options), state);
}

/**
 * Plans the next step for a cube. `grip` is how the student holds it (default: as the state is
 * stored); a regrip, when the stage needs one, comes first in `setupMoves`. Returns null when
 * the cube is solved. Throws `TutorPlanError` if the plan does not replay to a state further
 * along the method, or if the cube cannot be held in `grip`.
 */
export function planNextStep(
  state: CubeState,
  method: MethodId,
  grip: Grip = gripOf(state),
  stepIndex = 0,
  options: MethodOptions = {}
): StepPlan | null {
  return planNextStepIn(getMethod(method, options), state, grip, stepIndex);
}

/**
 * Plans and applies steps until the cube is solved, as a student who follows every step would.
 * Throws `TutorPlanError` if a plan fails or the solve runs too long.
 */
export function runGuidedSolve(
  state: CubeState,
  method: MethodId,
  grip: Grip = gripOf(state),
  options: MethodOptions = {}
): GuidedSolve {
  return runGuidedSolveIn(getMethod(method, options), state, grip);
}
