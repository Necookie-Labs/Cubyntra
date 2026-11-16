/**
 * Cubyntra - Checkpoint adapter wiring (verify, diagnoseMistake, decideRecovery, replanFromScan)
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import type { CubeColor } from '../src/cube/types';
import { applyMoves, invertMove } from '../src/cube/transforms';
import { viewInGrip } from '../src/cube/grip';
import { FACES } from '../src/cube/constants';
import { runGuidedSolve } from '../src/tutor';
import { observationOf } from '../src/tutor/checkpoint';
import type { StepPlan } from '../src/tutor/types';
import {
  checkCheckpoint,
  checkWithEdits,
  confirmCheckpointByHand,
  faceToShowNext,
  replanAfterRescan,
  toCoachDiagnosis,
} from '../src/app-shell/checkpointAdapter';
import { scrambledState } from './helpers/scrambles';

const steps = runGuidedSolve(scrambledState(17, 2), 'beginner').steps;
/** A step with at least three layer turns, so a slip in the middle changes the cube. */
const plan = steps.find((s) => s.algorithm.filter((m) => m.kind !== 'rotation').length >= 3)!;
const moves = [...plan.setupMoves, ...plan.algorithm];
const shown = (p: StepPlan, state = p.expectedState) => FACES.map((face) => observationOf(state, face));

describe('checkpoint adapter', () => {
  it('passes a correct cube straight through, with no diagnosis', () => {
    const outcome = checkCheckpoint(plan, shown(plan));
    expect(outcome.result.status).toBe('match');
    expect(outcome.diagnosis).toBeNull();
    expect(outcome.recovery).toBeNull();
  });

  it('diagnoses a wrong-way turn with diagnoseMistake and resumes with decideRecovery', () => {
    let resumed = 0;
    moves.forEach((move, i) => {
      if (move.kind === 'rotation' || move.quarterTurns === 2) return;
      const performed = moves.map((m, k) => (k === i ? invertMove(m) : m));
      const actual = viewInGrip(applyMoves(plan.startState, performed), plan.gripAfter).state;
      const outcome = checkCheckpoint(plan, shown(plan, actual));
      if (outcome.result.status !== 'mismatch') return; // this slip left the checked stickers alone
      const kinds = outcome.diagnosis!.likelyMistakes.map((m) => `${m.kind}@${m.moveIndex}`);
      expect(kinds).toContain(`wrong-direction@${i}`);
      const recovery = outcome.recovery!;
      if (recovery.action !== 'resume') return;
      resumed++;
      const next = recovery.resume.plan!;
      expect(next.startState).toEqual(actual);
      if (recovery.resume.kind === 'corrective') expect(next.expectedState).toEqual(plan.expectedState);
    });
    expect(resumed).toBeGreaterThan(0);
  });

  it('names the face to show next only when the recovery asks for one', () => {
    expect(faceToShowNext(null)).toBeNull();
    const base = checkCheckpoint(plan, shown(plan));
    expect(faceToShowNext(base)).toBeNull();
    expect(
      faceToShowNext({ ...base, recovery: { action: 'needsRescan', reason: 'not-confident', showNext: 'R' } })
    ).toBe('R');
  });

  it('plans again from a rescan, held as the student last was', () => {
    const replan = replanAfterRescan(plan.expectedState, plan.method, plan.gripAfter, plan.stepIndex + 1);
    expect(replan.ok).toBe(true);
    if (replan.ok) {
      expect(replan.grip).toEqual(plan.gripAfter);
      expect(replan.plan?.stepIndex).toBe(plan.stepIndex + 1);
    }
  });

  it('confirms by hand as a manual match', () => {
    const outcome = confirmCheckpointByHand(plan);
    expect(outcome.result.status).toBe('match');
    expect(outcome.result.manual).toBe(true);
  });

  it('re-checks after tile edits', () => {
    const ref = plan.checkpoint.stickers[0];
    const wrong: CubeColor = plan.expectedState[ref.face][ref.index] === 'red' ? 'blue' : 'red';
    const observations = shown(plan).map((o) =>
      o.face === ref.face
        ? { ...o, stickers: o.stickers.map((s, i) => (i === ref.index ? { color: wrong, confidence: 1 } : s)) }
        : o
    );
    expect(checkCheckpoint(plan, observations).result.status).toBe('mismatch');
    const fixed = checkWithEdits(plan, observations, ref.face, [
      { index: ref.index, color: plan.expectedState[ref.face][ref.index] },
    ]);
    expect(fixed.result.status).toBe('match');
  });

  it('hands the coach the diagnosis only when it names a mistake', () => {
    expect(toCoachDiagnosis(null)).toBeUndefined();
    expect(toCoachDiagnosis({ likelyMistakes: [], confident: false })).toBeUndefined();
    const diagnosed = moves
      .map((_, i) => viewInGrip(applyMoves(plan.startState, moves.filter((__, k) => k !== i)), plan.gripAfter).state)
      .map((actual) => checkCheckpoint(plan, shown(plan, actual)).diagnosis)
      .find((d) => d && d.likelyMistakes.length > 0);
    expect(diagnosed).toBeTruthy();
    expect(toCoachDiagnosis(diagnosed!)).toBe(diagnosed);
  });
});
