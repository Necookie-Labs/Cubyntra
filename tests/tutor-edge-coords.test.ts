import { describe, expect, it } from 'vitest';
import { applyMove } from '../src/cube/transforms';
import { FACE_TURNS, edgeCoord, edgeMoveTable, shortestEdgeSequence } from '../src/tutor/edgeCoords';
import { scrambledState } from './helpers/scrambles';

describe('edge coordinates', () => {
  it('move table agrees with the cube engine for every turn and every edge', () => {
    const table = edgeMoveTable();
    const state = scrambledState(7, 1);
    const edges = [
      ['white', 'green'], ['white', 'red'], ['white', 'blue'], ['white', 'orange'],
      ['yellow', 'green'], ['yellow', 'red'], ['yellow', 'blue'], ['yellow', 'orange'],
      ['green', 'red'], ['green', 'orange'], ['blue', 'red'], ['blue', 'orange'],
    ] as const;
    FACE_TURNS.forEach((move, m) => {
      const after = applyMove(state, move);
      for (const colors of edges) {
        expect(table[m][edgeCoord(state, colors)]).toBe(edgeCoord(after, colors));
        // Tracking the other color flips the orientation bit.
        expect(edgeCoord(state, [colors[1], colors[0]])).toBe(edgeCoord(state, colors) ^ 1);
      }
    });
  });

  it('finds a shortest sequence by iterative deepening', () => {
    // An edge at UF (coordinate 6) reaches DF (coordinate 16) with one half turn of F.
    const found = shortestEdgeSequence([6], (c) => c[0] === 16, 3);
    expect(found?.map((m) => m.notation)).toEqual(['F2']);
    expect(shortestEdgeSequence([6], (c) => c[0] === 99, 2)).toBeNull();
  });
});
