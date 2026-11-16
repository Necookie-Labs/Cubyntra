/**
 * Cubyntra - Recovery After a Failed Checkpoint
 * Necookie Labs (c) 2026
 *
 * Three ways on after a mismatch, from cheapest to surest:
 * 1. The diagnosis is confident: the cube is known, so give a short corrective step (take back
 *    what went wrong, then finish the step), or a fresh plan when taking it back is too long.
 * 2. The diagnosis is not confident, or nothing fits, or no plan can be made from the cube it
 *    names (most likely a misread color): ask for a full rescan. Recovery never throws a
 *    `TutorPlanError`, so a checkpoint cannot leave the student stuck.
 * 3. After the rescan: plan again from the scanned cube, however it was held for the scan.
 * Pure TypeScript: no DOM, camera or vision imports.
 */

import { CubeState, Face, Move, QuarterTurns } from '../cube/types';
import { Grip, gripOf, isValidGrip, viewInGrip } from '../cube/grip';
import { normalizeOrientation, translateMoveThroughRotation } from '../cube/orientation';
import { applyMoves, formatMove, invertAlgorithm, moveFromReference, moveReferenceFace } from '../cube/transforms';
import { planNextStep, progress } from './api';
import { countTurns } from './helpers';
import {
  CheckpointSpec,
  Diagnosis,
  LikelyMistake,
  MethodId,
  MethodOptions,
  StepPlan,
  TutorPlanError,
} from './types';

/** A corrective step with more layer turns than this is replaced by a fresh plan. */
export const MAX_CORRECTIVE_TURNS = 12;

export interface RecoveryOptions {
  maxCorrectiveTurns?: number;
}

export type ResumePlan =
  | {
      /** Take back the slip, then finish the original step. Ends in the original `expectedState`. */
      kind: 'corrective';
      plan: StepPlan;
      /** The part of `plan` that takes back what the student did, before simplifying. */
      undoMoves: Move[];
      /** The part of the original step that is then done again. */
      redoMoves: Move[];
    }
  | {
      /** A new step planned from the cube as it is now; null if that cube is already solved. */
      kind: 'replan';
      plan: StepPlan | null;
    };

export type Recovery =
  | { action: 'resume'; mistake: LikelyMistake; resume: ResumePlan }
  | {
      action: 'needsRescan';
      /** `no-plan`: the diagnosed cube could not be planned from (the tutor threw). */
      reason: 'nothing-fits' | 'not-confident' | 'no-plan';
      /** A cheaper thing to try first: show this face too, then diagnose again. */
      showNext?: Face;
    };

const sameTarget = (a: Move, b: Move) => a.kind === b.kind && moveReferenceFace(a) === moveReferenceFace(b);

/** Joins neighbouring turns of the same layer and drops those that cancel. */
function simplify(moves: readonly Move[]): Move[] {
  const out: Move[] = [];
  for (const move of moves) {
    const last = out[out.length - 1];
    if (!last || !sameTarget(last, move)) {
      out.push(move);
      continue;
    }
    out.pop();
    const quarters = (((last.quarterTurns + move.quarterTurns) % 4) + 4) % 4;
    if (quarters !== 0) {
      const turns: QuarterTurns = quarters === 1 ? 1 : quarters === 2 ? 2 : -1;
      out.push(moveFromReference(move.kind, moveReferenceFace(move), turns));
    }
  }
  return out;
}

/**
 * Rewrites a sequence so every whole-cube turn comes first, as one shortest regrip, followed
 * by layer turns only (the shape of every step plan).
 */
function regripFirst(start: CubeState, moves: readonly Move[]): { regrip: Move[]; turns: Move[] } {
  const rotations: Move[] = [];
  let turns: Move[] = [];
  for (const move of moves) {
    if (move.kind === 'rotation') {
      turns = turns.map((t) => translateMoveThroughRotation(t, [move]));
      rotations.push(move);
    } else {
      turns.push(move);
    }
  }
  const regrip = rotations.length ? viewInGrip(start, gripOf(applyMoves(start, rotations))).rotation : [];
  return { regrip, turns: simplify(turns) };
}

const sameState = (a: CubeState, b: CubeState) => JSON.stringify(a) === JSON.stringify(b);

function correctiveCheckpoint(plan: StepPlan, from: CubeState): CheckpointSpec {
  const listed = new Set(plan.checkpoint.stickers.map((s) => `${s.face}${s.index}`));
  const stickers = [...plan.checkpoint.stickers];
  for (const face of plan.checkpoint.facesToShow) {
    for (let index = 0; index < 9; index++) {
      if (!listed.has(`${face}${index}`) && from[face][index] !== plan.expectedState[face][index]) {
        stickers.push({ face, index });
      }
    }
  }
  return { facesToShow: plan.checkpoint.facesToShow, stickers };
}

function buildCorrective(plan: StepPlan, from: CubeState, regrip: Move[], turns: Move[]): StepPlan {
  return {
    ...plan,
    setupMoves: regrip,
    algorithm: turns,
    grip: plan.gripAfter,
    startState: from,
    checkpoint: correctiveCheckpoint(plan, from),
    facts: {
      goal: `Fix the slip, then finish: ${plan.facts.goal}`,
      lookFor: plan.facts.lookFor,
      why: 'These moves take back what went wrong and then finish the step.',
    },
    progressBefore: progress(from, plan.method, plan.options).value,
  };
}

