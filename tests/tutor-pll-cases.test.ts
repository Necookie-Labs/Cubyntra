import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { applyMoves, invertAlgorithm, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import { PLL_CASES, PllCase } from '../src/tutor/cases/pll';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from '../src/tutor/cases/pll2look';
import {
  TOP_TURNS,
  YELLOW_TOP,
  describePll,
  firstTwoLayersSolved,
  permutationCycles,
  pllClass,
  topIsYellow,
} from './helpers/lastLayerFull';

/** The cube a student has just before doing the case's algorithm. */
function setUp(c: PllCase): CubeState {
  return applyMoves(YELLOW_TOP, invertAlgorithm(parseAlgorithm(c.algorithm)));
}

const solvedUpToTopTurn = (s: CubeState) => TOP_TURNS.some((turn) => isCubeSolved(applyMoves(s, turn)));

type Corners = 'none' | 'three' | 'adjacent' | 'diagonal' | 'two-swaps';
type Edges = 'none' | 'three' | 'adjacent' | 'opposite' | 'two-adjacent-swaps' | 'two-opposite-swaps';

/** What each PLL is known to move, written down by hand. Checked against each case's `cycles`. */
const SHEET: Record<string, [Corners, Edges]> = {
  'pll-aa': ['three', 'none'],
  'pll-ab': ['three', 'none'],
  'pll-e': ['two-swaps', 'none'],
  'pll-f': ['adjacent', 'opposite'],
  'pll-ga': ['three', 'three'],
  'pll-gb': ['three', 'three'],
  'pll-gc': ['three', 'three'],
  'pll-gd': ['three', 'three'],
  'pll-h': ['none', 'two-opposite-swaps'],
  'pll-ja': ['adjacent', 'adjacent'],
  'pll-jb': ['adjacent', 'adjacent'],
  'pll-na': ['diagonal', 'opposite'],
  'pll-nb': ['diagonal', 'opposite'],
  'pll-ra': ['adjacent', 'adjacent'],
  'pll-rb': ['adjacent', 'adjacent'],
  'pll-t': ['adjacent', 'opposite'],
  'pll-ua': ['none', 'three'],
  'pll-ub': ['none', 'three'],
  'pll-v': ['diagonal', 'adjacent'],
  'pll-y': ['diagonal', 'adjacent'],
  'pll-z': ['none', 'two-adjacent-swaps'],
};

const GROUPS: Record<string, string[]> = {
  'Corners only': ['aa', 'ab', 'e'],
  'Edges only': ['h', 'ua', 'ub', 'z'],
  'Adjacent corner swap': ['f', 'ja', 'jb', 'ra', 'rb', 't'],
  'Diagonal corner swap': ['na', 'nb', 'v', 'y'],
  'G perms': ['ga', 'gb', 'gc', 'gd'],
};

/** Two top corners are next to each other when they share a side as well as the top. */
const sharedSides = (a: string, b: string) => [...a.slice(1)].filter((side) => b.slice(1).includes(side)).length;

/** Two top edges are opposite when they are front and back, or left and right. */
const opposite = (cycle: string[]) => ['BF', 'LR'].includes([cycle[0][1], cycle[1][1]].sort().join(''));

function structureOf(cycles: string): [Corners, Edges] {
  const all = (cycles.match(/\(([^)]*)\)/g) ?? []).map((c) => c.slice(1, -1).split(' '));
  const cornerCycles = all.filter((c) => c[0].length === 3);
  const edgeCycles = all.filter((c) => c[0].length === 2);
  const lengths = (list: string[][]) => list.map((c) => c.length).join('+');

  let corners: Corners;
  if (lengths(cornerCycles) === '') corners = 'none';
  else if (lengths(cornerCycles) === '3') corners = 'three';
  else if (lengths(cornerCycles) === '2+2') corners = 'two-swaps';
  else if (lengths(cornerCycles) === '2') {
    corners = sharedSides(cornerCycles[0][0], cornerCycles[0][1]) === 1 ? 'adjacent' : 'diagonal';
  } else throw new Error(`Unexpected corner cycles in ${cycles}`);

  let edges: Edges;
  if (lengths(edgeCycles) === '') edges = 'none';
  else if (lengths(edgeCycles) === '3') edges = 'three';
  else if (lengths(edgeCycles) === '2+2') {
    edges = edgeCycles.every(opposite) ? 'two-opposite-swaps' : 'two-adjacent-swaps';
  } else if (lengths(edgeCycles) === '2') {
    edges = opposite(edgeCycles[0]) ? 'opposite' : 'adjacent';
  } else throw new Error(`Unexpected edge cycles in ${cycles}`);
  return [corners, edges];
}

