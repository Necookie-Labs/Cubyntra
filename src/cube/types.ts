/**
 * Cubyntra - Cube Domain Types & Specifications
 * Necookie Labs (c) 2026
 */

export type CubeColor = 'white' | 'yellow' | 'green' | 'blue' | 'red' | 'orange';

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';

export type QuarterTurns = 1 | -1 | 2; // 1 = 90° CW, -1 = 90° CCW (or 270° CW), 2 = 180°

/** Middle slices: M follows L, E follows D, S follows F. */
export type Slice = 'M' | 'E' | 'S';

/** Whole-cube rotations: x follows R, y follows U, z follows F. */
export type RotationAxis = 'x' | 'y' | 'z';

export type MoveKind = 'face' | 'wide' | 'slice' | 'rotation';

interface MoveBase {
  /** Direction relative to the face the move follows (clockwise as seen from outside it). */
  quarterTurns: QuarterTurns;
  notation: string; // canonical notation, e.g. "R", "r'", "M2", "y"
  description: string; // e.g. "R 90° Clockwise"
}

/** One outer face: U R F D L B. */
export interface FaceMove extends MoveBase {
  kind: 'face';
  face: Face;
}

/** An outer face together with the middle slice next to it: `r` / `Rw`. */
export interface WideMove extends MoveBase {
  kind: 'wide';
  face: Face;
}

/** A middle slice: M, E or S. */
export interface SliceMove extends MoveBase {
  kind: 'slice';
  slice: Slice;
}

/** A whole-cube rotation: x, y or z. Changes how the cube is held, not its pieces. */
export interface RotationMove extends MoveBase {
  kind: 'rotation';
  axis: RotationAxis;
}

/** Any move in standard notation. Narrow on `kind` before reading `face`/`slice`/`axis`. */
export type Move = FaceMove | WideMove | SliceMove | RotationMove;

/** Kept as the name every existing caller uses; identical to `Move`. */
export type CubeMove = Move;

export type FaceStickers = [
  CubeColor, CubeColor, CubeColor,
  CubeColor, CubeColor, CubeColor,
  CubeColor, CubeColor, CubeColor
];

export interface CubeState {
  U: FaceStickers;
  R: FaceStickers;
  F: FaceStickers;
  D: FaceStickers;
  L: FaceStickers;
  B: FaceStickers;
}

export interface ScannedFace {
  face: Face;
  centerColor: CubeColor;
  stickers: FaceStickers;
  confidences: number[]; // 0.0 to 1.0 confidence for each of the 9 stickers
  capturedAt: number;
}

export type ValidationStatus = 'valid' | 'invalid';

export interface ValidationIssue {
  code:
    | 'INVALID_TOTAL_COUNT'
    | 'INVALID_COLOR_COUNT'
    | 'INVALID_CENTERS'
    | 'INVALID_CORNER_COLORS'
    | 'INVALID_EDGE_COLORS'
    | 'CORNER_TWIST_PARITY'
    | 'EDGE_FLIP_PARITY'
    | 'PERMUTATION_PARITY';
  message: string;
  face?: Face;
  stickerIndex?: number;
  expectedColor?: CubeColor;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  status: ValidationStatus;
  issues: ValidationIssue[];
}

export interface CubieCoordinate {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
  z: -1 | 0 | 1;
}

export type CubieType = 'center' | 'edge' | 'corner' | 'core';

export interface CubieState {
  id: string;
  initialCoord: CubieCoordinate;
  currentCoord: CubieCoordinate;
  type: CubieType;
  // Exterior sticker colors on current directional faces (null if internal/hidden)
  stickers: {
    posX?: CubeColor; // +x (Right)
    negX?: CubeColor; // -x (Left)
    posY?: CubeColor; // +y (Up)
    negY?: CubeColor; // -y (Down)
    posZ?: CubeColor; // +z (Front)
    negZ?: CubeColor; // -z (Back)
  };
}