/**
 * Rebuilds the corrective step another device made for `plan` (ADR-015): the same step, started
 * from `from` (the cube that device diagnosed), with `moves` (its regrip, then its turns). Null
 * unless the moves really take `from` to the step's expected state.
 */
export function correctivePlanFrom(plan: StepPlan, from: CubeState, moves: readonly Move[]): StepPlan | null {
  let split = 0;
  while (split < moves.length && moves[split].kind === 'rotation') split++;
  const regrip = moves.slice(0, split);
  const turns = moves.slice(split);
  if (!turns.length || turns.some((m) => m.kind === 'rotation')) return null;
  if (!sameState(applyMoves(from, moves), plan.expectedState)) return null;
  return buildCorrective(plan, from, regrip, turns);
}

/**
 * The way on from a diagnosed mistake. The student holds the cube as the plan's `gripAfter`
 * says (that is how it was shown for the check), so the returned plan starts from the
 * mistake's `resultingState` in that grip.
 */
export function resumeFrom(
  plan: StepPlan,
  mistake: Pick<LikelyMistake, 'performedMoves' | 'resultingState'>,
  options: RecoveryOptions = {}
): ResumePlan {
  const maxTurns = options.maxCorrectiveTurns ?? MAX_CORRECTIVE_TURNS;
  const intended = [...plan.setupMoves, ...plan.algorithm];
  const performed = mistake.performedMoves;
  const from = mistake.resultingState;

  let shared = 0;
  while (
    shared < intended.length &&
    shared < performed.length &&
    formatMove(intended[shared]) === formatMove(performed[shared])
  ) {
    shared++;
  }

  // Back to how the cube was held when the moves ended, back through the moves that differ,
  // then forward through the rest of the step.
  const held = viewInGrip(applyMoves(plan.startState, performed), plan.gripAfter).rotation;
  const undoMoves = [...invertAlgorithm(held), ...invertAlgorithm(performed.slice(shared))];
  const redoMoves = intended.slice(shared);
  const { regrip, turns } = regripFirst(from, [...undoMoves, ...redoMoves]);

  const reaches = sameState(applyMoves(from, [...regrip, ...turns]), plan.expectedState);
  if (reaches && turns.length > 0 && countTurns(turns) <= maxTurns) {
    return { kind: 'corrective', plan: buildCorrective(plan, from, regrip, turns), undoMoves, redoMoves };
  }
  return { kind: 'replan', plan: planNextStep(from, plan.method, plan.gripAfter, plan.stepIndex, plan.options) };
}

/**
 * What to do after a mismatch. A confident diagnosis resumes from the cube it names; anything
 * else needs a full rescan (after, optionally, showing the one face that would settle it).
 */
export function decideRecovery(plan: StepPlan, diagnosis: Diagnosis, options: RecoveryOptions = {}): Recovery {
  const mistake = diagnosis.likelyMistakes[0];
  if (!mistake) return { action: 'needsRescan', reason: 'nothing-fits' };
  if (!diagnosis.confident) {
    return {
      action: 'needsRescan',
      reason: 'not-confident',
      ...(diagnosis.showNext ? { showNext: diagnosis.showNext } : {}),
    };
  }
  try {
    return { action: 'resume', mistake, resume: resumeFrom(plan, mistake, options) };
  } catch (error) {
    if (error instanceof TutorPlanError) return { action: 'needsRescan', reason: 'no-plan' };
    throw error;
  }
}

export type ScanReplan =
  | {
      ok: true;
      /** The scanned cube as the student should now hold it. */
      state: CubeState;
      grip: Grip;
      /** The next step from there, or null when the scanned cube is solved. */
      plan: StepPlan | null;
    }
  | { ok: false; reason: string };

export type ScanHold = { ok: true; state: CubeState; grip: Grip } | { ok: false; reason: string };

/**
 * The scanned cube turned to the grip the student should hold it in (`preferredGrip` when it is
 * a real grip, otherwise as scanned). Cheap: planning from it is left to the caller (the app
 * plans in the worker).
 */
export function holdScanned(scanned: CubeState, preferredGrip?: Grip): ScanHold {
  if (!normalizeOrientation(scanned)) {
    return { ok: false, reason: 'The scanned centers do not form a cube. Scan all six faces again.' };
  }
  const grip = preferredGrip && isValidGrip(preferredGrip) ? preferredGrip : gripOf(scanned);
  return { ok: true, state: viewInGrip(scanned, grip).state, grip };
}

/**
 * Plans again from a fresh full scan. The scan may store the cube in any orientation; it is
 * turned to `preferredGrip` (normally the grip the student was last told to hold) when given,
 * and otherwise kept as scanned. The caller validates the scan (colors, parity) first; this
 * only checks that the centers form a real cube. `options` are the learner settings of the
 * solve that was interrupted (a plan carries them as `plan.options`).
 */
export function replanFromScan(
  scanned: CubeState,
  method: MethodId,
  preferredGrip?: Grip,
  stepIndex = 0,
  options: MethodOptions = {}
): ScanReplan {
  const held = holdScanned(scanned, preferredGrip);
  if (!held.ok) return held;
  const { state, grip } = held;
  try {
    return { ok: true, state, grip, plan: planNextStep(state, method, grip, stepIndex, options) };
  } catch (error) {
    if (error instanceof TutorPlanError) return { ok: false, reason: error.message };
    throw error;
  }
}
