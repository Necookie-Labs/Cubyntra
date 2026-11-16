import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { createSolvedCubeState } from '../src/cube/constants';
import { isLayerSolved } from '../src/cube/pieces';
import { applyMoves, formatAlgorithm, invertAlgorithm, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import { CORNER_TRIGGER, orientStage, planOrientCorners, yellowCornersUp } from '../src/tutor/methods/orientCorners';
import { StepDraft, TutorPlanError } from '../src/tutor/types';
import { scrambledState } from './helpers/scrambles';

/** Solved, held with yellow on top and green in front. */
const yellowTop = applyMoves(createSolvedCubeState(), parseAlgorithm('z2'));
const T = CORNER_TRIGGER;
const rounds = (n: number) => Array(n).fill(T).join(' ');

/** The cube a student would have before doing `solution`. */
const before = (solution: string) => applyMoves(yellowTop, invertAlgorithm(parseAlgorithm(solution)));
const doStep = (state: CubeState, draft: StepDraft) => applyMoves(state, [...draft.setupMoves, ...draft.algorithm]);

describe('recognising the last beginner stage', () => {
  it('accepts a cube with solved lower layers and the top in place or a turn away', () => {
    expect(orientStage(yellowTop)).toEqual({ turns: 0, lowerSolved: true });
    expect(orientStage(applyMoves(yellowTop, parseAlgorithm('U')))).toEqual({ turns: 0, lowerSolved: true });
    expect(orientStage(before(`${rounds(2)} U ${rounds(4)} U'`))).toEqual({ turns: 0, lowerSolved: true });
  });

  it('accepts the scrambled-looking cube between two corners, from any side', () => {
    const middle = applyMoves(before(`${rounds(2)} U ${rounds(4)} U'`), parseAlgorithm(rounds(2)));
    expect(isLayerSolved(middle, 'white')).toBe(false);
    expect(orientStage(middle)).toEqual({ turns: 0, lowerSolved: false });
    // Seen after y, the student has to turn back by y' (3 quarter turns of y) to carry on.
    expect(orientStage(applyMoves(middle, parseAlgorithm('y')))).toEqual({ turns: 3, lowerSolved: false });
    // A fresh scan stores the cube with white on top; the stage is still recognised.
    expect(orientStage(applyMoves(middle, parseAlgorithm('z2')))).toMatchObject({ lowerSolved: false });
    // The other shuffle, left by a net four rounds.
    const other = applyMoves(before(`${rounds(4)} U ${rounds(2)} U'`), parseAlgorithm(rounds(4)));
    expect(orientStage(other)).toEqual({ turns: 0, lowerSolved: false });
  });

  it('rejects every other cube', () => {
    expect(orientStage(scrambledState(3, 1))).toBeNull();
    expect(orientStage(applyMoves(yellowTop, parseAlgorithm('R')))).toBeNull();
    // Lower layers solved, yellow cross made, but two top edges swapped with two corners (T perm).
    expect(orientStage(applyMoves(yellowTop, parseAlgorithm("R U R' U' R' F R2 U' R' U' R U R' F'")))).toBeNull();
    // Shuffled lower layers with a top layer that was never ready.
    const middle = applyMoves(before(`${rounds(2)} U ${rounds(4)} U'`), parseAlgorithm(rounds(2)));
    expect(orientStage(applyMoves(middle, parseAlgorithm("U R U' L' U R' U' L")))).toBeNull();
  });
});

describe('twisting the yellow corners', () => {
  it('twists one corner at a time, turning only the top in between, then lines the top up', () => {
    let state = before(`${rounds(2)} U ${rounds(4)} U'`);
    expect(yellowCornersUp(state)).toBe(2);

    const first = planOrientCorners(state);
    expect(first.caseId).toBe('yellow-corner-twist-2');
    expect(first.setupMoves).toEqual([]);
    expect(formatAlgorithm(first.algorithm)).toBe(rounds(2));
    expect(first.facts.repeat?.times).toBe(2);
    expect(formatAlgorithm(first.facts.repeat!.unit)).toBe(T);
    state = doStep(state, first);
    expect(yellowCornersUp(state)).toBe(3);

    const second = planOrientCorners(state);
    expect(second.caseId).toBe('yellow-corner-twist-4');
    expect(formatAlgorithm(second.setupMoves)).toBe('U');
    expect(formatAlgorithm(second.algorithm)).toBe(rounds(4));
    expect(second.facts.lookFor).toMatch(/look scrambled/);
    state = doStep(state, second);
    expect(yellowCornersUp(state)).toBe(4);

    const last = planOrientCorners(state);
    expect(last.caseId).toBe('yellow-corners-align');
    expect(formatAlgorithm(last.algorithm)).toBe("U'");
    expect(isCubeSolved(doStep(state, last))).toBe(true);
  });

  it('handles three corners twisted the same way', () => {
    let state = before(`${rounds(2)} U ${rounds(2)} U ${rounds(2)} U2`);
    const cases: string[] = [];
    for (let i = 0; i < 6 && !isCubeSolved(state); i++) {
      const draft = planOrientCorners(state);
      cases.push(draft.caseId);
      state = doStep(state, draft);
    }
    expect(isCubeSolved(state)).toBe(true);
    expect(cases).toEqual([
      'yellow-corner-twist-2', 'yellow-corner-twist-2', 'yellow-corner-twist-2', 'yellow-corners-align',
    ]);
  });

  it('turns the student back to the grip the stage was started in', () => {
    const middle = applyMoves(before(`${rounds(2)} U ${rounds(4)} U'`), parseAlgorithm(`${rounds(2)} y`));
    const draft = planOrientCorners(middle);
    expect(formatAlgorithm(draft.setupMoves)).toBe("y' U");
    expect(yellowCornersUp(doStep(middle, draft))).toBe(4);
  });

  it('throws for a cube that is not in this stage', () => {
    expect(() => planOrientCorners(applyMoves(yellowTop, parseAlgorithm('R')))).toThrow(TutorPlanError);
  });
});
