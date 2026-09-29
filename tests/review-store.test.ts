/**
 * Cubyntra - Photo Ingest & Review Store Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCubyntraStore } from '../src/stores/useCubyntraStore';
import { CubeState, Face } from '../src/cube/types';
import { FACES, createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import { analyzeFaceContext } from '../src/vision/faceImageAnalyzer';
import { StickerSample } from '../src/vision/types';
import { contextFor, renderFace } from './helpers/syntheticCube';

const truth: CubeState = applyMoves(createSolvedCubeState(), parseAlgorithm("F R U' R' U' R U R' F' R U R' U' R' F R F'"));

function samplesFor(face: Face): StickerSample[] {
  const image = renderFace(truth[face], { noise: 6, seed: face.charCodeAt(0) });
  return analyzeFaceContext(contextFor(image), image.width, image.height, face).samples;
}

const store = () => useCubyntraStore.getState();

describe('photo ingest and review', () => {
  beforeEach(() => {
    store().resetAll();
    store().startCompanionScan();
  });

  it('accepts faces in any order and only resolves once all six are in', () => {
    const order: Face[] = ['D', 'F', 'U', 'B', 'R', 'L'];
    order.slice(0, 5).forEach((face) => store().ingestFaceSamples(face, samplesFor(face)));

    expect(store().appState).toBe('scanning');
    expect(store().currentStepIndex).toBe(4); // L is the fifth step in SCAN_SEQUENCE and still missing

    store().ingestFaceSamples('L', samplesFor('L'));
    expect(store().appState).toBe('reviewing');
    expect(store().cubeState).toEqual(truth);
    expect(store().validationResult?.valid).toBe(true);
  });

  it('does not complete early when the same face arrives twice', () => {
    for (let i = 0; i < 6; i++) store().ingestFaceSamples('U', samplesFor('U'));
    expect(store().appState).toBe('scanning');
    expect(Object.keys(store().faceSamples)).toEqual(['U']);
  });

  it('paints provisional colors onto the twin while scanning', () => {
    store().ingestFaceSamples('F', samplesFor('F'));
    expect(store().cubeState.F).toEqual(truth.F);
  });

  it('lets the user correct a tile and revalidates immediately', () => {
    FACES.forEach((face) => store().ingestFaceSamples(face, samplesFor(face)));
    const wrong = truth.U[0] === 'red' ? 'orange' : 'red';

    store().setReviewSticker('U', 0, wrong);
    expect(store().cubeState.U[0]).toBe(wrong);
    expect(store().validationResult?.valid).toBe(false);

    store().setReviewSticker('U', 0, truth.U[0]);
    expect(store().validationResult?.valid).toBe(true);
  });

  it('keeps centers locked', () => {
    FACES.forEach((face) => store().ingestFaceSamples(face, samplesFor(face)));
    store().setReviewSticker('F', 4, 'blue');
    expect(store().cubeState.F[4]).toBe('green');
  });

  it('solves the confirmed cube and drops the local photo copies', async () => {
    FACES.forEach((face) => store().ingestFaceSamples(face, samplesFor(face), 'data:image/jpeg;base64,AA'));
    expect(Object.keys(store().faceImages)).toHaveLength(6);

    await store().confirmReview();

    expect(store().appState).toBe('solution_ready');
    expect(store().originalScrambleState).toEqual(truth);
    expect(store().faceImages).toEqual({});
    expect(applyMoves(truth, store().solution!.moves)).toEqual(createSolvedCubeState());
  }, 20_000);

  it('refuses to confirm an impossible cube', async () => {
    FACES.forEach((face) => store().ingestFaceSamples(face, samplesFor(face)));
    store().setReviewSticker('R', 0, truth.R[0] === 'white' ? 'yellow' : 'white');

    await store().confirmReview();
    expect(store().appState).toBe('reviewing');
    expect(store().solution).toBeNull();
  });

  it('rescanning a phone face stays on the phone', () => {
    FACES.forEach((face) => store().ingestFaceSamples(face, samplesFor(face)));
    store().rescanFace('R');

    expect(store().appState).toBe('scanning');
    expect(store().scanSource).toBe('companion');
    expect(store().faceSamples.R).toBeUndefined();
    expect(store().resolution).toBeNull();
  });
});
