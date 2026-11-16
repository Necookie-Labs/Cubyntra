/**
 * Cubyntra - Checkpoint Adapter
 * Necookie Labs (c) 2026
 *
 * The one place the app shell talks to checkpoint verification, mistake diagnosis and
 * recovery. `verifyCheckpoint` (src/tutor/checkpoint.ts) is used directly.
 *
 * Phase 5 adds `src/tutor/diagnose.ts` and `src/tutor/recovery.ts`. Until they land, this file
 * carries a small stand-in with the same intent, so wiring the real modules is a change to
 * this file only. What the adapter expects from them:
 *
 *   // src/tutor/diagnose.ts
 *   diagnose(plan: StepPlan, observations: readonly FaceObservation[], result: CheckpointResult): Diagnosis
 *     Ranked `LikelyMistake`s that fit the observed stickers, each with `resultingState` (the
 *     cube as held in `plan.gripAfter`), `confident`, and `showNext` when another face would
 *     tell candidates apart.
 *
 *   // src/tutor/recovery.ts
 *   planRecovery(plan: StepPlan, diagnosis: Diagnosis): Recovery
 *     `continue` with the state the student most likely has (the next plan starts from it) when
 *     the diagnosis is confident, `show-face` when one more face would settle it, otherwise
 *     `rescan` (full rescan, then a fresh plan from the observed state).
 */

import type { CubeState, Face, Move } from '@/cube/types';
import { applyMoves, invertMove } from '@/cube/transforms';
import { viewInGrip, type Grip } from '@/cube/grip';
import { moveName } from '@/cube/moveNames';
import { applyTileEdits, confirmManually, verifyCheckpoint, MIN_STICKER_CONFIDENCE } from '@/tutor/checkpoint';
import type { TileEdit } from '@/tutor/checkpoint';
import type {
  CheckpointResult,
  Diagnosis,
  FaceObservation,
  LikelyMistake,
  MistakeKind,
  StepPlan,
} from '@/tutor/types';
import type { CoachDiagnosis } from '@/coach/types';

export type Recovery =
  /** The student most likely has `state`, held in `grip`: plan the next step from there. */
  | { kind: 'continue'; state: CubeState; grip: Grip; description: string }
  /** One more face would tell the likely mistakes apart. */
  | { kind: 'show-face'; face: Face }
  /** Nothing fits well enough: scan the whole cube again. */
  | { kind: 'rescan' };

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
  const diagnosis = diagnose(plan, observations);
  return { result, diagnosis, recovery: planRecovery(plan, diagnosis) };
}

/** "It actually matches": the student confirms by hand. */
export function confirmCheckpointByHand(plan: StepPlan): CheckpointOutcome {
  return { result: confirmManually(plan), diagnosis: null, recovery: null };
}

/** Re-checks a face after the student corrected some tiles by hand. */
export function checkWithEdits(
  plan: StepPlan,
  observations: readonly FaceObservation[],
  face: Face,
  edits: readonly TileEdit[]
): CheckpointOutcome {
  const edited = observations.map((o) => (o.face === face ? applyTileEdits(o, edits) : o));
  return checkCheckpoint(plan, edited);
}

/** The compact form the coach accepts. */
export function toCoachDiagnosis(diagnosis: Diagnosis | null): CoachDiagnosis | undefined {
  if (!diagnosis || diagnosis.likelyMistakes.length === 0) return undefined;
  return {
    likelyMistakes: diagnosis.likelyMistakes.slice(0, 5).map((m) => ({
      kind: m.kind,
      moveIndex: m.moveIndex,
      confidence: m.confidence,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Stand-in for src/tutor/diagnose.ts and src/tutor/recovery.ts (replace with imports in Phase 5)
// ---------------------------------------------------------------------------------------------

/** How likely each kind of slip is before looking at the cube. */
const PRIOR: Record<MistakeKind, number> = {
  'wrong-direction': 0.35,
  'skipped-move': 0.25,
  'doubled-move': 0.2,
  'wrong-face': 0.1,
  'wrong-grip': 0.05,
  other: 0.05,
};

interface Candidate {
  kind: MistakeKind;
  moveIndex: number;
  performed: Move[];
  description: string;
}

function candidates(moves: readonly Move[]): Candidate[] {
  const out: Candidate[] = [];
  moves.forEach((move, i) => {
    if (move.kind === 'rotation') return;
    const n = i + 1;
    const before = moves.slice(0, i);
    const after = moves.slice(i + 1);
    if (move.quarterTurns !== 2) {
      out.push({
        kind: 'wrong-direction',
        moveIndex: i,
        performed: [...before, invertMove(move), ...after],
        description: `Move ${n} probably went the other way. It should be: ${moveName(move)}.`,
      });
      out.push({
        kind: 'doubled-move',
        moveIndex: i,
        performed: [...before, move, move, ...after],
        description: `Move ${n} was probably done twice. Do it once: ${moveName(move)}.`,
      });
    }
    out.push({
      kind: 'skipped-move',
      moveIndex: i,
      performed: [...before, ...after],
      description: `You probably skipped move ${n}: ${moveName(move)}.`,
    });
  });
  return out;
}

/** Confidently read stickers on the shown faces that `state` gets wrong. */
function contradictions(state: CubeState, observations: readonly FaceObservation[]): number {
  let count = 0;
  for (const o of observations) {
    o.stickers.forEach((s, i) => {
      if (s.confidence >= MIN_STICKER_CONFIDENCE && state[o.face][i] !== s.color) count++;
    });
  }
  return count;
}

/** Stand-in for `diagnose` from src/tutor/diagnose.ts: single-slip search over the step's moves. */
export function diagnose(plan: StepPlan, observations: readonly FaceObservation[]): Diagnosis {
  const moves = [...plan.setupMoves, ...plan.algorithm];
  const fits: LikelyMistake[] = [];
  for (const c of candidates(moves)) {
    let resulting: CubeState;
    try {
      resulting = viewInGrip(applyMoves(plan.startState, c.performed), plan.gripAfter).state;
    } catch {
      continue;
    }
    const misses = contradictions(resulting, observations);
    if (misses > 0) continue;
    fits.push({
      kind: c.kind,
      moveIndex: c.moveIndex,
      confidence: PRIOR[c.kind],
      description: c.description,
      performedMoves: c.performed,
      resultingState: resulting,
      score: Math.log(PRIOR[c.kind]),
      contradictions: 0,
    });
  }
  const total = fits.reduce((sum, f) => sum + f.confidence, 0);
  const ranked = fits
    .map((f) => ({ ...f, confidence: total > 0 ? Math.round((f.confidence / total) * 100) / 100 : 0 }))
    .sort((a, b) => b.score - a.score || (a.moveIndex ?? 0) - (b.moveIndex ?? 0));
  const distinct = new Set(ranked.map((f) => JSON.stringify(f.resultingState)));
  return { likelyMistakes: ranked, confident: ranked.length > 0 && distinct.size === 1 };
}

/** Stand-in for `planRecovery` from src/tutor/recovery.ts. */
export function planRecovery(plan: StepPlan, diagnosis: Diagnosis): Recovery {
  const top = diagnosis.likelyMistakes[0];
  if (top && diagnosis.confident) {
    return { kind: 'continue', state: top.resultingState, grip: plan.gripAfter, description: top.description };
  }
  if (diagnosis.showNext) return { kind: 'show-face', face: diagnosis.showNext };
  return { kind: 'rescan' };
}
