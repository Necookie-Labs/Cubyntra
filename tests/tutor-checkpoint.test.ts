import { describe, expect, it } from 'vitest';
import { CubeColor, Face } from '../src/cube/types';
import { FACES } from '../src/cube/constants';
import { planNextStep, runGuidedSolve } from '../src/tutor';
import {
  MIN_STICKER_CONFIDENCE,
  applyTileEdits,
  confirmManually,
  describeFace,
  observationOf,
  observeFace,
  verifyCheckpoint,
} from '../src/tutor/checkpoint';
import { FaceObservation, StepPlan } from '../src/tutor/types';
import { scrambledState } from './helpers/scrambles';

const plan = planNextStep(scrambledState(91, 1), 'cfop')!;
const shownFaces = (p: StepPlan, confidence = 1) =>
  p.checkpoint.facesToShow.map((face) => observationOf(p.expectedState, face, confidence));

/** A color that is not `color`. */
const other = (color: CubeColor): CubeColor => (color === 'red' ? 'blue' : 'red');

function withSticker(
  observations: FaceObservation[],
  face: Face,
  index: number,
  change: Partial<FaceObservation['stickers'][number]>
): FaceObservation[] {
  return observations.map((o) =>
    o.face === face ? { ...o, stickers: o.stickers.map((s, i) => (i === index ? { ...s, ...change } : s)) } : o
  );
}

/** A non-center tile of the first shown face that the check spec does not list. */
function tileOutsideSpec(p: StepPlan): { face: Face; index: number } {
  const inSpec = new Set(p.checkpoint.stickers.map((s) => `${s.face}${s.index}`));
  for (const face of p.checkpoint.facesToShow) {
    const index = [0, 1, 2, 3, 5, 6, 7, 8].find((i) => !inSpec.has(`${face}${i}`));
    if (index !== undefined) return { face, index };
  }
  throw new Error('Every shown tile is in the check spec');
}

