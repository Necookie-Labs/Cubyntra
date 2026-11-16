import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { createSolvedCubeState } from '../src/cube/constants';
import { isLayerSolved, isMiddleLayerSolved } from '../src/cube/pieces';
import { applyMoves, invertAlgorithm, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import { LastLayerCase, OLL_CORNER_CASES, OLL_EDGE_CASES } from '../src/tutor/cases/oll2look';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from '../src/tutor/cases/pll2look';
import { LOOKS } from './helpers/lastLayerLooks';

/** A solved cube held with yellow on top and green in front (red left, orange right). */
const solved = applyMoves(createSolvedCubeState(), parseAlgorithm('z2'));

function setUp(c: LastLayerCase): CubeState {
  return applyMoves(solved, invertAlgorithm(parseAlgorithm(c.algorithm)));
}

const firstTwoLayersSolved = (s: CubeState) => isLayerSolved(s, 'white') && isMiddleLayerSolved(s, 'white');
const fingerprint = (s: CubeState) => JSON.stringify(s);

describe('2-look OLL table', () => {
  it('has 3 edge cases and 7 corner cases with unique ids', () => {
    expect(OLL_EDGE_CASES).toHaveLength(3);
    expect(OLL_CORNER_CASES).toHaveLength(7);
    const ids = [...OLL_EDGE_CASES, ...OLL_CORNER_CASES].map((c) => c.id);
    expect(new Set(ids).size).toBe(10);
  });

  it('every algorithm keeps the first two layers and starts from an unoriented top', () => {
    for (const c of [...OLL_EDGE_CASES, ...OLL_CORNER_CASES]) {
      const start = setUp(c);
      expect(firstTwoLayersSolved(start), c.id).toBe(true);
      expect(start.U.every((color) => color === 'yellow'), c.id).toBe(false);
    }
  });

  it('every case starts from what its recognition describes, and from no other case', () => {
    for (const cases of [OLL_EDGE_CASES, OLL_CORNER_CASES]) {
      for (const c of cases) {
        const start = setUp(c);
        expect(LOOKS[c.id](start), c.id).toBe(true);
        for (const other of cases) {
          if (other.id !== c.id) expect(LOOKS[other.id](start), `${c.id} seen as ${other.id}`).toBe(false);
        }
      }
    }
  });
});

describe('2-look PLL table', () => {
  it('has 2 corner cases and 4 edge cases, all different', () => {
    expect(PLL_CORNER_CASES).toHaveLength(2);
    expect(PLL_EDGE_CASES).toHaveLength(4);
    const all = [...PLL_CORNER_CASES, ...PLL_EDGE_CASES];
    expect(new Set(all.map((c) => c.id)).size).toBe(6);
    expect(new Set(all.map((c) => fingerprint(setUp(c)))).size).toBe(6);
  });

  it('every algorithm only moves top-layer pieces and keeps yellow on top', () => {
    for (const c of [...PLL_CORNER_CASES, ...PLL_EDGE_CASES]) {
      const start = setUp(c);
      expect(firstTwoLayersSolved(start), c.id).toBe(true);
      expect(start.U.every((color) => color === 'yellow'), c.id).toBe(true);
      expect(isCubeSolved(start), c.id).toBe(false);
    }
  });

  it('every case starts from what its recognition describes, and from no other case', () => {
    for (const cases of [PLL_CORNER_CASES, PLL_EDGE_CASES]) {
      for (const c of cases) {
        const start = setUp(c);
        expect(LOOKS[c.id](start), c.id).toBe(true);
        for (const other of cases) {
          if (other.id !== c.id) expect(LOOKS[other.id](start), `${c.id} seen as ${other.id}`).toBe(false);
        }
      }
    }
  });

  it('edge cases leave the corners where they are', () => {
    for (const c of PLL_EDGE_CASES) {
      const start = setUp(c);
      for (const face of ['F', 'R', 'B', 'L'] as const) {
        expect([start[face][0], start[face][2]], c.id).toEqual([start[face][4], start[face][4]]);
      }
    }
  });
});
