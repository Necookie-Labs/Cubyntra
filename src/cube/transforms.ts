/**
 * Cubyntra - Cube State Transformations & Move Engine
 * Necookie Labs (c) 2026
 */

import { CubeColor, Face, FaceStickers, CubeMove, CubeState, QuarterTurns } from './types';
import { CANONICAL_CENTER_COLORS, FACES } from './constants';

/**
 * Creates an independent deep clone of a CubeState
 */
export function cloneCubeState(state: CubeState): CubeState {
  return {
    U: [...state.U] as FaceStickers,
    R: [...state.R] as FaceStickers,
    F: [...state.F] as FaceStickers,
    D: [...state.D] as FaceStickers,
    L: [...state.L] as FaceStickers,
    B: [...state.B] as FaceStickers,
  };
}

/**
 * Rotates a 3x3 face matrix 90 degrees clockwise.
 * Index layout:
 * 0 1 2
 * 3 4 5
 * 6 7 8
 */
export function rotateFaceClockwise(face: FaceStickers): FaceStickers {
  return [
    face[6], face[3], face[0],
    face[7], face[4], face[1],
    face[8], face[5], face[2],
  ];
}

/**
 * Rotates a 3x3 face matrix 90 degrees counter-clockwise (270° CW).
 */
export function rotateFaceCounterClockwise(face: FaceStickers): FaceStickers {
  return [
    face[2], face[5], face[8],
    face[1], face[4], face[7],
    face[0], face[3], face[6],
  ];
}

/**
 * Rotates a 3x3 face matrix 180 degrees.
 */
export function rotateFace180(face: FaceStickers): FaceStickers {
  return [
    face[8], face[7], face[6],
    face[5], face[4], face[3],
    face[2], face[1], face[0],
  ];
}

/**
 * Applies a 90° Clockwise rotation to face and adjacent edges.
 */
function applyClockwiseQuarterTurn(state: CubeState, face: Face): CubeState {
  const next = cloneCubeState(state);
  next[face] = rotateFaceClockwise(next[face]);

  switch (face) {
    case 'U': {
      // Adjacent strip: F top -> L top -> B top -> R top -> F top
      const f0 = state.F[0], f1 = state.F[1], f2 = state.F[2];
      next.F[0] = state.R[0]; next.F[1] = state.R[1]; next.F[2] = state.R[2];
      next.R[0] = state.B[0]; next.R[1] = state.B[1]; next.R[2] = state.B[2];
      next.B[0] = state.L[0]; next.B[1] = state.L[1]; next.B[2] = state.L[2];
      next.L[0] = f0;         next.L[1] = f1;         next.L[2] = f2;
      break;
    }
    case 'D': {
      // Looking directly at D: F bottom -> R bottom -> B bottom -> L bottom -> F bottom
      const f6 = state.F[6], f7 = state.F[7], f8 = state.F[8];
      next.F[6] = state.L[6]; next.F[7] = state.L[7]; next.F[8] = state.L[8];
      next.L[6] = state.B[6]; next.L[7] = state.B[7]; next.L[8] = state.B[8];
      next.B[6] = state.R[6]; next.B[7] = state.R[7]; next.B[8] = state.R[8];
      next.R[6] = f6;         next.R[7] = f7;         next.R[8] = f8;
      break;
    }
    case 'F': {
      // U bottom [6,7,8] -> R left [0,3,6] -> D top [2,1,0] -> L right [8,5,2] -> U bottom [6,7,8]
      const u6 = state.U[6], u7 = state.U[7], u8 = state.U[8];
      next.U[6] = state.L[8]; next.U[7] = state.L[5]; next.U[8] = state.L[2];
      next.L[2] = state.D[0]; next.L[5] = state.D[1]; next.L[8] = state.D[2];
      next.D[0] = state.R[6]; next.D[1] = state.R[3]; next.D[2] = state.R[0];
      next.R[0] = u6;         next.R[3] = u7;         next.R[6] = u8;
      break;
    }
    case 'B': {
      // U top [2,1,0] -> L left [0,3,6] -> D bottom [6,7,8] -> R right [8,5,2] -> U top [2,1,0]
      const u0 = state.U[0], u1 = state.U[1], u2 = state.U[2];
      next.U[0] = state.R[2]; next.U[1] = state.R[5]; next.U[2] = state.R[8];
      next.R[2] = state.D[8]; next.R[5] = state.D[7]; next.R[8] = state.D[6];
      next.D[6] = state.L[0]; next.D[7] = state.L[3]; next.D[8] = state.L[6];
      next.L[0] = u2;         next.L[3] = u1;         next.L[6] = u0;
      break;
    }
    case 'R': {
      // U right [2,5,8] -> B left [6,3,0] -> D right [2,5,8] -> F right [2,5,8] -> U right [2,5,8]
      const u2 = state.U[2], u5 = state.U[5], u8 = state.U[8];
      next.U[2] = state.F[2]; next.U[5] = state.F[5]; next.U[8] = state.F[8];
      next.F[2] = state.D[2]; next.F[5] = state.D[5]; next.F[8] = state.D[8];
      next.D[2] = state.B[6]; next.D[5] = state.B[3]; next.D[8] = state.B[0];
      next.B[0] = u8;         next.B[3] = u5;         next.B[6] = u2;
      break;
    }
    case 'L': {
      // U left [0,3,6] -> F left [0,3,6] -> D left [0,3,6] -> B right [8,5,2] -> U left [0,3,6]
      const u0 = state.U[0], u3 = state.U[3], u6 = state.U[6];
      next.U[0] = state.B[8]; next.U[3] = state.B[5]; next.U[6] = state.B[2];
      next.B[2] = state.D[6]; next.B[5] = state.D[3]; next.B[8] = state.D[0];
      next.D[0] = state.F[0]; next.D[3] = state.F[3]; next.D[6] = state.F[6];
      next.F[0] = u0;         next.F[3] = u3;         next.F[6] = u6;
      break;
    }
  }

  return next;
}

