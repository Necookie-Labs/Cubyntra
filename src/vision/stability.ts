/**
 * Cubyntra - Temporal Stability Buffer & Consensus Engine
 * Necookie Labs (c) 2026
 */

import { Face, CubeColor } from '../cube/types';
import { FrameClassificationResult, StickerSample } from './types';

export interface StabilityBufferConfig {
  requiredStableFrames?: number; // Consecutive matching frames required for lock
  minAverageConfidence?: number; // Minimum average confidence threshold (e.g. 0.70)
  maxHistoryLength?: number;
}

export class TemporalStabilityBuffer {
  private history: StickerSample[][] = [];
  private consecutiveMatches = 0;
  private readonly requiredFrames: number;
  private readonly minConfidence: number;
  private readonly maxHistory: number;

  constructor(config: StabilityBufferConfig = {}) {
    this.requiredFrames = config.requiredStableFrames ?? 8;
    this.minConfidence = config.minAverageConfidence ?? 0.70;
    this.maxHistory = config.maxHistoryLength ?? 15;
  }

  /**
   * Resets stability state (e.g. when changing faces or moving).
   */
  public reset(): void {
    this.history = [];
    this.consecutiveMatches = 0;
  }

  /**
   * Ingests a new 9-sticker frame sample and evaluates temporal stability.
   */
  public processFrame(
    stickers: StickerSample[],
    expectedFace: Face,
    detection?: import('./ml/types').CubeDetectionResult
  ): FrameClassificationResult {
    if (stickers.length !== 9) {
      throw new Error(`Expected 9 sticker samples, received ${stickers.length}`);
    }

    // If ML detector identifies a human face or non-cube, or if any cell fails authentic cube color criteria, strictly reject stability accumulation
    const hasNonCubeCell = stickers.some((s) => s.isCubeColor === false);
    if ((detection && !detection.isCube) || hasNonCubeCell) {
      this.consecutiveMatches = 0;
      this.history = [];
      return {
        stickers,
        averageConfidence: 0,
        isStable: false,
        stabilityProgress: 0,
        stableFramesCount: 0,
        expectedFace,
        detection,
      };
    }

    const currentColors: CubeColor[] = stickers.map((s) => s.predictedColor);
    const avgConfidence =
      stickers.reduce((acc, s) => acc + s.confidence, 0) / stickers.length;

    if (this.history.length > 0) {
      const lastFrame = this.history[this.history.length - 1];
      const lastColors = lastFrame.map((s) => s.predictedColor);

      // Check if all 9 colors match previous frame exactly
      const allMatch = currentColors.every((c, i) => c === lastColors[i]);

      if (allMatch && avgConfidence >= this.minConfidence) {
        this.consecutiveMatches++;
      } else {
        // Decay or reset on inconsistency
        this.consecutiveMatches = Math.max(0, this.consecutiveMatches - 2);
      }
    } else {
      this.consecutiveMatches = 1;
    }

    this.history.push(stickers);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const progress = Math.min(1.0, this.consecutiveMatches / this.requiredFrames);
    const isStable =
      this.consecutiveMatches >= this.requiredFrames &&
      avgConfidence >= this.minConfidence;

    return {
      stickers,
      averageConfidence: Math.round(avgConfidence * 100) / 100,
      isStable,
      stabilityProgress: Math.round(progress * 100) / 100,
      stableFramesCount: this.consecutiveMatches,
      expectedFace,
      detection,
    };
  }

  public getHistory(): StickerSample[][] {
    return this.history;
  }
}
