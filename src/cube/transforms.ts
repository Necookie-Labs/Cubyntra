/**
 * Cubyntra - Cube State Transformations & Move Engine
 * Necookie Labs (c) 2026
 */

import {
  CubeColor,
  Face,
  FaceStickers,
  CubeMove,
  CubeState,
  Move,
  MoveKind,
  QuarterTurns,
  RotationAxis,
  Slice,
} from './types';
import { CANONICAL_CENTER_COLORS, FACES, OPPOSITE_FACES } from './constants';
import { Axis, Layer, ORIENTATIONS, faceAxis, layerTurnPermutation } from './geometry';

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

/** The face each slice and rotation follows: its clockwise is their clockwise. */
export const SLICE_FOLLOWS: Record<Slice, Face> = { M: 'L', E: 'D', S: 'F' };
export const ROTATION_FOLLOWS: Record<RotationAxis, Face> = { x: 'R', y: 'U', z: 'F' };

/** Layer depths along the reference face's normal: 1 = that face, 0 = middle, -1 = opposite. */
const DEPTHS: Record<MoveKind, readonly Layer[]> = {
  face: [1],
  wide: [1, 0],
  slice: [0],
  rotation: [1, 0, -1],
};

/** The face whose clockwise turn (seen from outside it) defines this move's direction. */
export function moveReferenceFace(move: Move): Face {
  switch (move.kind) {
    case 'face':
    case 'wide':
      return move.face;
    case 'slice':
      return SLICE_FOLLOWS[move.slice];
    case 'rotation':
      return ROTATION_FOLLOWS[move.axis];
  }
}

/** The cubie layers a move turns, as coordinates along an axis, and by how much. */
export interface MoveLayers {
  axis: Axis;
  layers: Layer[];
  /** Signed quarter turns about +axis, counter-clockwise by the right-hand rule (±1 or ±2). */
  quarters: number;
}

export function moveLayers(move: Move): MoveLayers {
  const { axis, sign } = faceAxis(moveReferenceFace(move));
  return {
    axis,
    layers: DEPTHS[move.kind].map((d) => (d * sign + 0) as Layer),
    // Clockwise seen from outside a face is a negative turn about its outward normal.
    quarters: -sign * move.quarterTurns,
  };
}

function moveSymbol(move: Move): string {
  switch (move.kind) {
    case 'face': return move.face;
    case 'wide': return move.face.toLowerCase();
    case 'slice': return move.slice;
    case 'rotation': return move.axis;
  }
}

/** Canonical notation: `R`, `r'` (wide), `M2`, `y'`. Wide moves use the lower-case form. */
export function formatMove(move: Move): string {
  const suffix = move.quarterTurns === -1 ? "'" : move.quarterTurns === 2 ? '2' : '';
  return `${moveSymbol(move)}${suffix}`;
}

/** Formats a move list as space-separated notation. */
export function formatAlgorithm(moves: readonly Move[]): string {
  return moves.map(formatMove).join(' ');
}

function describeTurn(symbol: string, quarterTurns: QuarterTurns): string {
  if (quarterTurns === -1) return `${symbol} 90° Counter-Clockwise`;
  if (quarterTurns === 2) return `${symbol} 180° Half Turn`;
  return `${symbol} 90° Clockwise`;
}

/** What a move turns, without its amount. */
export type MoveTarget =
  | { kind: 'face' | 'wide'; face: Face }
  | { kind: 'slice'; slice: Slice }
  | { kind: 'rotation'; axis: RotationAxis };

/** Builds a fully populated move (canonical notation and description included). */
export function createMove(target: MoveTarget, quarterTurns: QuarterTurns): Move {
  const move = { ...target, quarterTurns, notation: '', description: '' } as Move;
  move.notation = formatMove(move);
  move.description = describeTurn(moveSymbol(move), quarterTurns);
  return move;
}

function flipTurns(q: QuarterTurns): QuarterTurns {
  return q === 2 ? 2 : q === 1 ? -1 : 1;
}

/**
 * The move of a given kind that turns the layers next to `face` clockwise as seen from `face`.
 * Slices and rotations follow fixed faces (M→L, E→D, S→F, x→R, y→U, z→F); asking for the
 * opposite face yields the inverse direction, e.g. (slice, R, 1) is M'.
 */
export function moveFromReference(kind: MoveKind, face: Face, quarterTurns: QuarterTurns): Move {
  if (kind === 'face' || kind === 'wide') return createMove({ kind, face }, quarterTurns);
  const follows: Record<string, Face> = kind === 'slice' ? SLICE_FOLLOWS : ROTATION_FOLLOWS;
  for (const [id, followed] of Object.entries(follows)) {
    const target: MoveTarget =
      kind === 'slice' ? { kind, slice: id as Slice } : { kind, axis: id as RotationAxis };
    if (followed === face) return createMove(target, quarterTurns);
    if (OPPOSITE_FACES[followed] === face) return createMove(target, flipTurns(quarterTurns));
  }
  throw new Error(`No ${kind} move follows face ${face}`);
}

const permutationCache = new Map<string, number[]>();

