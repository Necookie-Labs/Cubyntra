import { describe, expect, it } from 'vitest';
import { CubeColor, CubeState, Face } from '../src/cube/types';
import { COLORS, FACES } from '../src/cube/constants';
import { rotateFaceClockwise } from '../src/cube/transforms';
import { rgbToLab } from '../src/vision/color';
import {
  MIN_SPREAD,
  buildStudentPalette,
  classifyFace,
  classifyFaceWithPalette,
  classifyWithPalette,
  parsePalette,
  serializePalette,
} from '../src/vision/palette';
import { resolveCubeColors } from '../src/vision/resolveCubeColors';
import { scrambledState, seededRandom } from './helpers/scrambles';
import {
  FADED_PLASTICS,
  Lighting,
  PHOTOGRAPHED_RGB,
  renderCubeFace,
  sampleImage,
  scanSamples,
} from './helpers/syntheticCube';

const SCAN_LIGHT: Lighting = { noise: 6, seed: 11 };

function paletteFor(state: CubeState, plastics = PHOTOGRAPHED_RGB) {
  const samples = scanSamples(state, { lighting: SCAN_LIGHT, plastics });
  const resolved = resolveCubeColors(samples);
  expect(resolved.state).toEqual(state);
  return buildStudentPalette(samples, resolved);
}

/** A lighting different from the scan's: dimmer or brighter, warmer or cooler, noisy. */
function randomLighting(random: () => number, seed: number): Lighting {
  const gain = 0.72 + random() * 0.5;
  const warmth = (random() * 2 - 1) * 0.12;
  return { gain, tint: [1 + warmth, 1, 1 - warmth], noise: 4 + random() * 6, seed };
}

describe('student palette', () => {
  const state = scrambledState(71, 1);

  it('stores a mean and a spread for each color from the full scan', () => {
    const palette = paletteFor(state);
    for (const color of COLORS) {
      const entry = palette.colors[color];
      expect(entry.count).toBe(9);
      const reference = rgbToLab({
        r: PHOTOGRAPHED_RGB[color][0],
        g: PHOTOGRAPHED_RGB[color][1],
        b: PHOTOGRAPHED_RGB[color][2],
      });
      expect(Math.abs(entry.lab.l - reference.l)).toBeLessThan(2);
      expect(Math.abs(entry.lab.a - reference.a)).toBeLessThan(2);
      expect(Math.abs(entry.lab.b - reference.b)).toBeLessThan(2);
      expect(entry.spread.l).toBeGreaterThanOrEqual(MIN_SPREAD.l);
      expect(entry.spread.a).toBeGreaterThanOrEqual(MIN_SPREAD.a);
      expect(entry.spread.b).toBeGreaterThanOrEqual(MIN_SPREAD.b);
    }
  });

  it('follows the student cube, not the reference plastics', () => {
    const palette = paletteFor(state, FADED_PLASTICS);
    expect(Math.abs(palette.colors.orange.rgb.r - FADED_PLASTICS.orange[0])).toBeLessThan(4);
    expect(Math.abs(palette.colors.blue.rgb.b - FADED_PLASTICS.blue[2])).toBeLessThan(4);
  });

  it('turns the samples of a photo the resolver had to turn', () => {
    const samples = scanSamples(state, { lighting: SCAN_LIGHT });
    const turned = { ...samples, U: [6, 3, 0, 7, 4, 1, 8, 5, 2].map((i) => samples.U[i]) };
    // `turned.U` is the U photo taken a quarter turn clockwise off; the resolver turns it back.
    const stateAsShot = { ...state, U: rotateFaceClockwise(state.U) };
    const fixed = buildStudentPalette(turned, {
      state: { ...stateAsShot, U: rotateFaceClockwise(rotateFaceClockwise(rotateFaceClockwise(stateAsShot.U))) },
      rotatedFaces: { U: 3 },
    });
    expect(fixed).toEqual(buildStudentPalette(samples, { state }));
  });

  it('leaves a misassigned sticker out of the mean', () => {
    const samples = scanSamples(state, { lighting: SCAN_LIGHT });
    const clean = buildStudentPalette(samples, { state });
    // Call one non-white corner white: it is far from the white center, so it is dropped.
    const face = FACES.find((f) => state[f][0] !== 'white' && state[f][0] !== 'yellow')!;
    const wrong = { ...state, [face]: ['white', ...state[face].slice(1)] } as CubeState;
    const palette = buildStudentPalette(samples, { state: wrong });
    expect(palette.colors.white).toEqual(clean.colors.white);
  });

  it('rejects a scan with a missing center or a short face', () => {
    const samples = scanSamples(state, { lighting: SCAN_LIGHT });
    expect(() => buildStudentPalette({ ...samples, U: samples.U.slice(0, 8) }, { state })).toThrow(/9 samples/);
    const noWhite = { ...state, U: state.U.map((c, i) => (i === 4 ? 'red' : c)) } as CubeState;
    expect(() => buildStudentPalette(samples, { state: noWhite })).toThrow(/white center/);
  });

  it('survives a JSON round trip and rejects malformed input', () => {
    const palette = paletteFor(state);
    const text = serializePalette(palette);
    expect(parsePalette(text)).toEqual(palette);
    expect(parsePalette(JSON.parse(text))).toEqual(palette);

    expect(parsePalette('not json')).toBeNull();
    expect(parsePalette(null)).toBeNull();
    expect(parsePalette({ ...palette, version: 2 })).toBeNull();
    const { red: _red, ...missing } = palette.colors;
    void _red;
    expect(parsePalette({ version: 1, colors: missing })).toBeNull();
    expect(
      parsePalette({ version: 1, colors: { ...palette.colors, red: { ...palette.colors.red, spread: { l: 0, a: 1, b: 1 } } } })
    ).toBeNull();
    expect(
      parsePalette({ version: 1, colors: { ...palette.colors, red: { ...palette.colors.red, lab: { l: 'x', a: 1, b: 1 } } } })
    ).toBeNull();
  });
});