describe('verifyCheckpoint', () => {
  it('matches when every check-spec sticker is read clearly and is right', () => {
    const result = verifyCheckpoint(plan, shownFaces(plan, 0.9));
    expect(result.status).toBe('match');
    expect(result.confidence).toBe(0.9);
    expect(result.manual).toBe(false);
    expect(result.missingFaces).toEqual([]);
    expect(result.stickerResults).toHaveLength(plan.checkpoint.stickers.length);
    for (const r of result.stickerResults) expect(r.outcome).toBe('match');
  });

  it('matches every step of a guided solve of each method', () => {
    for (const method of ['beginner', 'cfop'] as const) {
      for (const step of runGuidedSolve(scrambledState(91, 2), method).steps) {
        expect(verifyCheckpoint(step, shownFaces(step)).status).toBe('match');
      }
    }
  });

  it('reports a mismatch for one clearly wrong check-spec sticker', () => {
    const ref = plan.checkpoint.stickers.find((s) => s.index !== 4)!;
    const right = plan.expectedState[ref.face][ref.index];
    const wrong = other(right);
    const result = verifyCheckpoint(
      plan,
      withSticker(shownFaces(plan), ref.face, ref.index, { color: wrong, confidence: 0.8 })
    );
    expect(result.status).toBe('mismatch');
    expect(result.confidence).toBe(0.8);
    expect(result.stickerResults.filter((r) => r.outcome === 'mismatch')).toEqual([
      { face: ref.face, index: ref.index, expected: right, observed: wrong, confidence: 0.8, outcome: 'mismatch' },
    ]);
  });

  it('ignores stickers outside the check spec for the verdict but lists them', () => {
    const { face, index } = tileOutsideSpec(plan);
    const right = plan.expectedState[face][index];
    const wrong = other(right);
    const result = verifyCheckpoint(plan, withSticker(shownFaces(plan), face, index, { color: wrong }));
    expect(result.status).toBe('match');
    expect(result.elsewhere).toEqual([
      { face, index, expected: right, observed: wrong, confidence: 1, outcome: 'mismatch' },
    ]);
  });

  it('is uncertain when a check-spec sticker is not read clearly, right color or not', () => {
    const ref = plan.checkpoint.stickers.find((s) => s.index !== 4)!;
    const right = plan.expectedState[ref.face][ref.index];
    const low = MIN_STICKER_CONFIDENCE - 0.01;
    for (const color of [right, other(right)]) {
      const result = verifyCheckpoint(
        plan,
        withSticker(shownFaces(plan), ref.face, ref.index, { color, confidence: low })
      );
      expect(result.status).toBe('uncertain');
      expect(result.confidence).toBe(low);
      expect(result.message).toContain('again');
      expect(result.message).toContain(describeFace(ref.face, plan.expectedState[ref.face][4]));
      expect(result.stickerResults.filter((r) => r.outcome === 'uncertain')).toHaveLength(1);
    }
  });

  it('is not made uncertain by an unclear sticker outside the check spec', () => {
    const { face, index } = tileOutsideSpec(plan);
    const observations = withSticker(shownFaces(plan), face, index, { confidence: 0 });
    expect(verifyCheckpoint(plan, observations).status).toBe('match');
  });

  it('lets a clear mismatch win over an unclear sticker', () => {
    const [a, b] = plan.checkpoint.stickers.filter((s) => s.index !== 4);
    let observations = withSticker(shownFaces(plan), a.face, a.index, { confidence: 0.1 });
    observations = withSticker(observations, b.face, b.index, {
      color: other(plan.expectedState[b.face][b.index]),
    });
    expect(verifyCheckpoint(plan, observations).status).toBe('mismatch');
  });

  it('uses a custom confidence threshold', () => {
    expect(verifyCheckpoint(plan, shownFaces(plan, 0.6), { minConfidence: 0.7 }).status).toBe('uncertain');
    expect(verifyCheckpoint(plan, shownFaces(plan, 0.3), { minConfidence: 0.2 }).status).toBe('match');
  });

  it('asks for a face of the check spec that was not shown', () => {
    const twoFaces = runGuidedSolve(scrambledState(91, 3), 'cfop').steps.find(
      (s) => s.checkpoint.facesToShow.length === 2
    )!;
    const [first, second] = twoFaces.checkpoint.facesToShow;
    const result = verifyCheckpoint(twoFaces, [observationOf(twoFaces.expectedState, first)]);
    expect(result.status).toBe('uncertain');
    expect(result.missingFaces).toEqual([second]);
    expect(result.message).toBe(`Show me ${describeFace(second, twoFaces.expectedState[second][4])}.`);
    const missing = result.stickerResults.filter((r) => r.outcome === 'missing');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((r) => r.face === second)).toBe(true);
    expect(verifyCheckpoint(twoFaces, []).status).toBe('uncertain');
  });

  it('names the face to show when the wrong face is shown', () => {
    const asked = plan.checkpoint.facesToShow[0];
    for (const shown of FACES.filter((f) => f !== asked)) {
      // The student shows face `shown` when asked for `asked`.
      const observation = { ...observationOf(plan.expectedState, shown), face: asked };
      const rest = shownFaces(plan).filter((o) => o.face !== asked);
      const result = verifyCheckpoint(plan, [observation, ...rest]);
      expect(result.status).toBe('wrong-face');
      expect(result.wrongFace).toEqual({
        asked,
        askedCenter: plan.expectedState[asked][4],
        shownCenter: plan.expectedState[shown][4],
        shown,
      });
      expect(result.message).toContain(`${plan.expectedState[shown][4]} center`);
      expect(result.message).toContain(describeFace(asked, plan.expectedState[asked][4]));
      expect(result.stickerResults.every((r) => r.outcome === 'missing')).toBe(true);
    }
  });

  it('is uncertain, not wrong-face, when the center itself is unclear', () => {
    const asked = plan.checkpoint.facesToShow[0];
    const observations = withSticker(shownFaces(plan), asked, 4, {
      color: other(plan.expectedState[asked][4]),
      confidence: 0.2,
    });
    const result = verifyCheckpoint(plan, observations);
    expect(result.status).toBe('uncertain');
    // Nothing on a face with an unclear center is trusted.
    const onFace = result.stickerResults.filter((r) => r.face === asked);
    expect(onFace.length).toBeGreaterThan(0);
    expect(onFace.every((r) => r.outcome === 'uncertain')).toBe(true);
  });

  it('keeps the newer reading when a face is shown twice', () => {
    const asked = plan.checkpoint.facesToShow[0];
    const blurry = observationOf(plan.expectedState, asked, 0.1);
    expect(verifyCheckpoint(plan, [blurry, ...shownFaces(plan)]).status).toBe('match');
    expect(verifyCheckpoint(plan, [...shownFaces(plan), blurry]).status).toBe('uncertain');
  });

  it('rejects an observation without nine stickers', () => {
    const asked = plan.checkpoint.facesToShow[0];
    expect(() => verifyCheckpoint(plan, [{ face: asked, stickers: [] }])).toThrow(/9 stickers/);
  });
});

