/**
 * Cubyntra - Checkpoint Verification
 * Necookie Labs (c) 2026
 *
 * After a step the student shows one or two faces. This module compares what the camera read
 * with the plan's `expectedState`. Only the plan's check-spec stickers decide the result; each
 * carries a confidence, and a check-spec sticker that was not read clearly makes the result
 * `uncertain` ("show me again") rather than a guess. A face is recognised by its center, so
 * showing the wrong face is reported as such instead of as a mistake in the moves.
 *
 * The student holds the cube as the plan's `gripAfter` says (top and front named by center
 * color) while showing a face, so observations and `expectedState` share one frame. A center
 * cannot tell which way up a face was shown, so `showFaceInstruction` says which neighbouring
 * face goes at the top of the picture (`PICTURE_TOP`), and a face that only fits when its picture
 * is turned is accepted turned when nothing else explains it, or asked for again when a turn of
 * that layer would look the same.
 * Pure TypeScript: no DOM, camera or vision imports.
 */

import { CubeColor, CubeState, Face } from '../cube/types';
import { FACES } from '../cube/constants';
import { gripCenters, type Grip } from '../cube/grip';
import { applyMoves, parseAlgorithm } from '../cube/transforms';
import {
  CheckpointResult,
  FaceObservation,
  StepPlan,
  StickerObservation,
  StickerResult,
  WrongFace,
} from './types';

/** A sticker read with less confidence than this counts as not seen. */
export const MIN_STICKER_CONFIDENCE = 0.5;

export interface CheckpointOptions {
  minConfidence?: number;
  /**
   * Faces already asked for again "the right way up": their reading is taken as held, never
   * turned (so a real slip of that layer is not asked about twice).
   */
  trustHold?: readonly Face[];
}

const FACE_WORD: Record<Face, string> = {
  U: 'top',
  D: 'bottom',
  F: 'front',
  B: 'back',
  R: 'right',
  L: 'left',
};

/** "the top face (yellow center)". */
export function describeFace(face: Face, center: CubeColor): string {
  return `the ${FACE_WORD[face]} face (${center} center)`;
}

/**
 * The face whose edge is at the top of the camera picture when a face is shown the asked way
 * (the sticker index convention of `src/cube/geometry.ts`): the back edge for the top face
 * (tilt the top toward the camera), the front edge for the bottom face (tilt the cube back),
 * and the top edge for the four sides (turn the cube, top stays up).
 */
export const PICTURE_TOP: Record<Face, Face> = { U: 'B', D: 'F', F: 'U', B: 'U', R: 'U', L: 'U' };

/** Exactly how to hold the cube in `grip` to show `face` to the camera. */
export function showFaceInstruction(grip: Grip, face: Face): string {
  const c = gripCenters(grip);
  const hold = `Hold the cube with ${c.U} on top and ${c.F} facing you`;
  switch (face) {
    case 'F':
      return `${hold}, and point the front face (${c.F} center) at the camera, ${c.U} at the top of the picture.`;
    case 'U':
      return `${hold}, then tilt the cube toward you so the top face (${c.U} center) faces the camera, keeping the front face (${c.F} center) at the bottom of the picture.`;
    case 'D':
      return `${hold}, then tilt the cube back so the bottom face (${c.D} center) faces the camera, keeping the front face (${c.F} center) at the top of the picture.`;
    case 'B':
      return `${hold}, then turn it round so the back face (${c.B} center) faces the camera, keeping ${c.U} at the top of the picture.`;
    default:
      return `${hold}, then turn it so the ${FACE_WORD[face]} face (${c[face]} center) faces the camera, keeping ${c.U} at the top of the picture.`;
  }
}

/** A face's tiles after turning the camera picture `turns` quarter turns clockwise. */
export function turnPicture<T>(tiles: readonly T[], turns: 0 | 1 | 2 | 3): T[] {
  let out = [...tiles];
  for (let t = 0; t < turns; t++) {
    const before = out;
    out = before.map((_, i) => before[(2 - (i % 3)) * 3 + Math.floor(i / 3)]);
  }
  return out;
}

type Rotation = { kind: 'none' } | { kind: 'turned'; turns: Map<Face, 1 | 2 | 3> } | { kind: 'unclear'; face: Face };

const TURNS = [1, 2, 3] as const;
const LAYER_TURN = { 1: '', 2: '2', 3: "'" } as const;

/**
 * Whether the shown faces line up with `expected` only when some of their pictures are turned.
 * A turn is used when every shown face fits the expected cube (each at one turn) and the
 * fitting turn is the only one for its face. If, instead, one turn of each turned face's own
 * layer explains the readings as shown, a slip and a rotated hold look the same: `unclear`.
 */