describe('classifying a partial face with the palette', () => {
  const state = scrambledState(71, 2);

  it('reads every sticker of faces lit differently from the scan, with confidence', () => {
    const random = seededRandom(404);
    for (const plastics of [PHOTOGRAPHED_RGB, FADED_PLASTICS]) {
      const palette = paletteFor(state, plastics);
      let total = 0;
      let wrong = 0;
      let unsure = 0;
      for (let n = 0; n < 40; n++) {
        const cube = scrambledState(72, n);
        const face = FACES[n % 6];
        const image = renderCubeFace(cube, face, { lighting: randomLighting(random, 1000 + n), plastics });
        const readings = classifyFaceWithPalette(
          sampleImage(image).map((s) => s.rgb),
          palette
        );
        readings.forEach((reading, i) => {
          total++;
          if (reading.color !== cube[face][i]) wrong++;
          else if (reading.confidence < 0.5) unsure++;
        });
      }
      expect(total).toBe(360);
      expect(wrong).toBe(0);
      expect(unsure).toBe(0);
    }
  });

  it('reads a one-color face, where the center is the only evidence', () => {
    const palette = paletteFor(state);
    const solved = Object.fromEntries(
      FACES.map((f, i) => [f, Array(9).fill(COLORS[i])])
    ) as unknown as CubeState;
    // Dim and warm light pushes yellow towards orange and white towards yellow; a correction
    // that changed the color of the light that much must lose to one that only brightens.
    const lightings: Lighting[] = [
      { gain: 0.8, tint: [1.08, 1, 0.9], noise: 5 },
      { gain: 0.76, tint: [1.07, 1, 0.93], noise: 8 },
      { gain: 0.7, tint: [1.12, 1, 0.88], noise: 6 },
      { gain: 1.05, tint: [0.9, 1, 1.1], noise: 6 },
    ];
    for (const lighting of lightings) {
      for (const face of FACES) {
        const image = renderCubeFace(solved, face, { lighting });
        const readings = classifyFaceWithPalette(
          sampleImage(image).map((s) => s.rgb),
          palette
        );
        for (const reading of readings) {
          expect(reading.color, `${face} gain ${lighting.gain}`).toBe(solved[face][4]);
          expect(reading.confidence).toBeGreaterThanOrEqual(0.5);
        }
      }
    }
  });

  it('keeps a skipped tile out of the lighting correction', () => {
    const palette = paletteFor(state);
    const face: Face = 'U';
    const rgbs = sampleImage(renderCubeFace(state, face, { lighting: { gain: 0.8, noise: 5 } })).map((s) => s.rgb);
    const clean = classifyFaceWithPalette(rgbs, palette);
    // One tile blown out to white: skipped, the other eight read as before (the fit now rests
    // on seven tiles instead of eight, so distances move by a fraction).
    const blown = rgbs.map((rgb, i) => (i === 2 ? { r: 255, g: 255, b: 255 } : rgb));
    const skip = rgbs.map((_, i) => i === 2);
    const readings = classifyFaceWithPalette(blown, palette, skip);
    readings.forEach((reading, i) => {
      if (i === 2) return;
      expect(reading.color).toBe(clean[i].color);
      expect(reading.confidence).toBeGreaterThanOrEqual(0.5);
      expect(Math.abs(reading.distance - clean[i].distance)).toBeLessThan(0.5);
    });
  });

  it('gives a color halfway between two palette colors a low confidence', () => {
    const palette = paletteFor(state);
    const mid = (a: CubeColor, b: CubeColor) => ({
      r: (PHOTOGRAPHED_RGB[a][0] + PHOTOGRAPHED_RGB[b][0]) / 2,
      g: (PHOTOGRAPHED_RGB[a][1] + PHOTOGRAPHED_RGB[b][1]) / 2,
      b: (PHOTOGRAPHED_RGB[a][2] + PHOTOGRAPHED_RGB[b][2]) / 2,
    });
    expect(classifyWithPalette(mid('red', 'orange'), palette).confidence).toBeLessThan(0.5);
    expect(classifyWithPalette(mid('white', 'yellow'), palette).confidence).toBeLessThan(0.5);
    // Something that is no cube color at all (a grey table) fits nothing.
    expect(classifyWithPalette({ r: 96, g: 92, b: 90 }, palette).confidence).toBeLessThan(0.5);
  });

  it('falls back to the static classifier when no palette is stored', () => {
    const face: Face = 'F';
    const rgbs = sampleImage(renderCubeFace(state, face, { lighting: { noise: 4 } })).map((s) => s.rgb);
    for (const palette of [undefined, null]) {
      const readings = classifyFace(rgbs, palette);
      expect(readings.map((r) => r.color)).toEqual(state[face]);
      for (const reading of readings) {
        expect(reading.confidence).toBeGreaterThan(0);
        expect(reading.runnerUp).not.toBe(reading.color);
      }
    }
    // A non-cube color is rejected by the static classifier: confidence 0.
    expect(classifyFace(Array(9).fill({ r: 96, g: 92, b: 90 }))[0].confidence).toBe(0);
  });

  it('refuses a face that does not have nine tiles', () => {
    expect(() => classifyFaceWithPalette([], paletteFor(state))).toThrow(/9 tiles/);
  });
});