describe('manual fallback', () => {
  it('confirmManually gives a manual match over the check-spec stickers', () => {
    const result = confirmManually(plan);
    expect(result.status).toBe('match');
    expect(result.manual).toBe(true);
    expect(result.confidence).toBe(1);
    expect(result.stickerResults.map(({ face, index }) => ({ face, index }))).toEqual(plan.checkpoint.stickers);
    for (const r of result.stickerResults) {
      expect(r.observed).toBe(plan.expectedState[r.face][r.index]);
      expect(r.outcome).toBe('match');
    }
  });

  it('applyTileEdits turns an unreadable face into one that can be checked', () => {
    const asked = plan.checkpoint.facesToShow[0];
    const rest = shownFaces(plan).filter((o) => o.face !== asked);
    const unreadable: FaceObservation = {
      face: asked,
      stickers: plan.expectedState[asked].map((color, i) =>
        i === 4 ? { color, confidence: 1 } : { color: 'white' as CubeColor, confidence: 0 }
      ),
    };
    expect(verifyCheckpoint(plan, [unreadable, ...rest]).status).toBe('uncertain');

    const edits = plan.expectedState[asked].map((color, index) => ({ index, color }));
    const edited = applyTileEdits(unreadable, edits);
    expect(edited).not.toBe(unreadable);
    expect(unreadable.stickers[0].confidence).toBe(0); // the input is left alone
    expect(edited.stickers.every((s) => s.confidence === 1 && s.edited)).toBe(true);
    expect(verifyCheckpoint(plan, [edited, ...rest]).status).toBe('match');

    // An edit to a wrong color is believed too: the student said so.
    const ref = plan.checkpoint.stickers.find((s) => s.face === asked && s.index !== 4)!;
    const wrong = applyTileEdits(edited, [
      { index: ref.index, color: other(plan.expectedState[asked][ref.index]) },
    ]);
    expect(verifyCheckpoint(plan, [wrong, ...rest]).status).toBe('mismatch');
  });

  it('applyTileEdits rejects a tile index off the face', () => {
    const observation = observationOf(plan.expectedState, 'U');
    expect(() => applyTileEdits(observation, [{ index: 9, color: 'red' }])).toThrow(/0 to 8/);
    expect(() => applyTileEdits(observation, [{ index: 1.5, color: 'red' }])).toThrow(/0 to 8/);
  });

  it('observeFace keeps color and confidence from classifier readings', () => {
    const readings = plan.expectedState.F.map((color) => ({ color, confidence: 0.7, distance: 1, runnerUp: 'red' }));
    expect(observeFace('F', readings)).toEqual(observationOf(plan.expectedState, 'F', 0.7));
    expect(() => observeFace('F', readings.slice(1))).toThrow(/9 stickers/);
  });
});
