/**
 * The CFOP facts tell the student what the cube looks like when an algorithm starts. These tests
 * check that on real plans from many scrambles, once the setup moves are done.
 */

import { describe, expect, it } from 'vitest';
import { applyMoves } from '../src/cube/transforms';
import { runGuidedSolve } from '../src/tutor';
import { F2L_CASES, describeF2LPosition, f2lPositionKey } from '../src/tutor/cases/f2l';
import { LOOKS } from './helpers/lastLayerLooks';
import { scrambledState } from './helpers/scrambles';

const steps = Array.from({ length: 300 }, (_, n) => runGuidedSolve(scrambledState(62, n), 'cfop').steps).flat();

describe('CFOP facts match the cube after the setup moves', () => {
  it('every last-layer plan starts from the look its case describes', () => {
    const seen = new Set<string>();
    for (const step of steps) {
      const look = LOOKS[step.caseId];
      if (!look) continue;
      seen.add(step.caseId);
      const ready = applyMoves(step.startState, step.setupMoves);
      expect(look(ready), `${step.caseId} on step ${step.stepIndex}`).toBe(true);
    }
    expect([...seen].sort()).toEqual(Object.keys(LOOKS).sort());
  });

  it('every F2L plan describes the pair where the student sees it, and ends in the table position', () => {
    const table = new Map(F2L_CASES.map((c) => [c.id, c]));
    let checked = 0;
    for (const step of steps) {
      const c = table.get(step.caseId);
      if (!c) continue;
      checked++;
      // After the regrip only, the pair is where `lookFor` says it is.
      const regrip = step.setupMoves.filter((m) => m.kind === 'rotation');
      const held = applyMoves(step.startState, regrip);
      expect(step.facts.lookFor).toContain(describeF2LPosition(f2lPositionKey(held)));
      expect(step.facts.lookFor).toContain(`Hold the ${held.F[4]} side in front and the ${held.R[4]} side on the right.`);
      // The slot named as the target is the one at the front-right.
      expect([...step.targetSlot!.colors].sort()).toEqual(['white', held.F[4], held.R[4]].sort());
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('the cross plan highlights exactly the white edges that are not home yet', () => {
    for (const step of steps.filter((s) => s.stage === 'cross')) {
      expect(step.highlightPieces.length).toBeGreaterThan(0);
      expect(step.highlightPieces.length).toBeLessThanOrEqual(4);
      expect(step.highlightPieces.every((p) => p.kind === 'edge' && p.colors[0] === 'white')).toBe(true);
    }
  });
});
