/**
 * Cubyntra - Computer Vision & Scanning Types
 * Necookie Labs (c) 2026
 */

import { CubeColor, Face } from '../cube/types';

export interface RGBColor {
  r: number; // 0 - 255
  g: number; // 0 - 255
  b: number; // 0 - 255
}

export interface HSVColor {
  h: number; // 0 - 360
  s: number; // 0 - 100
  v: number; // 0 - 100
}

export interface LABColor {
  l: number; // 0 - 100
  a: number; // -128 - 127
  b: number; // -128 - 127
}

export interface StickerSample {
  row: number; // 0, 1, 2
  col: number; // 0, 1, 2
  index: number; // 0 - 8
  rgb: RGBColor;
  hsv: HSVColor;
  lab: LABColor;
  predictedColor: CubeColor;
  confidence: number; // 0.0 - 1.0
  colorScores: Record<CubeColor, number>;
}

import { CubeDetectionResult } from './ml/types';

export interface FrameClassificationResult {
  stickers: StickerSample[]; // Exactly 9 samples
  averageConfidence: number; // 0.0 - 1.0
  isStable: boolean;
  stabilityProgress: number; // 0.0 - 1.0
  stableFramesCount: number;
  expectedFace: Face;
  detection?: CubeDetectionResult;
}

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'error';

export interface CameraState {
  status: CameraStatus;
  errorMessage?: string;
  hasTorch: boolean;
  isStreaming: boolean;
}

export interface ROIBounds {
  x: number;
  y: number;
  size: number;
}

export interface CalibrationProfile {
  referenceCenters: Partial<Record<Face, RGBColor>>;
  ambientWhitePoint?: RGBColor;
  warmthFactor: number;
}
