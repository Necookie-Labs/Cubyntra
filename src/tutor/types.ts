/**
 * Cubyntra - Tutor Engine Types
 * Necookie Labs (c) 2026
 *
 * A method (beginner's or CFOP) is an ordered list of stages. Each stage can tell whether a cube
 * has finished it, plan the next small step from any cube state, and say which faces to show
 * for the checkpoint scan. The engine replays every plan on the logical cube before returning it.
 * Pure TypeScript: no DOM, Three.js or React imports.
 */

import { CubeColor, CubeState, Face, Move } from '../cube/types';
import { StickerRef } from '../cube/geometry';
import { Grip } from '../cube/grip';

export type MethodId = 'beginner' | 'cfop';

/** A piece named by its colors (1 = center, 2 = edge, 3 = corner), wherever it currently sits. */
export interface PieceRef {
  kind: 'center' | 'edge' | 'corner';
  colors: CubeColor[];
}

/** What the checkpoint scan compares after a step. */
export interface CheckpointSpec {
  /** One or two faces to show the camera, named relative to the grip after the step. */
  facesToShow: Face[];
  /** Stickers on those faces, in the frame of `expectedState`, that this step changed or placed. */
  stickers: StickerRef[];
}

/** Plain facts the coach turns into an explanation. The engine never asks Claude for moves. */
export interface StepFacts {
  /** What this step achieves. */
  goal: string;
  /** What the student should find on the cube before turning. */
  lookFor: string;
  /** Why the moves work. */
  why: string;
  /** Set when `algorithm` is one short sequence done several times in a row. */
  repeat?: { unit: Move[]; times: number };
}

/** What a stage planner returns; the engine adds grips, states, the checkpoint and the checks. */
export interface StepDraft {
  caseId: string;
  caseName: string;
  /** Regrips (x y z) and lining-up turns before the algorithm, relative to the stage's view. */
  setupMoves: Move[];
  algorithm: Move[];
  highlightPieces: PieceRef[];
  /** The place the highlighted piece is going, named by the centers around it. */
  targetSlot?: PieceRef;
  facts: StepFacts;
}

/** One small, teachable step: line something up, then do one algorithm. */
export interface StepPlan extends StepDraft {
  method: MethodId;
  /** Stage id, e.g. `white-cross` or `f2l`. */
  stage: string;
  stageName: string;
  stageIndex: number;
  /** Position of this step in a guided solve (0 unless the caller numbers the steps). */
  stepIndex: number;
  /** How the student holds the cube when the step starts. All moves are relative to it. */
  grip: Grip;
  /** How the cube is held once the step is done (differs from `grip` after a regrip). */
  gripAfter: Grip;
  /** The cube as seen in `grip` before any move. */
  startState: CubeState;
  /** `startState` after `setupMoves` then `algorithm`, as seen in `gripAfter`. */
  expectedState: CubeState;
  checkpoint: CheckpointSpec;
  /** Method progress before and after; `after` is always greater. */
  progressBefore: number;
  progressAfter: number;
}

/** Which faces the checkpoint prefers when several changed equally. */
export interface CheckSpec {
  prefer: Face[];
}

export interface StageDefinition {
  id: string;
  name: string;
  /** Center color that must be on top while this stage's moves are done. */
  top: CubeColor;
  /**
   * Detector: true once the cube has finished this stage and every stage before it. Must give
   * the same answer however the cube is held.
   */
  isComplete(state: CubeState): boolean;
  /**
   * How far through the stage a cube is: a whole number from 0 to 999 that every step raises.
   * `view` is held with `top` on top.
   */
  progress(view: CubeState): number;
  /** Planner: the next step for a cube held with `top` on top. */
  plan(view: CubeState): StepDraft;
  check: CheckSpec;
}

export interface MethodDefinition {
  id: MethodId;
  name: string;
  stages: StageDefinition[];
}

export interface TutorProgress {
  method: MethodId;
  /** Index of the stage being worked on; equals the stage count when the cube is solved. */
  stageIndex: number;
  /** Id of that stage, or null when the cube is solved. */
  stage: string | null;
  /** Progress inside the stage, 0 to 999. */
  withinStage: number;
  /** `stageIndex * 1000 + withinStage`: one number that every step raises. */
  value: number;
  done: boolean;
}

export interface GuidedSolve {
  method: MethodId;
  steps: StepPlan[];
  /** Every move of every step in order, regrips included. */
  moves: Move[];
  /** Number of layer turns (regrips are not counted). */
  turnCount: number;
  finalState: CubeState;
}

/** A plan failed its replay check, or no plan exists for the state. Never shown as a step. */
export class TutorPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TutorPlanError';
  }
}
