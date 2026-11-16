import { describe, expect, it } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import { f2lSlots, isCrossSolved, isF2LSlotSolved } from '../src/cube/pieces';
import { applyMoves, invertAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { F2L_CASES, describeF2LPosition, f2lPositionKey } from '../src/tutor/cases/f2l';

const solved = createSolvedCubeState();
const cross = solved.D[4];
const AUF = ['', 'U', 'U2', "U'"];

/** The case set up on a solved cube by undoing its algorithm. */
function setUp(algorithm: string) {
  return applyMoves(solved, invertAlgorithm(parseAlgorithm(algorithm)));
}

describe('F2L case table', () => {
  it('has 41 cases with unique ids and names', () => {
    expect(F2L_CASES).toHaveLength(41);
    expect(new Set(F2L_CASES.map((c) => c.id)).size).toBe(41);
    expect(new Set(F2L_CASES.map((c) => c.name)).size).toBe(41);
    expect(F2L_CASES[0].id).toBe('f2l-01');
    expect(F2L_CASES[40].id).toBe('f2l-41');
  });

  it('every algorithm solves its pair and leaves the cross and other slots alone', () => {
    const slots = f2lSlots(cross);
    for (const c of F2L_CASES) {
      const start = setUp(c.algorithm);
      const frontRight = slots.filter(
        ([a, b]) => [a, b].includes(solved.F[4]) && [a, b].includes(solved.R[4])
      );
      expect(frontRight).toHaveLength(1);
      // The pair is unsolved before, and everything else in the first two layers is solved.
      expect(isF2LSlotSolved(start, cross, frontRight[0]), c.id).toBe(false);
      expect(isCrossSolved(start, cross), c.id).toBe(true);
      for (const slot of slots) {
        if (slot !== frontRight[0]) expect(isF2LSlotSolved(start, cross, slot), c.id).toBe(true);
      }
    }
  });

  it('records the position each algorithm really starts from', () => {
    for (const c of F2L_CASES) {
      expect(f2lPositionKey(setUp(c.algorithm)), c.id).toBe(c.position);
      expect(c.recognition).toBe(describeF2LPosition(c.position));
    }
  });

  it('covers all 41 distinct cases: no two are the same up to a turn of the top', () => {
    const classes = new Set<string>();
    const allKeys = new Set<string>();
    for (const c of F2L_CASES) {
      const keys = AUF.map((u) => f2lPositionKey(applyMoves(setUp(c.algorithm), parseAlgorithm(u))));
      keys.forEach((k) => allKeys.add(k));
      classes.add([...keys].sort()[0]);
    }
    expect(classes.size).toBe(41);
    // 36 cases with a piece on top have 4 top positions each; the 5 with both pieces in the
    // slot look the same after any top turn. Plus the solved pair, that is every one of the
    // 15 x 10 = 150 ways to place a corner and an edge in the top layer or the slot.
    expect(allKeys.size).toBe(36 * 4 + 5);
  });

  it('describes positions in words and rejects malformed keys', () => {
    expect(describeF2LPosition('UFR1-UR0')).toBe(
      "Corner above the slot with white facing the front; edge at the top right showing the front side's color on top."
    );
    expect(describeF2LPosition('DFR0-FR1')).toBe(
      'Corner in the slot with white facing down; edge in the slot but flipped.'
    );
    expect(() => describeF2LPosition('XYZ9-QQ0')).toThrow();
  });
});
