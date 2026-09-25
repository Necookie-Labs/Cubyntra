/**
 * Cubyntra - Cube Domain Constants & Standards
 * Necookie Labs (c) 2026
 */

import { CubeColor, Face, FaceStickers, CubeState } from './types';

export const FACES: readonly Face[] = ['U', 'R', 'F', 'D', 'L', 'B'] as const;

export const COLORS: readonly CubeColor[] = [
  'white',
  'yellow',
  'green',
  'blue',
  'red',
  'orange',
] as const;

/** Canonical center colors for standard Western Rubik's Cube orientation */
export const CANONICAL_CENTER_COLORS: Record<Face, CubeColor> = {
  U: 'white',
  R: 'red',
  F: 'green',
  D: 'yellow',
  L: 'orange',
  B: 'blue',
};

export const COLOR_TO_FACE: Record<CubeColor, Face> = {
  white: 'U',
  red: 'R',
  green: 'F',
  yellow: 'D',
  orange: 'L',
  blue: 'B',
};

export const OPPOSITE_FACES: Record<Face, Face> = {
  U: 'D',
  D: 'U',
  F: 'B',
  B: 'F',
  L: 'R',
  R: 'L',
};

export const OPPOSITE_COLORS: Record<CubeColor, CubeColor> = {
  white: 'yellow',
  yellow: 'white',
  green: 'blue',
  blue: 'green',
  red: 'orange',
  orange: 'red',
};

export const FACE_NAMES: Record<Face, string> = {
  U: 'Up (Top)',
  R: 'Right',
  F: 'Front',
  D: 'Down (Bottom)',
  L: 'Left',
  B: 'Back',
};

/** High-contrast, authentic physical Rubik's cube hex colors */
export const COLOR_HEX: Record<CubeColor, string> = {
  white: '#F8F9FA',
  yellow: '#FFD700',
  green: '#009B48',
  blue: '#0046AD',
  red: '#B71234',
  orange: '#FF5800',
};

/** Scanning order and step-by-step physical cube rotation hints */
export interface ScanStepGuidance {
  face: Face;
  centerColor: CubeColor;
  title: string;
  instruction: string;
  rotationHint: string;
}

export const SCAN_SEQUENCE: ScanStepGuidance[] = [
  {
    face: 'U',
    centerColor: 'white',
    title: 'Top Face (White)',
    instruction: 'Hold the White face facing the camera with Green on the bottom edge.',
    rotationHint: 'Initial position: White facing camera, Green facing down.',
  },
  {
    face: 'F',
    centerColor: 'green',
    title: 'Front Face (Green)',
    instruction: 'Rotate the cube downwards so Green faces the camera and White is on top.',
    rotationHint: 'Tilt cube down 90°: Green faces you, White on top.',
  },
  {
    face: 'R',
    centerColor: 'red',
    title: 'Right Face (Red)',
    instruction: 'Keep White on top and rotate the cube 90° to the left so Red faces the camera.',
    rotationHint: 'Turn cube left 90°: Red faces you, White stays on top.',
  },
  {
    face: 'B',
    centerColor: 'blue',
    title: 'Back Face (Blue)',
    instruction: 'Keep White on top and rotate the cube 90° to the left so Blue faces the camera.',
    rotationHint: 'Turn cube left 90°: Blue faces you, White stays on top.',
  },
  {
    face: 'L',
    centerColor: 'orange',
    title: 'Left Face (Orange)',
    instruction: 'Keep White on top and rotate the cube 90° to the left so Orange faces the camera.',
    rotationHint: 'Turn cube left 90°: Orange faces you, White stays on top.',
  },
  {
    face: 'D',
    centerColor: 'yellow',
    title: 'Bottom Face (Yellow)',
    instruction: 'Rotate the cube upwards so Yellow faces the camera with Green on top.',
    rotationHint: 'Tilt cube up 90°: Yellow faces you, Green on top.',
  },
];

/** Returns an exact cloned pristine Solved Cube State */
export function createSolvedCubeState(): CubeState {
  return {
    U: Array(9).fill('white') as FaceStickers,
    R: Array(9).fill('red') as FaceStickers,
    F: Array(9).fill('green') as FaceStickers,
    D: Array(9).fill('yellow') as FaceStickers,
    L: Array(9).fill('orange') as FaceStickers,
    B: Array(9).fill('blue') as FaceStickers,
  };
}
