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

/** How CFOP solves the last layer: four small steps (2-look) or one OLL and one PLL step. */
export type LastLayerMode = '2-look' | 'full';

/**
 * Learner settings that change how a method is taught. Every field is optional and leaving it
 * out means its default, so `{}` is always the method as a beginner first meets it.
 */
export interface MethodOptions {
  /** CFOP only (ignored by the beginner's method). Default `'2-look'`. */
  lastLayer?: LastLayerMode;
}

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
  /**
   * The learner settings the plan was made with, present only when they differ from the
   * defaults. Pass them along when planning again from this step.
   */
  options?: MethodOptions;
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
  /** Set on a variant of a method: the learner settings that select it. */
  options?: MethodOptions;
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

/** One sticker as a checkpoint scan read it. */
export interface StickerObservation {
  color: CubeColor;
  /** 0..1. Below the checkpoint's threshold the sticker counts as not seen. */
  confidence: number;
  /** True when the student set this tile by hand. */
  edited?: boolean;
}

/**
 * One face shown for a checkpoint. `face` is the face the student was asked to show, named in
 * the frame of the plan's `gripAfter`; `stickers` are its nine tiles row-major in that frame's
 * standard face layout (index 4 = center), exactly like a face of `expectedState`.
 */
export interface FaceObservation {
  face: Face;
  stickers: StickerObservation[];
}

export type StickerOutcome = 'match' | 'mismatch' | 'uncertain' | 'missing';

export interface StickerResult extends StickerRef {
  expected: CubeColor;
  /** Null when the sticker's face was not shown. */
  observed: CubeColor | null;
  confidence: number;
  outcome: StickerOutcome;
}

/** `wrong-face`: a shown face has the wrong center, so nothing else on it was compared. */
export type CheckpointStatus = 'match' | 'mismatch' | 'uncertain' | 'wrong-face';

export interface WrongFace {
  /** The face that was asked for, and the center color it must have. */
  asked: Face;
  askedCenter: CubeColor;
  /** The center color the camera saw, and the face of the expected cube that has it. */
  shownCenter: CubeColor;
  shown: Face;
}

export interface CheckpointResult {
  status: CheckpointStatus;
  /** One entry per check-spec sticker, in the plan's order. Only these decide `status`. */
  stickerResults: StickerResult[];
  /** 0..1: how sure the check is of `status`. */
  confidence: number;
  /** Set when `status` is `wrong-face`. */
  wrongFace?: WrongFace;
  /** Faces of the check spec that have not been shown yet. */
  missingFaces: Face[];
  /** Confidently read stickers on the shown faces, outside the check spec, that differ. */
  elsewhere: StickerResult[];
  /** True when the student confirmed by hand instead of the camera. */
  manual: boolean;
  /** One plain sentence for the student. */
  message: string;
}

/** The kinds of slip the checkpoint can name (the coach's `MistakeKind`). */
export type MistakeKind =
  | 'wrong-direction'
  | 'skipped-move'
  | 'doubled-move'
  | 'wrong-face'
  | 'wrong-grip'
  | 'other';

/** Finer label for kind `other`. */
export type MistakeDetail = 'stopped-early' | 'extra-repeat' | 'two-mistakes';

/** One way the student may have gone wrong that fits what the checkpoint scan saw. */
export interface LikelyMistake {
  kind: MistakeKind;
  detail?: MistakeDetail;
  /** Index into the step's moves (setup then algorithm) where it happened, when it has one. */
  moveIndex?: number;
  /** 0..1: share of belief among all the mistakes considered. */
  confidence: number;
  /** Plain language, no notation: "You probably skipped move 3: turn the top to the left." */
  description: string;
  /** What the student most likely did, from `startState` held in the plan's `grip`. */
  performedMoves: Move[];
  /** The cube after `performedMoves`, as seen in the plan's `gripAfter`. */
  resultingState: CubeState;
  /** Log-likelihood of the observed stickers plus the log prior of this kind of slip. */
  score: number;
  /** Confidently read stickers that this mistake does not explain. */
  contradictions: number;
}

export interface Diagnosis {
  /** Ranked, most likely first. Empty when no mistake considered fits at all. */
  likelyMistakes: LikelyMistake[];
  /**
   * True when the first mistake explains every confidently read sticker and no other mistake
   * considered leads to a different cube that would look the same on the shown faces.
   */
  confident: boolean;
  /** When several different cubes fit equally, the face that would best tell them apart. */
  showNext?: Face;
}

/** A plan failed its replay check, or no plan exists for the state. Never shown as a step. */
export class TutorPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TutorPlanError';
  }
}
