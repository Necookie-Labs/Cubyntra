/**
 * Cubyntra - Checkpoint Adapter
 * Necookie Labs (c) 2026
 *
 * The one place the app shell talks to checkpoint verification, mistake diagnosis and
 * recovery (ADR-013, docs/tutor/CHECKPOINTS.md):
 * - `verifyCheckpoint` decides match / mismatch / uncertain / wrong-face from the check-spec
 *   stickers;
 * - on a mismatch `diagnoseMistake` ranks the slips that fit the shown faces and
 *   `decideRecovery` says whether to resume (a corrective step or a fresh plan from the cube the
 *   student most likely has) or to rescan (after, optionally, showing one more face);
 * - after a full rescan in the middle of a solve, `holdRescanned` turns the scanned cube to the
 *   student's grip (the store plans from it in the worker; `replanAfterRescan` does both at once).
 */

import type { CubeState, Face } from '@/cube/types';
import type { Grip } from '@/cube/grip';
import { applyTileEdits, confirmManually, verifyCheckpoint, type TileEdit } from '@/tutor/checkpoint';
import { diagnoseMistake } from '@/tutor/diagnose';
import { decideRecovery, holdScanned, replanFromScan, type Recovery, type ScanHold, type ScanReplan } from '@/tutor/recovery';
import type { CheckpointResult, Diagnosis, FaceObservation, MethodId, MethodOptions, StepPlan } from '@/tutor/types';

export type { Recovery, ResumePlan, ScanHold, ScanReplan } from '@/tutor/recovery';

export interface CheckpointOutcome {
  result: CheckpointResult;
  /** Set for `mismatch` results. */
  diagnosis: Diagnosis | null;
  recovery: Recovery | null;
}

/**
 * The faces to take as held the asked way up on the next check: the face the last check could
 * not tell the way up of has now been shown again as asked.
 */
export function trustedHold(previous: CheckpointOutcome | null): Face[] {
  const face = previous?.result.rotationUnclear;
  return face ? [face] : [];
}

/**
 * Verifies the shown faces and, on a mismatch, diagnoses what probably happened. `previous` is
 * the outcome of the last check of this step (its "which way up?" question is not asked twice).
 */
export function checkCheckpoint(
  plan: StepPlan,
  observations: readonly FaceObservation[],
  previous: CheckpointOutcome | null = null
): CheckpointOutcome {
  const trustHold = trustedHold(previous);
  const result = verifyCheckpoint(plan, observations, { trustHold });
  if (result.status !== 'mismatch') return { result, diagnosis: null, recovery: null };
  const diagnosis = diagnoseMistake(plan, observations, { trustHold });
  return { result, diagnosis, recovery: decideRecovery(plan, diagnosis) };
}

/** "It actually matches": the student confirms by hand. */
export function confirmCheckpointByHand(plan: StepPlan): CheckpointOutcome {
  return { result: confirmManually(plan), diagnosis: null, recovery: null };
}

/** Re-checks after the student corrected some tiles of one shown face by hand. */
export function checkWithEdits(
  plan: StepPlan,
  observations: readonly FaceObservation[],
  face: Face,
  edits: readonly TileEdit[],
  previous: CheckpointOutcome | null = null
): CheckpointOutcome {
  const edited = observations.map((o) => (o.face === face ? applyTileEdits(o, edits) : o));
  return checkCheckpoint(plan, edited, previous);
}

/** Plans from a full rescan taken in the middle of a solve, held as the student last was, on the same variant. */
export function replanAfterRescan(
  scanned: CubeState,
  method: MethodId,
  grip: Grip | undefined,
  stepIndex: number,
  options: MethodOptions = {}
): ScanReplan {
  return replanFromScan(scanned, method, grip, stepIndex, options);
}

/**
 * A full rescan taken in the middle of a solve, turned to the grip the student last held (the
 * store then plans from it in the worker).
 */
export function holdRescanned(scanned: CubeState, grip: Grip | undefined): ScanHold {
  return holdScanned(scanned, grip);
}

/** The diagnosis to hand the coach (useCoach projects it), or undefined when there is none. */
export function toCoachDiagnosis(diagnosis: Diagnosis | null): Diagnosis | undefined {
  return diagnosis && diagnosis.likelyMistakes.length > 0 ? diagnosis : undefined;
}

/** The face the recovery asks to see before giving up and rescanning, if any. */
export function faceToShowNext(outcome: CheckpointOutcome | null): Face | null {
  const recovery = outcome?.recovery;
  return recovery?.action === 'needsRescan' && recovery.showNext ? recovery.showNext : null;
}
