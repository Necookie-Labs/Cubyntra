import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { createSolvedCubeState } from '../src/cube/constants';
import { isLayerSolved, isMiddleLayerSolved } from '../src/cube/pieces';
import { applyMoves, invertAlgorithm, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import { LastLayerCase, OLL_CORNER_CASES, OLL_EDGE_CASES } from '../src/tutor/cases/oll2look';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from '../src/tutor/cases/pll2look';

/** A solved cube held with yellow on top and green in front (red left, orange right). */
const solved = applyMoves(createSolvedCubeState(), parseAlgorithm('z2'));

function setUp(c: LastLayerCase): CubeState {
  return applyMoves(solved, invertAlgorithm(parseAlgorithm(c.algorithm)));
}

function byId(cases: readonly LastLayerCase[], id: string): CubeState {
  const found = cases.find((c) => c.id === id);
  if (!found) throw new Error(`No case ${id}`);
  return setUp(found);
}

const yellowOnTop = (s: CubeState, indices: number[]) => indices.filter((i) => s.U[i] === 'yellow');
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

  it('edge cases start from the shapes their recognition describes', () => {
    const edges = [1, 3, 5, 7];
    expect(yellowOnTop(byId(OLL_EDGE_CASES, 'oll-edges-line'), edges)).toEqual([3, 5]);
    expect(yellowOnTop(byId(OLL_EDGE_CASES, 'oll-edges-l'), edges)).toEqual([5, 7]);
    expect(yellowOnTop(byId(OLL_EDGE_CASES, 'oll-edges-dot'), edges)).toEqual([]);
  });

  it('corner cases start with the yellow cross made and the corners as described', () => {
    const corners = [0, 2, 6, 8];
    const start = (id: string) => byId(OLL_CORNER_CASES, id);
    for (const c of OLL_CORNER_CASES) expect(yellowOnTop(setUp(c), [1, 3, 5, 7]), c.id).toHaveLength(4);

    const sune = start('oll-corners-sune');
    expect(yellowOnTop(sune, corners)).toEqual([6]);
    expect(sune.F[2]).toBe('yellow');

    const antisune = start('oll-corners-antisune');
    expect(yellowOnTop(antisune, corners)).toEqual([2]);
    expect(antisune.R[0]).toBe('yellow');

    const h = start('oll-corners-h');
    expect(yellowOnTop(h, corners)).toEqual([]);
    expect([h.L[0], h.L[2], h.R[0], h.R[2]]).toEqual(['yellow', 'yellow', 'yellow', 'yellow']);

    const pi = start('oll-corners-pi');
    expect(yellowOnTop(pi, corners)).toEqual([]);
    expect([pi.L[0], pi.L[2]]).toEqual(['yellow', 'yellow']);
    expect([pi.F[0], pi.F[2]].filter((c) => c === 'yellow')).toHaveLength(1);
    expect([pi.B[0], pi.B[2]].filter((c) => c === 'yellow')).toHaveLength(1);

    const headlights = start('oll-corners-headlights');
    expect(yellowOnTop(headlights, corners)).toEqual([0, 2]);
    expect([headlights.F[0], headlights.F[2]]).toEqual(['yellow', 'yellow']);

    const chameleon = start('oll-corners-chameleon');
    expect(yellowOnTop(chameleon, corners)).toEqual([2, 8]);
    expect([chameleon.F[0], chameleon.B[2]]).toEqual(['yellow', 'yellow']);

    const bowtie = start('oll-corners-bowtie');
    expect(yellowOnTop(bowtie, corners)).toEqual([0, 8]);
    expect(bowtie.F[0]).toBe('yellow');
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

  it('corner cases start from the headlights their recognition describes', () => {
    const t = byId(PLL_CORNER_CASES, 'pll-corners-t');
    expect(t.L[0]).toBe(t.L[2]);
    for (const face of ['F', 'R', 'B'] as const) expect(t[face][0]).not.toBe(t[face][2]);

    const y = byId(PLL_CORNER_CASES, 'pll-corners-y');
    for (const face of ['F', 'R', 'B', 'L'] as const) expect(y[face][0]).not.toBe(y[face][2]);
  });

  it('edge cases keep the corners solved and move the edges as described', () => {
    for (const c of PLL_EDGE_CASES) {
      const start = setUp(c);
      for (const face of ['F', 'R', 'B', 'L'] as const) {
        expect([start[face][0], start[face][2]], c.id).toEqual([start[face][4], start[face][4]]);
      }
    }
    const ua = byId(PLL_EDGE_CASES, 'pll-edges-ua');
    expect(ua.B[1]).toBe(ua.B[4]);
    expect(ua.F[1]).toBe(ua.R[4]);

    const ub = byId(PLL_EDGE_CASES, 'pll-edges-ub');
    expect(ub.B[1]).toBe(ub.B[4]);
    expect(ub.F[1]).toBe(ub.L[4]);

    const h = byId(PLL_EDGE_CASES, 'pll-edges-h');
    expect([h.F[1], h.L[1]]).toEqual([h.B[4], h.R[4]]);

    const z = byId(PLL_EDGE_CASES, 'pll-edges-z');
    expect([z.F[1], z.B[1]]).toEqual([z.L[4], z.R[4]]);
  });
});
