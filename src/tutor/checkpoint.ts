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
 * color) while showing a face, so observations and `expectedState` share one frame.
 * Pure TypeScript: no DOM, camera or vision imports.
 */

import { CubeColor, Face } from '../cube/types';
import { FACES } from '../cube/constants';
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

  // 2. The check-spec stickers decide.
  const stickerResults = plan.checkpoint.stickers.map((ref) =>
    resultFor(ref.face, ref.index, shown.get(ref.face)?.stickers[ref.index] ?? null)
  );

  // 3. Everything else on the shown faces is kept for the diagnosis, never for the verdict.
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
  const base = { stickerResults, missingFaces, elsewhere, manual: false };

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
