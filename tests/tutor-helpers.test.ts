import { describe, expect, it } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, formatAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import {
  alg,
  countTurns,
  faceOfColor,
  faceTurns,
  isPieceInPlace,
  isPieceOriented,
  lastCornersInPlace,
  lastLayerTurnsUntil,
  layerCorners,
  orientedLastCorners,
  orientedLastEdges,
  repeatMoves,
  rotations,
  solvedLastCorners,
  solvedLastEdges,
} from '../src/tutor/helpers';

const solved = createSolvedCubeState();
const after = (notation: string) => applyMoves(solved, parseAlgorithm(notation));

describe('tutor move helpers', () => {
  it('turns a face or the whole cube by any number of quarters as at most one move', () => {
    expect(faceTurns('U', 0)).toEqual([]);
    expect(formatAlgorithm(faceTurns('U', 1))).toBe('U');
    expect(formatAlgorithm(faceTurns('D', 2))).toBe('D2');
    expect(formatAlgorithm(faceTurns('R', 3))).toBe("R'");
    expect(formatAlgorithm(faceTurns('R', 7))).toBe("R'");
    expect(formatAlgorithm(faceTurns('F', -1))).toBe("F'");
    expect(rotations('y', 4)).toEqual([]);
    expect(formatAlgorithm(rotations('y', 3))).toBe("y'");
    expect(formatAlgorithm(rotations('z', 2))).toBe('z2');
  });

  it('repeats sequences, counts only layer turns and caches parsed algorithms', () => {
    expect(formatAlgorithm(repeatMoves(alg("R' D'"), 3))).toBe("R' D' R' D' R' D'");
    expect(repeatMoves(alg('R'), 0)).toEqual([]);
    expect(countTurns(parseAlgorithm("z2 y U R' M x"))).toBe(3);
    expect(alg("R U R'")).toBe(alg("R U R'"));
  });
});

describe('tutor cube helpers', () => {
  it('finds the face of a color however the cube is held', () => {
    expect(faceOfColor(solved, 'white')).toBe('U');
    expect(faceOfColor(after('z2'), 'white')).toBe('D');
    expect(faceOfColor(after('x'), 'green')).toBe('U');
  });

  it('lists the four corners of a layer', () => {
    const corners = layerCorners('yellow');
    expect(corners).toHaveLength(4);
    for (const corner of corners) {
      expect(corner[0]).toBe('yellow');
      expect(new Set(corner).size).toBe(3);
      expect(corner).not.toContain('white');
    }
    expect(new Set(corners.map((c) => [...c].sort().join())).size).toBe(4);
  });

  it('tells a piece in place from a piece that is solved', () => {
    // R' D' R D twice twists the white corner at the front-right in place.
    const twisted = after("R' D' R D R' D' R D");
    expect(isPieceInPlace(twisted, ['white', 'green', 'red'])).toBe(true);
    expect(isPieceOriented(twisted, ['white', 'green', 'red'])).toBe(false);
    expect(isPieceInPlace(after('U'), ['white', 'green', 'red'])).toBe(false);
    expect(isPieceOriented(after('U'), ['white', 'green'])).toBe(true);
    expect(isPieceOriented(after('F'), ['white', 'green'])).toBe(false);
  });

  it('counts last-layer pieces and finds the top turn that lines them up', () => {
    expect([orientedLastEdges(solved), orientedLastCorners(solved)]).toEqual([4, 4]);
    expect([solvedLastEdges(solved), solvedLastCorners(solved), lastCornersInPlace(solved)]).toEqual([4, 4, 4]);

    // D is the yellow face of the standard orientation.
    const turned = after('D');
    expect([orientedLastEdges(turned), solvedLastEdges(turned), solvedLastCorners(turned)]).toEqual([4, 0, 0]);
    expect(lastLayerTurnsUntil(turned, (s) => solvedLastEdges(s) === 4)).toBe(3);
    expect(lastLayerTurnsUntil(after('z2 U2'), (s) => solvedLastCorners(s) === 4)).toBe(2);
    expect(lastLayerTurnsUntil(after('R'), (s) => solvedLastEdges(s) === 4)).toBe(-1);
    expect(orientedLastEdges(after('R'))).toBe(3);
  });
});