/** Flat-index permutation for one clockwise quarter of a move's layers. */
function quarterPermutation(move: Move): number[] {
  const key = moveSymbol(move);
  let perm = permutationCache.get(key);
  if (!perm) {
    const { axis, layers, quarters } = moveLayers({ ...move, quarterTurns: 1 });
    perm = layerTurnPermutation(axis, layers, quarters);
    permutationCache.set(key, perm);
  }
  return perm;
}

function applyPermutation(state: CubeState, perm: number[], times: number): CubeState {
  let flat = FACES.flatMap((f) => state[f]);
  for (let t = 0; t < times; t++) {
    const prev = flat;
    flat = perm.map((src) => prev[src]);
  }
  const next = {} as CubeState;
  FACES.forEach((f, i) => {
    next[f] = flat.slice(i * 9, i * 9 + 9) as FaceStickers;
  });
  return next;
}

/**
 * Applies a single move to a CubeState and returns the resulting state. Outer face turns use the
 * hand-written permutations above; wide moves, slices and rotations are derived from sticker
 * geometry (`./geometry`), which is tested to agree with the hand-written turns.
 */
export function applyMove(state: CubeState, move: CubeMove): CubeState {
  const clockwiseQuarters = move.quarterTurns === 1 ? 1 : move.quarterTurns === 2 ? 2 : 3;
  if (move.kind === 'face') {
    let next = cloneCubeState(state);
    for (let i = 0; i < clockwiseQuarters; i++) next = applyClockwiseQuarterTurn(next, move.face);
    return next;
  }
  return applyPermutation(state, quarterPermutation(move), clockwiseQuarters);
}

/**
 * Applies a sequence of moves to a CubeState.
 */
export function applyMoves(state: CubeState, moves: readonly CubeMove[]): CubeState {
  return moves.reduce((curr, move) => applyMove(curr, move), state);
}

const MOVE_TOKEN = /^(?:([URFDLB])(w?)|([urfdlb])|([MES])|([xyz]))(.*)$/;

/**
 * Converts standard notation to a move. Accepted, each with an optional `'` or `2`:
 * - face turns `U R F D L B`
 * - wide turns `u r f d l b` or `Uw Rw Fw Dw Lw Bw` (face plus the adjacent middle slice)
 * - slices `M` (follows L), `E` (follows D), `S` (follows F)
 * - whole-cube rotations `x` (follows R), `y` (follows U), `z` (follows F)
 * The returned `notation` is canonical, so `Rw'` comes back as `r'`.
 */
export function parseMove(notation: string): CubeMove {
  const clean = notation.trim();
  if (clean.length === 0) {
    throw new Error('Cannot parse empty move notation');
  }

  const m = MOVE_TOKEN.exec(clean);
  if (!m) {
    throw new Error(
      `Invalid face identifier in move: "${clean}" (expected U R F D L B, u r f d l b, Uw..Bw, M E S or x y z)`
    );
  }

  const modifier = m[6];
  let quarterTurns: QuarterTurns;
  if (modifier === '') quarterTurns = 1;
  else if (modifier === "'") quarterTurns = -1;
  else if (modifier === '2') quarterTurns = 2;
  else throw new Error(`Invalid modifier in move: "${clean}"`);

  let target: MoveTarget;
  if (m[1]) target = { kind: m[2] ? 'wide' : 'face', face: m[1] as Face };
  else if (m[3]) target = { kind: 'wide', face: m[3].toUpperCase() as Face };
  else if (m[4]) target = { kind: 'slice', slice: m[4] as Slice };
  else target = { kind: 'rotation', axis: m[5] as RotationAxis };

  return createMove(target, quarterTurns);
}

/**
 * Parses a whitespace-delimited algorithm string (e.g. "R U R' U'") into CubeMove[].
 */
export function parseAlgorithm(alg: string): CubeMove[] {
  const tokens = alg.trim().split(/\s+/).filter(Boolean);
  return tokens.map(parseMove);
}

function moveTarget(move: Move): MoveTarget {
  switch (move.kind) {
    case 'face':
    case 'wide':
      return { kind: move.kind, face: move.face };
    case 'slice':
      return { kind: 'slice', slice: move.slice };
    case 'rotation':
      return { kind: 'rotation', axis: move.axis };
  }
}

/**
 * Inverts a single move (e.g. R -> R', r' -> r, M2 -> M2, y -> y').
 */
export function invertMove(move: CubeMove): CubeMove {
  return createMove(moveTarget(move), flipTurns(move.quarterTurns));
}

/**
 * Inverts an entire algorithm by reversing the sequence and inverting each move.
 */
export function invertAlgorithm(moves: readonly CubeMove[]): CubeMove[] {
  return [...moves].reverse().map(invertMove);
}

/**
 * True when every face is a single color and the centers sit as on a real cube held in any of
 * its 24 orientations. A solved cube stays solved after whole-cube rotations; a mirrored or
 * otherwise impossible center layout does not count.
 */
export function isCubeSolved(state: CubeState): boolean {
  for (const face of FACES) {
    const center = state[face][4];
    for (let i = 0; i < 9; i++) {
      if (state[face][i] !== center) return false;
    }
  }
  return ORIENTATIONS.some((o) =>
    FACES.every((f) => CANONICAL_CENTER_COLORS[o.faceMap[f]] === state[f][4])
  );
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
