/**
 * Cubyntra - Cube Domain Types & Specifications
 * Necookie Labs (c) 2026
 */

export type CubeColor = 'white' | 'yellow' | 'green' | 'blue' | 'red' | 'orange';

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';

export type QuarterTurns = 1 | -1 | 2; // 1 = 90° CW, -1 = 90° CCW (or 270° CW), 2 = 180°

export interface CubeMove {
  face: Face;
  quarterTurns: QuarterTurns;
  notation: string; // e.g. "R", "R'", "R2"
  description: string; // e.g. "Right face 90° clockwise"
}

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
