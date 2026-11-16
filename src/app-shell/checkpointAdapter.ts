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
 * - after a full rescan in the middle of a solve, `replanFromScan` plans from the scanned cube.
 */

import type { CubeState, Face } from '@/cube/types';
import type { Grip } from '@/cube/grip';
import { applyTileEdits, confirmManually, verifyCheckpoint, type TileEdit } from '@/tutor/checkpoint';
import { diagnoseMistake } from '@/tutor/diagnose';
import { decideRecovery, replanFromScan, type Recovery, type ScanReplan } from '@/tutor/recovery';
import type { CheckpointResult, Diagnosis, FaceObservation, MethodId, StepPlan } from '@/tutor/types';

export type { Recovery, ResumePlan, ScanReplan } from '@/tutor/recovery';

export interface CheckpointOutcome {
  result: CheckpointResult;
  /** Set for `mismatch` results. */
  diagnosis: Diagnosis | null;
  recovery: Recovery | null;
}

/** Verifies the shown faces and, on a mismatch, diagnoses what probably happened. */
export function checkCheckpoint(plan: StepPlan, observations: readonly FaceObservation[]): CheckpointOutcome {
  const result = verifyCheckpoint(plan, observations);
  if (result.status !== 'mismatch') return { result, diagnosis: null, recovery: null };
  const diagnosis = diagnoseMistake(plan, observations);
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
  edits: readonly TileEdit[]
): CheckpointOutcome {
  const edited = observations.map((o) => (o.face === face ? applyTileEdits(o, edits) : o));
  return checkCheckpoint(plan, edited);
}

/** Plans from a full rescan taken in the middle of a solve, held as the student last was. */
export function replanAfterRescan(
  scanned: CubeState,
  method: MethodId,
  grip: Grip | undefined,
  stepIndex: number
): ScanReplan {
  return replanFromScan(scanned, method, grip, stepIndex);
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