function chooseRotation(
  expected: CubeState,
  shown: Map<Face, FaceObservation>,
  minConfidence: number,
  skip: ReadonlySet<Face>
): Rotation {
  const fits = (state: CubeState, face: Face, turns: 0 | 1 | 2 | 3) => {
    const tiles = turnPicture(shown.get(face)!.stickers, turns);
    return tiles.every((s, i) => s.confidence < minConfidence || s.color === state[face][i]);
  };
  const turned = new Map<Face, 1 | 2 | 3>();
  for (const face of shown.keys()) {
    if (skip.has(face) || fits(expected, face, 0)) continue;
    const options = TURNS.filter((k) => fits(expected, face, k));
    if (options.length === 0) return { kind: 'none' };
    if (options.length > 1) return { kind: 'unclear', face };
    turned.set(face, options[0]);
  }
  if (!turned.size) return { kind: 'none' };

  // The same readings, held as asked, after one turn of each turned face's layer?
  const faces = [...turned.keys()];
  const combos = faces.reduce<string[][]>(
    (acc, face) => acc.flatMap((a) => TURNS.map((k) => [...a, `${face}${LAYER_TURN[k]}`])),
    [[]]
  );
  for (const combo of combos) {
    const alt = applyMoves(expected, parseAlgorithm(combo.join(' ')));
    if ([...shown.keys()].every((face) => fits(alt, face, 0))) return { kind: 'unclear', face: faces[0] };
  }
  return { kind: 'turned', turns: turned };
}

/** The latest observation of each face; a face shown twice keeps the newer reading. */
function byFace(observations: readonly FaceObservation[]): Map<Face, FaceObservation> {
  const map = new Map<Face, FaceObservation>();
  for (const observation of observations) {
    if (observation.stickers.length !== 9) {
      throw new Error(`An observed face has 9 stickers, got ${observation.stickers.length}`);
    }
    map.set(observation.face, observation);
  }
  return map;
}

/**
 * Compares checkpoint observations with a plan.
 * - `wrong-face`: a shown face's center is not the one asked for (`wrongFace` says which).
 * - `mismatch`: at least one check-spec sticker was read clearly and is the wrong color.
 * - `uncertain`: no clear mismatch, but a check-spec sticker (or its face's center) was not
 *   read clearly, or a face of the check spec has not been shown yet.
 * - `match`: every check-spec sticker was read clearly and is right.
 */
