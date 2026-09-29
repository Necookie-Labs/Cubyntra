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
  /** How to get from the previous step's grip to this one. */
  instruction: string;
  /** Short check of the end position: what faces the camera and what is on top. */
  rotationHint: string;
  /** Centers on top and on the right while this face points at the camera. */
  view: { top: CubeColor; right: CubeColor };
}

/**
 * Every step is one simple move from the previous grip, and each photo's rows and columns
 * line up with how the cube model indexes that face. The last step matters most: after the
 * Left photo the cube must be turned back to Green before tipping, or the Bottom photo
 * arrives a quarter turn off.
 */
export const SCAN_SEQUENCE: ScanStepGuidance[] = [
  {
    face: 'U',
    centerColor: 'white',
    title: 'Top face',
    instruction: 'Hold the cube with White on top and Green facing you, then tip the top toward you.',
    rotationHint: 'White faces you · Green at the bottom',
    view: { top: 'blue', right: 'red' },
  },
  {
    face: 'F',
    centerColor: 'green',
    title: 'Front face',
    instruction: 'Tip the top back, away from you, so Green faces you and White is on top.',
    rotationHint: 'Green faces you · White on top',
    view: { top: 'white', right: 'red' },
  },
  {
    face: 'R',
    centerColor: 'red',
    title: 'Right face',
    instruction: 'Turn the whole cube a quarter to the left. White stays on top.',
    rotationHint: 'Red faces you · White on top',
    view: { top: 'white', right: 'blue' },
  },
  {
    face: 'B',
    centerColor: 'blue',
    title: 'Back face',
    instruction: 'Turn a quarter to the left again. White stays on top.',
    rotationHint: 'Blue faces you · White on top',
    view: { top: 'white', right: 'orange' },
  },
  {
    face: 'L',
    centerColor: 'orange',
    title: 'Left face',
    instruction: 'Turn a quarter to the left again. White stays on top.',
    rotationHint: 'Orange faces you · White on top',
    view: { top: 'white', right: 'green' },
  },
  {
    face: 'D',
    centerColor: 'yellow',
    title: 'Bottom face',
    instruction: 'Turn left once more so Green faces you, then tip the top away from you.',
    rotationHint: 'Yellow faces you · Green on top',
    view: { top: 'green', right: 'red' },
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
