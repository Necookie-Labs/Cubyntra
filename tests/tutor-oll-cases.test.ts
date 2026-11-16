import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { applyMoves, invertAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { OLL_CASES, OllCase } from '../src/tutor/cases/oll';
import {
  YELLOW_TOP,
  describeOll,
  firstTwoLayersSolved,
  ollClass,
  ollPattern,
  topIsYellow,
} from './helpers/lastLayerFull';

/** The cube a student has just before doing the case's algorithm. */
function setUp(c: OllCase): CubeState {
  return applyMoves(YELLOW_TOP, invertAlgorithm(parseAlgorithm(c.algorithm)));
}

type Edges = 'none' | 'adjacent' | 'line' | 'all';

/**
 * What every algorithm sheet shows for each case number, written down by hand: which yellow
 * edges are on top and how many yellow corners. Checked against each case's `pattern`.
 */
const SHEET: Record<number, [Edges, number]> = {
  1: ['none', 0], 2: ['none', 0], 3: ['none', 1], 4: ['none', 1],
  5: ['adjacent', 1], 6: ['adjacent', 1], 7: ['adjacent', 1], 8: ['adjacent', 1],
  9: ['adjacent', 1], 10: ['adjacent', 1], 11: ['adjacent', 1], 12: ['adjacent', 1],
  13: ['line', 1], 14: ['line', 1], 15: ['line', 1], 16: ['line', 1],
  17: ['none', 2], 18: ['none', 2], 19: ['none', 2], 20: ['none', 4],
  21: ['all', 0], 22: ['all', 0], 23: ['all', 2], 24: ['all', 2], 25: ['all', 2], 26: ['all', 1], 27: ['all', 1],
  28: ['adjacent', 4], 29: ['adjacent', 2], 30: ['adjacent', 2], 31: ['adjacent', 2], 32: ['adjacent', 2],
  33: ['line', 2], 34: ['line', 2], 35: ['adjacent', 2], 36: ['adjacent', 2], 37: ['adjacent', 2],
  38: ['adjacent', 2], 39: ['line', 2], 40: ['line', 2], 41: ['adjacent', 2], 42: ['adjacent', 2],
  43: ['adjacent', 2], 44: ['adjacent', 2], 45: ['line', 2], 46: ['line', 2],
  47: ['adjacent', 0], 48: ['adjacent', 0], 49: ['adjacent', 0], 50: ['adjacent', 0],
  51: ['line', 0], 52: ['line', 0], 53: ['adjacent', 0], 54: ['adjacent', 0], 55: ['line', 0], 56: ['line', 0],
  57: ['line', 4],
};

const GROUP_NUMBERS: Record<string, number[]> = {
  Dot: [1, 2, 3, 4, 17, 18, 19, 20],
  Square: [5, 6],
  'Small lightning bolt': [7, 8, 11, 12],
  Fish: [9, 10, 35, 37],
  'Knight move': [13, 14, 15, 16],
  Cross: [21, 22, 23, 24, 25, 26, 27],
  'Corners oriented': [28, 57],
  Awkward: [29, 30, 41, 42],
  'P shapes': [31, 32, 43, 44],
  'T shapes': [33, 45],
  'C shapes': [34, 46],
  'W shapes': [36, 38],
  'Big lightning bolt': [39, 40],
  'Small L': [47, 48, 49, 50, 53, 54],
  Line: [51, 52, 55, 56],
};

/** The top face of a pattern as three rows of three. */
const topRows = (pattern: string) => pattern.split('|').slice(1, 4).map((row) => row.slice(1, 4));

function edgesOf(pattern: string): Edges {
  const [back, middle, front] = topRows(pattern);
  const up = { b: back[1] === 'x', l: middle[0] === 'x', r: middle[2] === 'x', f: front[1] === 'x' };
  const count = Object.values(up).filter(Boolean).length;
  if (count === 0) return 'none';
  if (count === 4) return 'all';
  expect(count).toBe(2);
  return (up.b && up.f) || (up.l && up.r) ? 'line' : 'adjacent';
}

function cornersOf(pattern: string): number {
  const [back, , front] = topRows(pattern);
  return [back[0], back[2], front[0], front[2]].filter((c) => c === 'x').length;
}

describe('full OLL table', () => {
  it('numbers the cases in order, with matching ids and names', () => {
    OLL_CASES.forEach((c, i) => {
      expect(c.number).toBe(i + 1);
      expect(c.id).toBe(`oll-${String(c.number).padStart(2, '0')}`);
      expect(c.name).toMatch(new RegExp(`^OLL ${c.number} \(.+\)$`));
    });
    expect(new Set(OLL_CASES.map((c) => c.name)).size).toBe(OLL_CASES.length);
  });

  it('puts every case in the group algorithm sheets put it in', () => {
    for (const c of OLL_CASES) expect(GROUP_NUMBERS[c.group], c.id).toContain(c.number);
  });

  it('every pattern is a real last layer: one yellow sticker per piece', () => {
    for (const c of OLL_CASES) {
      expect(c.pattern, c.id).toMatch(/^[x.]{3}\|[x.]{5}\|[x.]{5}\|[x.]{5}\|[x.]{3}$/);
      const [back, r1, r2, r3, front] = c.pattern.split('|');
      const pieces = [
        back[1] + r1[2], r2[0] + r2[1], r2[3] + r2[4], r3[2] + front[1], // edges: back, left, right, front
        back[0] + r1[0] + r1[1], back[2] + r1[3] + r1[4], // corners: back-left, back-right
        front[0] + r3[0] + r3[1], front[2] + r3[3] + r3[4], // corners: front-left, front-right
      ];
      for (const piece of pieces) expect(piece.split('x').length - 1, `${c.id} ${piece}`).toBe(1);
      expect(r2[2], c.id).toBe('x');
    }
  });

  it('every pattern has the yellow edges and corners its case number is known for', () => {
    for (const c of OLL_CASES) {
      expect([edgesOf(c.pattern), cornersOf(c.pattern)], c.id).toEqual(SHEET[c.number]);
    }
  });

  it("undoing each algorithm on a solved cube gives exactly that case's pattern", () => {
    for (const c of OLL_CASES) {
      const start = setUp(c);
      expect(firstTwoLayersSolved(start), c.id).toBe(true);
      expect(topIsYellow(start), c.id).toBe(false);
      expect(ollPattern(start), c.id).toBe(c.pattern);
    }
  });

  it('every algorithm turns the whole top yellow from its pattern, however the pieces are arranged', () => {
    const jPerm = parseAlgorithm("R U R' F' R U R' U' R' F R2 U' R'");
    for (const c of OLL_CASES) {
      const moves = parseAlgorithm(c.algorithm);
      expect(moves.some((m) => m.kind === 'rotation'), c.id).toBe(false);
      // The same yellow pattern with the top pieces in another order.
      for (const start of [setUp(c), applyMoves(YELLOW_TOP, [...jPerm, ...invertAlgorithm(moves)])]) {
        expect(ollPattern(start), c.id).toBe(c.pattern);
        const done = applyMoves(start, moves);
        expect(topIsYellow(done), c.id).toBe(true);
        expect(firstTwoLayersSolved(done), c.id).toBe(true);
      }
    }
  });

  it('every recognition text says where the yellow stickers really are', () => {
    for (const c of OLL_CASES) {
      const seen = describeOll(setUp(c));
      expect(c.recognition.endsWith(` ${seen}`), `${c.id}: ${seen}`).toBe(true);
      expect(c.recognition.length).toBeGreaterThan(seen.length + 10);
    }
    expect(new Set(OLL_CASES.map((c) => c.recognition)).size).toBe(OLL_CASES.length);
  });

  it('no two cases are the same pattern seen from another side', () => {
    const classes = OLL_CASES.map((c) => ollClass(setUp(c)));
    expect(new Set(classes).size).toBe(OLL_CASES.length);
  });
});