/**
 * Applies a single CubeMove to a CubeState and returns the resulting state.
 */
export function applyMove(state: CubeState, move: CubeMove): CubeState {
  if (move.quarterTurns === 1) {
    return applyClockwiseQuarterTurn(state, move.face);
  } else if (move.quarterTurns === 2) {
    const intermediate = applyClockwiseQuarterTurn(state, move.face);
    return applyClockwiseQuarterTurn(intermediate, move.face);
  } else if (move.quarterTurns === -1) {
    // 3 clockwise quarter turns equal 1 counter-clockwise turn
    const s1 = applyClockwiseQuarterTurn(state, move.face);
    const s2 = applyClockwiseQuarterTurn(s1, move.face);
    return applyClockwiseQuarterTurn(s2, move.face);
  }
  return cloneCubeState(state);
}

/**
 * Applies a sequence of moves to a CubeState.
 */
export function applyMoves(state: CubeState, moves: CubeMove[]): CubeState {
  return moves.reduce((curr, move) => applyMove(curr, move), state);
}

/**
 * Converts standard notation string (e.g. "R", "U'", "F2") to a CubeMove object.
 */
export function parseMove(notation: string): CubeMove {
  const clean = notation.trim();
  if (clean.length === 0) {
    throw new Error('Cannot parse empty move notation');
  }

  const faceChar = clean[0].toUpperCase() as Face;
  if (!FACES.includes(faceChar)) {
    throw new Error(`Invalid face identifier in move: "${clean}"`);
  }

  const modifier = clean.slice(1);
  let quarterTurns: QuarterTurns = 1;
  let description = `${faceChar} 90° Clockwise`;

  if (modifier === "'") {
    quarterTurns = -1;
    description = `${faceChar} 90° Counter-Clockwise`;
  } else if (modifier === '2') {
    quarterTurns = 2;
    description = `${faceChar} 180° Half Turn`;
  } else if (modifier !== '') {
    throw new Error(`Invalid modifier in move: "${clean}"`);
  }

  return {
    face: faceChar,
    quarterTurns,
    notation: clean,
    description,
  };
}

/**
 * Parses a whitespace-delimited algorithm string (e.g. "R U R' U'") into CubeMove[].
 */
export function parseAlgorithm(alg: string): CubeMove[] {
  const tokens = alg.trim().split(/\s+/).filter(Boolean);
  return tokens.map(parseMove);
}

/**
 * Inverts a single CubeMove (e.g. R -> R', R' -> R, R2 -> R2).
 */
export function invertMove(move: CubeMove): CubeMove {
  let quarterTurns: QuarterTurns;
  let notationSuffix: string;

  if (move.quarterTurns === 1) {
    quarterTurns = -1;
    notationSuffix = "'";
  } else if (move.quarterTurns === -1) {
    quarterTurns = 1;
    notationSuffix = '';
  } else {
    quarterTurns = 2;
    notationSuffix = '2';
  }

  return {
    face: move.face,
    quarterTurns,
    notation: `${move.face}${notationSuffix}`,
    description: `${move.face} inverted`,
  };
}

/**
 * Inverts an entire algorithm by reversing the sequence and inverting each move.
 */
export function invertAlgorithm(moves: CubeMove[]): CubeMove[] {
  return [...moves].reverse().map(invertMove);
}

/**
 * Verifies if all 6 faces of the cube are monochrome (solved state).
 */
export function isCubeSolved(state: CubeState): boolean {
  for (const face of FACES) {
    const center = state[face][4];
    if (center !== CANONICAL_CENTER_COLORS[face]) return false;
    for (let i = 0; i < 9; i++) {
      if (state[face][i] !== center) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Converts CubeState to standard 54-character facelet string format (U R F D L B).
 */
export function cubeStateToFaceletString(state: CubeState): string {
  const colorMap: Record<CubeColor, string> = {
    white: 'U',
    red: 'R',
    green: 'F',
    yellow: 'D',
    orange: 'L',
    blue: 'B',
  };

  let str = '';
  for (const face of ['U', 'R', 'F', 'D', 'L', 'B'] as const) {
    for (let i = 0; i < 9; i++) {
      str += colorMap[state[face][i]];
    }
  }
  return str;
}

/**
 * Reconstructs a CubeState from a standard 54-character facelet string (U R F D L B).
 */
export function faceletStringToCubeState(str: string): CubeState {
  if (str.length !== 54) {
    throw new Error(`Facelet string must be exactly 54 characters, received ${str.length}`);
  }

  const faceletToColor: Record<string, CubeColor> = {
    U: 'white',
    R: 'red',
    F: 'green',
    D: 'yellow',
    L: 'orange',
    B: 'blue',
  };

  const faces: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
  const state: Partial<CubeState> = {};

  for (let f = 0; f < 6; f++) {
    const faceChar = faces[f];
    const slice = str.slice(f * 9, (f + 1) * 9);
    const stickers = slice.split('').map((c) => faceletToColor[c]) as FaceStickers;
    state[faceChar] = stickers;
  }

  return state as CubeState;
}
