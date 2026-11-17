/**
 * Cubyntra - Step narration (ADR-016)
 * Necookie Labs (c) 2026
 *
 * What the voice says as the twin plays a step: each move's name as it starts turning forwards
 * (stepping back is silent), and a stage intro when a step opens a new stage. Lines come from
 * the phrase bank, so with ElevenLabs they are cached clips.
 *
 * Pure TypeScript: no DOM, React or Three.js imports.
 */

import type { Move } from '../cube/types';
import { movePhrase, stagePhrase } from './phrases';
import type { MoveSpeech } from './speechText';

/** The part of the twin's playback snapshot narration reads. */
export interface NarrationSnapshot {
  readonly moves: readonly Move[];
  readonly activeIndex: number | null;
  readonly direction: 'forward' | 'back' | null;
}

/**
 * The line to say for the change from `prev` to `next`, or null: a move that has just started
 * turning forwards (a new step's moves, or the next move of the same step).
 */
export function narratedMove(prev: NarrationSnapshot | null, next: NarrationSnapshot, style: MoveSpeech): string | null {
  if (next.activeIndex === null || next.direction !== 'forward') return null;
  const same = prev && prev.moves === next.moves && prev.activeIndex === next.activeIndex && prev.direction === next.direction;
  if (same) return null;
  const move = next.moves[next.activeIndex];
  return move ? movePhrase(move, style) : null;
}

/** The stage intro when `stageName` starts a new stage (null when it continues the last one). */
export function stageIntro(previousStage: string | null, stage: string, stageName: string): string | null {
  return previousStage === stage ? null : stagePhrase(stageName);
}
