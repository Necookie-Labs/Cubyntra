/**
 * Cubyntra - Checkpoint adapter (verification, stand-in diagnosis, recovery)
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { applyMoves, invertMove } from '../src/cube/transforms';
import { viewInGrip } from '../src/cube/grip';
import { FACES } from '../src/cube/constants';
import { runGuidedSolve } from '../src/tutor';
import { observationOf } from '../src/tutor/checkpoint';
import type { StepPlan } from '../src/tutor/types';
import type { CubeColor } from '../src/cube/types';
import {
  checkCheckpoint,
  checkWithEdits,
  confirmCheckpointByHand,
  planRecovery,
  toCoachDiagnosis,
} from '../src/app-shell/checkpointAdapter';
import { scrambledState } from './helpers/scrambles';

const steps = runGuidedSolve(scrambledState(17, 2), 'beginner').steps;
/** A step with at least two layer turns, so a slip in the middle changes the cube. */
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

  it('diagnoses a move turned the wrong way and offers to continue from that cube', () => {
    let mismatches = 0;
    moves.forEach((move, i) => {
      if (move.kind === 'rotation' || move.quarterTurns === 2) return;
      const performed = moves.map((m, k) => (k === i ? invertMove(m) : m));
      const actual = viewInGrip(applyMoves(plan.startState, performed), plan.gripAfter).state;
      const outcome = checkCheckpoint(plan, shown(plan, actual));
      if (outcome.result.status !== 'mismatch') return; // this slip left the check spec alone
      mismatches++;
      const kinds = outcome.diagnosis!.likelyMistakes.map((m) => `${m.kind}@${m.moveIndex}`);
      expect(kinds).toContain(`wrong-direction@${i}`);
      for (const m of outcome.diagnosis!.likelyMistakes) expect(m.description).not.toMatch(/[RLUDFB]'/);
      if (outcome.recovery?.kind === 'continue') expect(outcome.recovery.state).toEqual(actual);
    });
    expect(mismatches).toBeGreaterThan(0);
  });

  it('asks for a rescan when nothing explains what the camera saw', () => {
    const diagnosis = { likelyMistakes: [], confident: false };
    expect(planRecovery(plan, diagnosis)).toEqual({ kind: 'rescan' });
    expect(planRecovery(plan, { ...diagnosis, showNext: 'R' })).toEqual({ kind: 'show-face', face: 'R' });
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

  it('hands the coach a compact diagnosis', () => {
    expect(toCoachDiagnosis(null)).toBeUndefined();
    expect(toCoachDiagnosis({ likelyMistakes: [], confident: false })).toBeUndefined();
    const diagnosis = {
      confident: true,
      likelyMistakes: [
        {
          kind: 'skipped-move' as const,
          moveIndex: 2,
          confidence: 0.7,
          description: 'x',
          performedMoves: [],
          resultingState: plan.expectedState,
          score: 0,
          contradictions: 0,
        },
      ],
    };
    expect(toCoachDiagnosis(diagnosis)).toEqual({
      likelyMistakes: [{ kind: 'skipped-move', moveIndex: 2, confidence: 0.7 }],
    });
  });
});
