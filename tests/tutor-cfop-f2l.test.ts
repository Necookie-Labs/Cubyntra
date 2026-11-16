import { describe, expect, it } from 'vitest';
import { findCorner, findEdge, isCrossSolved } from '../src/cube/pieces';
import { applyMoves, formatAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { F2L_CASES } from '../src/tutor/cases/f2l';
import { currentStageIn } from '../src/tutor/engine';
import { countTurns } from '../src/tutor/helpers';
import { CFOP_METHOD, f2lRecognitionIndex } from '../src/tutor/methods/cfop';
import { scrambledState } from './helpers/scrambles';
import { allMoves, before, checkedPlan, firstTwoLayersSolved, followUntil, yellowTop } from './helpers/tutorSteps';

describe('F2L recognition index', () => {
  it('knows every position of a pair that is on top or in its slot, except the solved one', () => {
    const index = f2lRecognitionIndex();
    expect(index.size).toBe(36 * 4 + 5);
    expect(index.has('DFR0-FR0')).toBe(false);
    expect(new Set([...index.values()].map((r) => r.case.id)).size).toBe(41);
  });
});

describe('CFOP F2L: one pair per step from the table', () => {
  it('recognises each of the 41 cases set up by undoing its algorithm', () => {
    for (const c of F2L_CASES) {
      const start = before(c.algorithm);
      expect(currentStageIn(CFOP_METHOD, start)?.id, c.id).toBe('f2l');
      const plan = checkedPlan(CFOP_METHOD, start);
      expect(plan.caseId, c.id).toBe(c.id);
      expect(plan.caseName).toBe(c.name);
      // A leading top turn is the line-up; together they are exactly the table algorithm.
      expect(allMoves(plan), c.id).toBe(c.algorithm);
      expect(plan.setupMoves.every((m) => m.kind === 'face' && m.face === 'U'), c.id).toBe(true);
      expect(firstTwoLayersSolved(plan.expectedState), c.id).toBe(true);
      expect(plan.highlightPieces.map((p) => p.kind)).toEqual(['corner', 'edge']);
      expect(plan.targetSlot?.kind).toBe('corner');
    }
  });

  it('recognises each case from another side and with the top turned', () => {
    for (const c of F2L_CASES) {
      for (const lineUp of ["y U'", 'y2 U2', "y' U"]) {
        const start = before(`${lineUp} ${c.algorithm}`);
        const plan = checkedPlan(CFOP_METHOD, start);
        expect(plan.caseId, `${c.id} after ${lineUp}`).toBe(c.id);
        expect(formatAlgorithm(plan.setupMoves.slice(0, 1))).toBe(lineUp.split(' ')[0]);
        expect(firstTwoLayersSolved(plan.expectedState)).toBe(true);
        // The top turn is merged with the algorithm's own first top turn: never two in a row.
        expect(countTurns([...plan.setupMoves, ...plan.algorithm])).toBeLessThanOrEqual(
          parseAlgorithm(c.algorithm).length + 1
        );
        const turns = [...plan.setupMoves, ...plan.algorithm].filter((m) => m.kind === 'face');
        for (let i = 1; i < turns.length; i++) {
          const [a, b] = [turns[i - 1], turns[i]];
          expect(a.kind === 'face' && b.kind === 'face' && a.face === b.face).toBe(false);
        }
      }
    }
  });

  it('describes the position the student actually sees', () => {
    const plan = checkedPlan(CFOP_METHOD, before("U2 R U R'"));
    expect(plan.caseId).toBe('f2l-04');
    expect(plan.facts.lookFor).toContain('Hold the green side in front and the orange side on the right.');
    // Before the U2 line-up the corner is at the back-left of the top, not above the slot.
    expect(plan.facts.lookFor).toContain('Corner at the top back-left');
  });

  it('picks the cheapest pair when several are ready', () => {
    // Two pairs are out. The front-right one is 3 turns from home; the other one, seen after y,
    // was an 8-turn case before those 3 turns were undone.
    const start = before(`R U R' y U' R U R' U2 R U' R'`);
    const plan = checkedPlan(CFOP_METHOD, start);
    expect(allMoves(plan)).toBe("R U R'");
    expect(plan.progressAfter - plan.progressBefore).toBeGreaterThanOrEqual(2);
  });
});

describe('CFOP F2L: pieces stuck in the wrong slot', () => {
  it('frees an edge that sits in another slot, then solves both pairs', () => {
    // (R2 U2) x3 swaps the front-right and back-right edges and two top edges.
    const start = applyMoves(yellowTop, parseAlgorithm('R2 U2 R2 U2 R2 U2'));
    expect(isCrossSolved(start, 'white')).toBe(true);
    const plan = checkedPlan(CFOP_METHOD, start);
    expect(plan.stage).toBe('f2l');
    expect(plan.caseId).toBe('f2l-extract-edge');
    expect(plan.highlightPieces).toHaveLength(1);
    const [a, b] = plan.highlightPieces[0].colors;
    expect(findEdge(plan.startState, [a, b]).slot.startsWith('U')).toBe(false);
    expect(findEdge(plan.expectedState, [a, b]).slot.startsWith('U')).toBe(true);
    expect(isCrossSolved(plan.expectedState, 'white')).toBe(true);

    const rest = followUntil(CFOP_METHOD, plan.expectedState, firstTwoLayersSolved, 6);
    expect(rest.steps.every((s) => s.stage === 'f2l')).toBe(true);
  });

  it('frees stuck corners too, and always finishes the first two layers', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 60; n++) {
      const start = applyMoves(scrambledState(31, n), parseAlgorithm('z2'));
      const { steps } = followUntil(CFOP_METHOD, start, firstTwoLayersSolved, 14);
      expect(steps[0].stage).toBe('cross');
      for (const step of steps.slice(1)) {
        expect(step.stage).toBe('f2l');
        seen.add(step.caseId);
        if (step.caseId === 'f2l-extract-corner') {
          const [x, y, z] = step.highlightPieces[0].colors;
          expect(findCorner(step.startState, [x, y, z]).slot.startsWith('D')).toBe(true);
          expect(findCorner(step.expectedState, [x, y, z]).slot.startsWith('U')).toBe(true);
        }
      }
      // Four pairs, and never more than one extraction per piece (8 pieces).
      expect(steps.length - 1).toBeLessThanOrEqual(12);
    }
    expect(seen.has('f2l-extract-corner')).toBe(true);
    expect(seen.has('f2l-extract-edge')).toBe(true);
  });
});
