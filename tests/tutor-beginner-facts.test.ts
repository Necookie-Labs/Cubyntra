/**
 * The beginner facts tell the student how to hold the cube ("L at the back-left", "matching
 * edges at the back and the right", "the corner in place at the front-right"). These tests check
 * that the cube really is held that way once the setup moves are done, on many scrambles.
 */

import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { applyMoves } from '../src/cube/transforms';
import { runGuidedSolve } from '../src/tutor';
import { solvedLastEdges } from '../src/tutor/helpers';
import { scrambledState } from './helpers/scrambles';

const steps = Array.from({ length: 150 }, (_, n) => runGuidedSolve(scrambledState(61, n), 'beginner').steps).flat();
const afterSetup = (caseId: string): CubeState[] =>
  steps.filter((s) => s.caseId === caseId).map((s) => applyMoves(s.startState, s.setupMoves));
const yellowEdgesUp = (s: CubeState) => [1, 3, 5, 7].filter((i) => s.U[i] === 'yellow');
const matches = (s: CubeState, face: 'F' | 'R' | 'B' | 'L') => s[face][1] === s[face][4];

describe('beginner facts match the cube after the setup moves', () => {
  it('yellow cross: the L points back-left and the line runs left to right', () => {
    const ls = afterSetup('yellow-cross-l');
    const lines = afterSetup('yellow-cross-line');
    expect(ls.length).toBeGreaterThan(20);
    expect(lines.length).toBeGreaterThan(20);
    for (const s of ls) expect(yellowEdgesUp(s)).toEqual([1, 3]);
    for (const s of lines) expect(yellowEdgesUp(s)).toEqual([3, 5]);
    for (const s of afterSetup('yellow-cross-dot')) expect(yellowEdgesUp(s)).toEqual([]);
  });

  it('yellow edges: the matching neighbours are held at the back and the right', () => {
    const adjacent = afterSetup('yellow-edges-adjacent');
    expect(adjacent.length).toBeGreaterThan(20);
    for (const s of adjacent) {
      expect([matches(s, 'B'), matches(s, 'R'), matches(s, 'F'), matches(s, 'L')]).toEqual([true, true, false, false]);
    }
    // One round from that hold finishes the stage: no extra lining-up step afterwards.
    for (const step of steps.filter((x) => x.caseId === 'yellow-edges-adjacent')) {
      expect(solvedLastEdges(step.expectedState)).toBe(4);
    }
    // Across from each other: two edges match, on opposite sides.
    const opposite = afterSetup('yellow-edges-opposite');
    expect(opposite.length).toBeGreaterThan(5);
    for (const s of opposite) {
      const sides = (['F', 'R', 'B', 'L'] as const).filter((f) => matches(s, f)).join('');
      expect(['FB', 'RL']).toContain(sides);
    }
  });

  it('yellow corners: the corner that is in place is held at the front-right', () => {
    const one = afterSetup('yellow-corners-one');
    expect(one.length).toBeGreaterThan(20);
    for (const s of one) {
      const corner = [s.U[8], s.F[2], s.R[0]].sort();
      expect(corner).toEqual([s.U[4], s.F[4], s.R[4]].sort());
    }
  });

  it('middle edges: the edge is above its own center, and its top color names the side it goes to', () => {
    for (const [caseId, side] of [['middle-edge-right', 'R'], ['middle-edge-left', 'L']] as const) {
      const ready = afterSetup(caseId);
      expect(ready.length).toBeGreaterThan(20);
      for (const s of ready) {
        expect(s.F[1]).toBe(s.F[4]);
        expect(s.U[7]).toBe(s[side][4]);
      }
    }
  });

  it('white corners: the corner waits right under its home at the front-right', () => {
    const below = steps.filter((s) => s.caseId === 'white-corner-below');
    expect(below.length).toBeGreaterThan(100);
    for (const step of below) {
      const s = applyMoves(step.startState, step.setupMoves);
      const corner = [s.D[2], s.F[8], s.R[6]].sort();
      expect(corner).toEqual([s.U[4], s.F[4], s.R[4]].sort());
    }
  });

  it('white cross: the petal sits above its own center before the half turn', () => {
    for (const step of steps.filter((s) => s.caseId === 'white-cross-petal')) {
      const s = applyMoves(step.startState, step.setupMoves);
      const move = step.algorithm[0];
      if (move.kind !== 'face') throw new Error('expected a face turn');
      expect(s[move.face][1]).toBe(s[move.face][4]);
      expect(s[move.face][4]).toBe(step.highlightPieces[0].colors[1]);
    }
  });
});
