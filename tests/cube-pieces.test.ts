/**
 * Cubyntra - Piece Query Tests
 */

import { describe, it, expect } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import type { CubeState } from '../src/cube/types';
import {
  f2lSlots,
  findCorner,
  findEdge,
  isCrossSolved,
  isF2LSlotSolved,
  isLayerSolved,
  isMiddleLayerSolved,
  isPieceSolved,
} from '../src/cube/pieces';

const after = (alg: string): CubeState => applyMoves(createSolvedCubeState(), parseAlgorithm(alg));

describe('findEdge / findCorner', () => {
  it('locates pieces on a solved cube with orientation by requested color order', () => {
    const solved = createSolvedCubeState();
    expect(findEdge(solved, ['white', 'green'])).toEqual({
      slot: 'UF',
      stickers: [{ face: 'U', index: 7 }, { face: 'F', index: 1 }],
      orientation: 0,
    });
    expect(findEdge(solved, ['green', 'white']).orientation).toBe(1);
    expect(findCorner(solved, ['white', 'green', 'red'])).toEqual({
      slot: 'UFR',
      stickers: [{ face: 'U', index: 8 }, { face: 'F', index: 2 }, { face: 'R', index: 0 }],
      orientation: 0,
    });
  });

  it('follows pieces through moves', () => {
    // R carries the UFR corner to UBR with white now on the back.
    expect(findCorner(after('R'), ['white', 'green', 'red'])).toEqual({
      slot: 'UBR',
      stickers: [{ face: 'B', index: 0 }, { face: 'U', index: 2 }, { face: 'R', index: 2 }],
      orientation: 2,
    });
    // F carries the UF edge to FR with white on the right face.
    expect(findEdge(after('F'), ['white', 'green'])).toEqual({
      slot: 'FR',
      stickers: [{ face: 'R', index: 3 }, { face: 'F', index: 5 }],
      orientation: 1,
    });
    // M carries the UF edge to DF (front goes down).
    expect(findEdge(after('M'), ['white', 'green']).slot).toBe('DF');
  });

  it('throws for a piece that does not exist', () => {
    expect(() => findEdge(createSolvedCubeState(), ['white', 'yellow'])).toThrow();
    expect(() => findCorner(createSolvedCubeState(), ['white', 'green', 'blue'])).toThrow();
  });
});

describe('solved checks', () => {
  it('checks single pieces against the centers', () => {
    const s = after('R');
    expect(isPieceSolved(s, ['white', 'green'])).toBe(true);
    expect(isPieceSolved(s, ['white', 'green', 'red'])).toBe(false);
    expect(isPieceSolved(s, ['white', 'red'])).toBe(false);
    expect(isPieceSolved(s, ['green'])).toBe(true);
  });

  it('checks the cross', () => {
    expect(isCrossSolved(createSolvedCubeState(), 'white')).toBe(true);
    expect(isCrossSolved(after('D'), 'white')).toBe(true);
    expect(isCrossSolved(after('U'), 'white')).toBe(false);
    expect(isCrossSolved(after('R'), 'white')).toBe(false);
    expect(isCrossSolved(after('M'), 'white')).toBe(false);
    // Rotations never unsolve anything: checks are relative to the centers.
    expect(isCrossSolved(after("R U R' y x2"), 'yellow')).toBe(true);
  });

  it('checks F2L slots by their side colors', () => {
    expect(f2lSlots('yellow')).toHaveLength(4);
    for (const slot of f2lSlots('yellow')) {
      expect(slot).not.toContain('yellow');
      expect(slot).not.toContain('white');
      expect(isF2LSlotSolved(createSolvedCubeState(), 'yellow', slot)).toBe(true);
    }
    // R U R' lifts the front-right pair out and leaves the other three slots alone.
    const s = after("R U R'");
    expect(isCrossSolved(s, 'yellow')).toBe(true);
    expect(isF2LSlotSolved(s, 'yellow', ['green', 'red'])).toBe(false);
    expect(isF2LSlotSolved(s, 'yellow', ['red', 'green'])).toBe(false);
    expect(isF2LSlotSolved(s, 'yellow', ['green', 'orange'])).toBe(true);
    expect(isF2LSlotSolved(s, 'yellow', ['blue', 'red'])).toBe(true);
    expect(isF2LSlotSolved(s, 'yellow', ['blue', 'orange'])).toBe(true);
    expect(() => isF2LSlotSolved(s, 'yellow', ['green', 'blue'])).toThrow();
    expect(() => isF2LSlotSolved(s, 'yellow', ['white', 'red'])).toThrow();
  });

  it('checks whole layers and the middle layer', () => {
    expect(isLayerSolved(createSolvedCubeState(), 'white')).toBe(true);
    expect(isLayerSolved(after('U'), 'yellow')).toBe(true);
    expect(isLayerSolved(after('U'), 'white')).toBe(false);
    expect(isMiddleLayerSolved(after('U D'), 'white')).toBe(true);
    expect(isMiddleLayerSolved(after("R U R'"), 'white')).toBe(false);
    expect(isMiddleLayerSolved(after('R2'), 'white')).toBe(false);
    // E carries the middle centers with the edges, so relative to the centers nothing moved.
    expect(isMiddleLayerSolved(after('E'), 'white')).toBe(true);
    expect(isLayerSolved(after("R U R'"), 'yellow')).toBe(false);
  });
});
