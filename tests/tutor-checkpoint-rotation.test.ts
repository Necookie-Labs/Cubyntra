/**
 * Cubyntra - Checkpoint faces shown rotated
 * Necookie Labs (c) 2026
 *
 * A face's center says which face it is, not which way up it was held. The check tries the
 * picture turned, accepts a turn only when it is the one way to explain the reading, and asks
 * again (with which edge goes at the top) when a turn of that layer would look the same.
 */

import { describe, expect, it } from 'vitest';
import { FACES } from '../src/cube/constants';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import { viewInGrip } from '../src/cube/grip';
import { runGuidedSolve } from '../src/tutor';
import {
  PICTURE_TOP,
  describeFace,
  observationOf,
  showFaceInstruction,
  turnPicture,
  verifyCheckpoint,
} from '../src/tutor/checkpoint';
import { diagnoseMistake } from '../src/tutor/diagnose';
import { checkCheckpoint } from '../src/app-shell/checkpointAdapter';
import type { FaceObservation, StepPlan } from '../src/tutor/types';
import { scrambledState } from './helpers/scrambles';

const steps: StepPlan[] = [
  ...runGuidedSolve(scrambledState(31, 1), 'beginner').steps,
  ...runGuidedSolve(scrambledState(31, 2), 'cfop').steps,
];

const turned = (o: FaceObservation, k: 1 | 2 | 3): FaceObservation => ({ face: o.face, stickers: turnPicture(o.stickers, k) });

describe('turnPicture', () => {
  it('turns a 3x3 picture clockwise, four turns giving it back', () => {
    const tiles = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(turnPicture(tiles, 1)).toEqual([6, 3, 0, 7, 4, 1, 8, 5, 2]);
    expect(turnPicture(turnPicture(tiles, 3), 1)).toEqual(tiles);
    expect(turnPicture(tiles, 2)).toEqual([...tiles].reverse());
  });
});