export function verifyCheckpoint(
  plan: StepPlan,
  observations: readonly FaceObservation[],
  options: CheckpointOptions = {}
): CheckpointResult {
  const minConfidence = options.minConfidence ?? MIN_STICKER_CONFIDENCE;
  const expected = plan.expectedState;
  const shown = byFace(observations);

  const missingFaces = plan.checkpoint.facesToShow.filter((face) => !shown.has(face));
  const unsureCenters = new Set<Face>();

  // 1. Is each shown face the face that was asked for?
  for (const [face, observation] of shown) {
    const center = observation.stickers[4];
    if (center.confidence < minConfidence) {
      unsureCenters.add(face);
      continue;
    }
    if (center.color !== expected[face][4]) {
      const wrongFace: WrongFace = {
        asked: face,
        askedCenter: expected[face][4],
        shownCenter: center.color,
        shown: FACES.find((f) => expected[f][4] === center.color)!,
      };
      return {
        status: 'wrong-face',
        stickerResults: plan.checkpoint.stickers.map((ref) => resultFor(ref.face, ref.index, null)),
        confidence: center.confidence,
        wrongFace,
        missingFaces,
        elsewhere: [],
        manual: false,
        message:
          `That is the face with the ${wrongFace.shownCenter} center. ` +
          `Show me ${describeFace(face, wrongFace.askedCenter)}.`,
      };
    }
  }

  // 2. Which way up was each face shown? (A center cannot tell.)
  const rotation = chooseRotation(
    expected,
    shown,
    minConfidence,
    new Set([...unsureCenters, ...(options.trustHold ?? [])])
  );
  if (rotation.kind === 'unclear') {
    const face = rotation.face;
    const top = PICTURE_TOP[face];
    return {
      status: 'uncertain',
      stickerResults: plan.checkpoint.stickers.map((ref) => {
        const seen = shown.get(ref.face)?.stickers[ref.index] ?? null;
        const result = resultFor(ref.face, ref.index, seen);
        return ref.face === face && seen ? { ...result, outcome: 'uncertain' as const } : result;
      }),
      confidence: 0,
      missingFaces,
      elsewhere: [],
      manual: false,
      rotationUnclear: face,
      message:
        `I could not tell which way up that face was. Show me ${describeFace(face, expected[face][4])} again, ` +
        `with ${describeFace(top, expected[top][4])} at the top of the picture.`,
    };
  }
  const rotations: Partial<Record<Face, 1 | 2 | 3>> = {};
  if (rotation.kind === 'turned') {
    for (const [face, turns] of rotation.turns) {
      shown.set(face, { face, stickers: turnPicture(shown.get(face)!.stickers, turns) });
      rotations[face] = turns;
    }
  }

  function resultFor(face: Face, index: number, seen: StickerObservation | null): StickerResult {
    const want = expected[face][index];
    if (!seen) return { face, index, expected: want, observed: null, confidence: 0, outcome: 'missing' };
    const clear = seen.confidence >= minConfidence && !unsureCenters.has(face);
    return {
      face,
      index,
      expected: want,
      observed: seen.color,
      confidence: seen.confidence,
      outcome: !clear ? 'uncertain' : seen.color === want ? 'match' : 'mismatch',
    };
  }

  // 3. The check-spec stickers decide.
  const stickerResults = plan.checkpoint.stickers.map((ref) =>
    resultFor(ref.face, ref.index, shown.get(ref.face)?.stickers[ref.index] ?? null)
  );

  // 4. Everything else on the shown faces is kept for the diagnosis, never for the verdict.
  const inSpec = new Set(plan.checkpoint.stickers.map((ref) => `${ref.face}${ref.index}`));
  const elsewhere: StickerResult[] = [];
  for (const [face, observation] of shown) {
    observation.stickers.forEach((seen, index) => {
      if (inSpec.has(`${face}${index}`)) return;
      const result = resultFor(face, index, seen);
      if (result.outcome === 'mismatch') elsewhere.push(result);
    });
  }

  const wrong = stickerResults.filter((r) => r.outcome === 'mismatch');
  const unclear = stickerResults.filter((r) => r.outcome === 'uncertain' || r.outcome === 'missing');
  const base = {
    stickerResults,
    missingFaces,
    elsewhere,
    manual: false,
    ...(Object.keys(rotations).length ? { rotations } : {}),
  };

  if (wrong.length) {
    return {
      ...base,
      status: 'mismatch',
      confidence: Math.max(...wrong.map((r) => r.confidence)),
      message: 'That does not match yet. Let us find what happened.',
    };
  }
  if (unclear.length || missingFaces.length) {
    const unclearFace =
      missingFaces[0] ?? unclear.find((r) => r.outcome === 'uncertain')?.face ?? unclear[0].face;
    const verb = missingFaces.length ? 'Show me' : 'I could not see that clearly. Show me';
    return {
      ...base,
      status: 'uncertain',
      confidence: Math.min(...stickerResults.map((r) => r.confidence)),
      message: `${verb} ${describeFace(unclearFace, expected[unclearFace][4])}${missingFaces.length ? '' : ' again'}.`,
    };
  }
  return {
    ...base,
    status: 'match',
    confidence: Math.min(...stickerResults.map((r) => r.confidence)),
    message: 'That matches. Well done!',
  };
}

/**
 * The student pressed "it matches": the same result shape as a camera match, marked manual.
 * The app continues from the plan's `expectedState`.
 */
export function confirmManually(plan: StepPlan): CheckpointResult {
  return {
    status: 'match',
    stickerResults: plan.checkpoint.stickers.map((ref) => {
      const color = plan.expectedState[ref.face][ref.index];
      return { ...ref, expected: color, observed: color, confidence: 1, outcome: 'match' as const };
    }),
    confidence: 1,
    missingFaces: [],
    elsewhere: [],
    manual: true,
    message: 'Marked as matching.',
  };
}

export interface TileEdit {
  /** Tile index on the observed face, 0..8 row-major. */
  index: number;
  color: CubeColor;
}

/**
 * Applies tiles the student corrected by hand. An edited tile is taken at full confidence, so
 * a face the camera could not read can still be checked. Returns a new observation.
 */
export function applyTileEdits(observation: FaceObservation, edits: readonly TileEdit[]): FaceObservation {
  const stickers = observation.stickers.map((s) => ({ ...s }));
  for (const edit of edits) {
    if (!Number.isInteger(edit.index) || edit.index < 0 || edit.index > 8) {
      throw new Error(`Tile index must be 0 to 8, got ${edit.index}`);
    }
    stickers[edit.index] = { color: edit.color, confidence: 1, edited: true };
  }
  return { face: observation.face, stickers };
}

/** A face observation built from classified tiles (e.g. `readFaceFromContext(...).stickers`). */
export function observeFace(face: Face, readings: readonly StickerObservation[]): FaceObservation {
  if (readings.length !== 9) throw new Error(`An observed face has 9 stickers, got ${readings.length}`);
  return { face, stickers: readings.map(({ color, confidence }) => ({ color, confidence })) };
}

/** The observation a perfect camera would make of one face of a state (for tests and the twin). */
export function observationOf(state: Record<Face, readonly CubeColor[]>, face: Face, confidence = 1): FaceObservation {
  return { face, stickers: state[face].map((color) => ({ color, confidence })) };
}