describe('full PLL table', () => {
  it('lists the 21 cases by their standard names', () => {
    expect(PLL_CASES.map((c) => c.id)).toEqual(
      'aa ab e f ga gb gc gd h ja jb na nb ra rb t ua ub v y z'.split(' ').map((n) => `pll-${n}`)
    );
    for (const c of PLL_CASES) {
      const letters = c.id.slice(4);
      expect(c.name, c.id).toBe(`${letters[0].toUpperCase()}${letters.slice(1)} perm`);
      expect(GROUPS[c.group], c.id).toContain(letters);
    }
  });

  it('every case moves the pieces its name is known for', () => {
    for (const c of PLL_CASES) expect(structureOf(c.cycles), c.id).toEqual(SHEET[c.id]);
  });

  it('undoing each algorithm on a solved cube leaves the top yellow and only top pieces out of place', () => {
    for (const c of PLL_CASES) {
      const start = setUp(c);
      expect(firstTwoLayersSolved(start), c.id).toBe(true);
      expect(topIsYellow(start), c.id).toBe(true);
      expect(solvedUpToTopTurn(start), c.id).toBe(false);
    }
  });

  it("every algorithm does exactly its case's cycles, up to a last turn of the top", () => {
    for (const c of PLL_CASES) {
      const moves = parseAlgorithm(c.algorithm);
      expect(moves.some((m) => m.kind === 'rotation'), c.id).toBe(false);
      const done = TOP_TURNS.map((turn) => permutationCycles([...moves, ...turn]));
      expect(done, c.id).toContain(c.cycles);
    }
  });

  it('every algorithm solves its case from any side, give or take a turn of the top', () => {
    for (const c of PLL_CASES) {
      const moves = parseAlgorithm(c.algorithm);
      for (const before of TOP_TURNS) {
        for (const after of TOP_TURNS) {
          // The case with the top turned before the algorithm was undone, and again afterwards.
          const start = applyMoves(YELLOW_TOP, [...before, ...invertAlgorithm(moves), ...after]);
          expect(pllClass(start), c.id).toBe(pllClass(setUp(c)));
          const lineUp = TOP_TURNS.filter((turn) => solvedUpToTopTurn(applyMoves(start, [...turn, ...moves])));
          expect(lineUp.length, c.id).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('every recognition text says what the sides really show', () => {
    for (const c of PLL_CASES) {
      const seen = describePll(setUp(c));
      expect(c.recognition.endsWith(` ${seen}`), `${c.id}: ${seen}`).toBe(true);
      expect(c.recognition.length).toBeGreaterThan(seen.length + 10);
    }
    expect(new Set(PLL_CASES.map((c) => describePll(setUp(c)))).size).toBe(21);
  });

  it('covers every arrangement of a yellow top exactly once, apart from the solved one', () => {
    // Every arrangement, found by search from the solved cube with the 2-look algorithms.
    const generators = ['U', ...PLL_CORNER_CASES.map((c) => c.algorithm), ...PLL_EDGE_CASES.map((c) => c.algorithm)].map(
      (a) => parseAlgorithm(a)
    );
    const found = new Map<string, CubeState>([[JSON.stringify(YELLOW_TOP), YELLOW_TOP]]);
    const queue = [YELLOW_TOP];
    for (let state = queue.shift(); state; state = queue.shift()) {
      for (const moves of generators) {
        const next = applyMoves(state, moves);
        const key = JSON.stringify(next);
        if (found.has(key)) continue;
        found.set(key, next);
        queue.push(next);
      }
    }
    // 4! corner orders times 4! edge orders, half of them reachable.
    expect(found.size).toBe((24 * 24) / 2);

    const classes = new Set([...found.values()].map(pllClass));
    const solved = pllClass(YELLOW_TOP);
    expect(classes.size).toBe(22);

    const covered = new Map<string, string[]>();
    for (const c of PLL_CASES) {
      const key = pllClass(setUp(c));
      covered.set(key, [...(covered.get(key) ?? []), c.id]);
    }
    for (const key of classes) {
      if (key === solved) expect(covered.has(key)).toBe(false);
      else expect(covered.get(key), key).toHaveLength(1);
    }
    expect([...covered.keys()].filter((key) => !classes.has(key))).toEqual([]);
  });
});