describe('showing a face held rotated', () => {
  it('never reports a correctly done step as a mismatch, whichever way a face is turned', () => {
    let matched = 0;
    let unclear = 0;
    let tried = 0;
    for (const plan of steps) {
      for (const face of plan.checkpoint.facesToShow) {
        for (const k of [1, 2, 3] as const) {
          const shown = plan.checkpoint.facesToShow.map((f) => {
            const o = observationOf(plan.expectedState, f);
            return f === face ? turned(o, k) : o;
          });
          // A face that looks the same turned is no test of the turn.
          if (shown.find((o) => o.face === face)!.stickers.every((s, i) => s.color === plan.expectedState[face][i])) continue;
          tried++;
          const result = verifyCheckpoint(plan, shown);
          expect(['match', 'uncertain'], `${plan.caseId} ${face} ${k}`).toContain(result.status);
          if (result.status === 'match') {
            matched++;
            expect(result.rotations?.[face]).toBe(4 - k);
          } else {
            unclear++;
            expect(result.rotationUnclear).toBe(face);
            const top = PICTURE_TOP[face];
            expect(result.message).toContain(`with ${describeFace(top, plan.expectedState[top][4])} at the top of the picture`);
          }
        }
      }
    }
    expect(tried).toBeGreaterThan(100);
    expect(matched + unclear).toBe(tried);
    expect(matched).toBeGreaterThan(0);
  });

  it('asks again when a turn of the shown layer would look the same, then trusts the hold', () => {
    let asked = 0;
    let direct = 0;
    for (const plan of steps) {
      const face = plan.checkpoint.facesToShow[0];
      // A real slip: the shown face's own layer turned once too often.
      const slipped = applyMoves(plan.expectedState, parseAlgorithm(face));
      const visible = plan.checkpoint.stickers.some((s) => slipped[s.face][s.index] !== plan.expectedState[s.face][s.index]);
      if (!visible) continue;
      const shown = plan.checkpoint.facesToShow.map((f) => observationOf(slipped, f));
      const first = checkCheckpoint(plan, shown);
      if (first.result.status === 'mismatch') {
        direct++;
        continue;
      }
      expect(first.result.status).toBe('uncertain');
      expect(first.result.rotationUnclear).toBe(face);
      // Shown again the asked way up: now it is a slip, never asked about twice.
      const second = checkCheckpoint(plan, shown, first);
      expect(second.result.status).toBe('mismatch');
      asked++;
    }
    expect(asked + direct).toBeGreaterThan(20);
  });

  it('asks again for a single shown face turned like its own layer', () => {
    const plan = steps.find((p) => p.checkpoint.stickers.some((s) => s.face === p.checkpoint.facesToShow[0]))!;
    const face = plan.checkpoint.facesToShow[0];
    const onlyFace = { ...plan, checkpoint: { ...plan.checkpoint, facesToShow: [face], stickers: plan.checkpoint.stickers.filter((s) => s.face === face) } };
    const slipped = applyMoves(plan.expectedState, parseAlgorithm(face));
    const shown = [observationOf(slipped, face)];
    if (shown[0].stickers.every((s, i) => s.color === plan.expectedState[face][i])) return;
    const first = checkCheckpoint(onlyFace, shown);
    expect(first.result.status).toBe('uncertain');
    expect(first.result.rotationUnclear).toBe(face);
    expect(checkCheckpoint(onlyFace, shown, first).result.status).toBe('mismatch');
  });

  it('accepts a turn when the other shown face rules out a turn of that layer', () => {
    let checked = 0;
    for (const plan of steps) {
      if (plan.checkpoint.facesToShow.length !== 2) continue;
      const [face, other] = plan.checkpoint.facesToShow;
      const o = observationOf(plan.expectedState, face);
      const shown = [turned(o, 1), observationOf(plan.expectedState, other)];
      if (shown[0].stickers.every((s, i) => s.color === plan.expectedState[face][i])) continue;
      const slipShows = (['', '2', "'"] as const).some((t) => {
        const alt = applyMoves(plan.expectedState, parseAlgorithm(`${face}${t}`));
        return FACES.filter((f) => f === face || f === other).every((f) =>
          (f === face ? shown[0] : shown[1]).stickers.every((s, i) => s.color === alt[f][i])
        );
      });
      if (slipShows) continue;
      const result = verifyCheckpoint(plan, shown);
      expect(result.status).toBe('match');
      expect(result.rotations).toEqual({ [face]: 3 });
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('finds a slip on a face that was also held rotated, when only one turn explains it', () => {
    let named = 0;
    let rotatedCases = 0;
    for (const plan of steps) {
      const moves = [...plan.setupMoves, ...plan.algorithm];
      const index = moves.findIndex((m) => m.kind !== 'rotation');
      if (index < 0) continue;
      const performed = moves.filter((_, i) => i !== index);
      const shownState = applyMoves(plan.startState, performed);
      const faces = plan.checkpoint.facesToShow;
      const shown = faces.map((f, i) => {
        const o = observationOf(viewInGripOf(plan, shownState), f);
        return i === 0 ? turned(o, 2) : o;
      });
      const diagnosis = diagnoseMistake(plan, shown);
      if (!diagnosis.rotations) continue;
      rotatedCases++;
      expect(diagnosis.rotations[faces[0]]).toBe(2);
      const top = diagnosis.likelyMistakes[0];
      const want = viewInGripOf(plan, shownState);
      if (faces.every((f) => top.resultingState[f].join() === want[f].join())) named++;
    }
    expect(rotatedCases).toBeGreaterThan(5);
    expect(named / rotatedCases).toBeGreaterThanOrEqual(0.95);
  });
});

describe('showFaceInstruction', () => {
  const grip = { top: 'yellow', front: 'red' } as const;
  it('says how to tilt the cube and which face goes at the top of the picture', () => {
    expect(showFaceInstruction(grip, 'U')).toBe(
      'Hold the cube with yellow on top and red facing you, then tilt the cube toward you so the top face (yellow center) faces the camera, keeping the front face (red center) at the bottom of the picture.'
    );
    expect(showFaceInstruction(grip, 'D')).toContain('tilt the cube back so the bottom face (white center) faces the camera, keeping the front face (red center) at the top of the picture');
    expect(showFaceInstruction(grip, 'R')).toContain('the right face (green center) faces the camera, keeping yellow at the top of the picture');
    expect(showFaceInstruction(grip, 'F')).toContain('front face (red center) at the camera, yellow at the top of the picture');
  });
});

function viewInGripOf(plan: StepPlan, state: ReturnType<typeof applyMoves>) {
  return viewInGrip(state, plan.gripAfter).state;
}
