/**
 * Cubyntra - Step Plan to Twin Mapping
 * Necookie Labs (c) 2026
 *
 * Turns what a tutor step plan says (pieces named by their colors, a target slot named by the
 * centers around it, faces to show the camera) into what the 3D twin draws: cubie positions and
 * faces in the twin's logical frame.
 *
 * The twin's frame is the frame of the state it shows: x = -1 (L) .. 1 (R), y = -1 (D) .. 1 (U),
 * z = -1 (B) .. 1 (F), the same as `stickerPosition` in src/cube/geometry. A step plan's states
 * are stored as the student holds the cube (`startState` in `grip`, `expectedState` in
 * `gripAfter`), and the teaching twin shows exactly those states, so a position computed from the
 * state the twin is showing is where the piece is on screen. Pure: no DOM or Three.js.
 */

import type { CubeColor, CubeState, Face } from '../cube/types';
import { FACES } from '../cube/constants';
import { FACE_NORMAL, stickerPosition } from '../cube/geometry';
import { findCorner, findEdge } from '../cube/pieces';
import type { PieceRef, StepPlan } from '../tutor/types';

/** A cubie position in the twin's frame; each coordinate is -1, 0 or 1. */
export type TwinPosition = readonly [number, number, number];

/** The face whose center shows `color`. Throws if no center does. */
export function faceOfCenter(state: CubeState, color: CubeColor): Face {
  const face = FACES.find((f) => state[f][4] === color);
  if (!face) throw new Error(`No center is ${color}`);
  return face;
}

function sum(vectors: readonly (readonly number[])[]): TwinPosition {
  const out = [0, 0, 0];
  for (const v of vectors) for (let i = 0; i < 3; i++) out[i] += v[i];
  return [out[0] + 0, out[1] + 0, out[2] + 0];
}

/**
 * Where the piece with these colors sits in `state`: a center by its color, an edge or corner
 * wherever `findEdge` / `findCorner` finds it. Throws if the state has no such piece.
 */
export function piecePosition(state: CubeState, piece: PieceRef): TwinPosition {
  const c = piece.colors;
  switch (piece.kind) {
    case 'center':
      return sum([FACE_NORMAL[faceOfCenter(state, c[0])]]);
    case 'edge': {
      const { face, index } = findEdge(state, [c[0], c[1]]).stickers[0];
      return stickerPosition(face, index);
    }
    case 'corner': {
      const { face, index } = findCorner(state, [c[0], c[1], c[2]]).stickers[0];
      return stickerPosition(face, index);
    }
  }
}

/** Positions of every highlighted piece in `state`, for `engine.setSpotlight`. */
export function spotlightPositions(state: CubeState, pieces: readonly PieceRef[]): { position: TwinPosition }[] {
  return pieces.map((piece) => ({ position: piecePosition(state, piece) }));
}

/**
 * The home position of a piece named by its colors: the cubie between the faces whose centers
 * show those colors (e.g. white, red, green = the corner slot between those three centers).
 * For `engine.setSlotOutline`. Throws if the colors do not name adjacent centers.
 */
export function slotPosition(state: CubeState, slot: PieceRef): TwinPosition {
  const faces = slot.colors.map((color) => faceOfCenter(state, color));
  const expected = slot.kind === 'center' ? 1 : slot.kind === 'edge' ? 2 : 3;
  const position = sum(faces.map((f) => FACE_NORMAL[f]));
  const distinctAxes = new Set(faces.map((f) => FACE_NORMAL[f].findIndex((v) => v !== 0))).size;
  if (faces.length !== expected || distinctAxes !== expected) {
    throw new Error(`Not a ${slot.kind} slot: ${slot.colors.join('/')}`);
  }
  return position;
}

/** One face the checkpoint wants to see, located on the twin. */
export interface TwinFace {
  /** The face as the student names it after the step (in `gripAfter`). */
  face: Face;
  /** Where that face is on the twin showing `shown`. */
  twinFace: Face;
  /** Its outward direction in the twin's frame. */
  normal: TwinPosition;
  /** Its center color, which identifies it however the cube is held. */
  centerColor: CubeColor;
}

/**
 * The checkpoint's faces on the twin. `facesToShow` is named in `gripAfter`; each face is found
 * on the twin by its center color, so this holds whatever state the twin is showing (default:
 * the plan's `expectedState`, where the twin ends after the step and every face maps to itself).
 */
export function checkpointFaces(plan: StepPlan, shown: CubeState = plan.expectedState): TwinFace[] {
  return plan.checkpoint.facesToShow.map((face) => {
    const centerColor = plan.expectedState[face][4];
    const twinFace = faceOfCenter(shown, centerColor);
    return { face, twinFace, normal: sum([FACE_NORMAL[twinFace]]), centerColor };
  });
}
