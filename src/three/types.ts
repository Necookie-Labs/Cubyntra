/**
 * Cubyntra - 3D Digital Twin Engine Types
 * Necookie Labs (c) 2026
 */

import { CubeMove, Face } from '../cube/types';

export interface VisualCubeOptions {
  cubieSize?: number; // default 0.95
  spacing?: number; // default 1.02
  bevelRadius?: number;
  plasticColor?: string; // default "#111215"
  stickerInset?: number; // inset for sticker border
  arrowColor?: string; // default "#38bdf8"
  animationDurationMs?: number; // default 350
}

export interface MoveAnimationState {
  isAnimating: boolean;
  move: CubeMove | null;
  progress: number; // 0.0 to 1.0
  activeFace: Face | null;
}

export interface CubeVisualizerHandle {
  executeMove: (move: CubeMove, durationMs?: number) => Promise<void>;
  resetCamera: () => void;
  syncState: () => void;
}
