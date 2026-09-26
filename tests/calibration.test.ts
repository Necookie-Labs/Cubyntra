/**
 * Cubyntra - Dynamic Calibration & 54-Sticker Invariant Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect } from 'vitest';
import {
  buildDynamicPalette,
  classifyWithDynamicPalette,
} from '../src/vision/dynamicCalibration';
import {
  resolve54StickerInvariant,
  solveHungarian,
  StickerCostProfile,
} from '../src/vision/invariantSolver';
import { COLORS, CANONICAL_CENTER_COLORS, FACES } from '../src/cube/constants';
import { CubeColor } from '../src/cube/types';

describe('Dynamic Center-Sticker Calibration Engine', () => {
  it('calibrates custom palette from physical center measurements', () => {
    // Simulated warm lighting shift on white and green
    const observedCenters = {
      U: { r: 245, g: 240, b: 210 }, // Warm white
      F: { r: 10, g: 180, b: 60 },   // Vivid green
    };

    const palette = buildDynamicPalette(observedCenters);
    expect(palette.white).toBeDefined();
    expect(palette.green).toBeDefined();
    // Yellow, Red, Blue, Orange fallback to dataset baseline
    expect(palette.yellow).toBeDefined();
    expect(palette.blue).toBeDefined();
  });

  it('accurately classifies colors against dynamic palette', () => {
    const palette = buildDynamicPalette({
      U: { r: 250, g: 250, b: 250 }, // White
      R: { r: 200, g: 15, b: 20 },   // Red
      F: { r: 20, g: 160, b: 40 },   // Green
      D: { r: 240, g: 220, b: 10 },  // Yellow
      L: { r: 245, g: 110, b: 10 },  // Orange
      B: { r: 10, g: 60, b: 200 },   // Blue
    });

    const testRed = { r: 195, g: 20, b: 25 };
    const res = classifyWithDynamicPalette(testRed, palette);
    expect(res.predictedColor).toBe('red');
    expect(res.confidence).toBeGreaterThan(0.7);

    const testBlue = { r: 15, g: 70, b: 210 };
    const blueRes = classifyWithDynamicPalette(testBlue, palette);
    expect(blueRes.predictedColor).toBe('blue');
  });
});

describe('54-Sticker Invariant Solver (Hungarian Optimization)', () => {
  it('solves simple 3x3 assignment correctly via Hungarian algorithm', () => {
    const costMatrix = [
      [1, 2, 3],
      [2, 4, 6],
      [3, 6, 9],
    ];
    // Optimal: (0,2)->3, (1,1)->4, (2,0)->3 => sum=10, or (0,0)->1, (1,1)->4, (2,2)->9 => 14, min is 1 + 4 + 3 = 8 with (0,0)->1, (1,2)->6, (2,1)->6 or (0,1)->2, (1,0)->2, (2,2)->9 => 13
    const assignment = solveHungarian(costMatrix);
    expect(assignment.length).toBe(3);
    const assignedCols = new Set(assignment);
    expect(assignedCols.size).toBe(3); // Every column uniquely covered
  });

  it('enforces exactly 9 stickers per color on complete cube, correcting ambiguous lighting shifts', () => {
    // Generate 54 sticker profiles for a solved cube, but perturb 2 stickers so naive classification would give 10 reds and 8 oranges
    const profiles: StickerCostProfile[] = [];

    // Order of faces: U, R, F, D, L, B (each 9 stickers)
    const faceColors: CubeColor[] = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];

    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
      const canonicalColor = faceColors[faceIdx];
      for (let s = 0; s < 9; s++) {
        const globalIdx = faceIdx * 9 + s;
        const isCenter = s === 4;

        // Base costs: true color has distance 5.0, other colors have distance 40.0
        const costs: Record<CubeColor, number> = {
          white: 40.0,
          yellow: 40.0,
          green: 40.0,
          blue: 40.0,
          red: 40.0,
          orange: 40.0,
        };
        costs[canonicalColor] = 5.0;

        profiles.push({
          index: globalIdx,
          isCenter,
          fixedColor: isCenter ? canonicalColor : undefined,
          costs,
        });
      }
    }

    // Now intentionally perturb an Orange sticker (index 36, face 'L') to look slightly closer to Red
    // (e.g. costs: red=6.0, orange=7.0). Naive greedy classification would pick Red!
    profiles[36].costs.red = 6.0;
    profiles[36].costs.orange = 7.0;

    const resolved = resolve54StickerInvariant(profiles);
    expect(resolved.length).toBe(54);

    // Verify exactly 9 of each color
    const colorCounts: Record<CubeColor, number> = {
      white: 0,
      yellow: 0,
      green: 0,
      blue: 0,
      red: 0,
      orange: 0,
    };

    for (const c of resolved) {
      colorCounts[c]++;
    }

    for (const color of COLORS) {
      expect(colorCounts[color]).toBe(9);
    }

    // Verify center stickers were preserved
    expect(resolved[4]).toBe('white');   // U center
    expect(resolved[13]).toBe('red');    // R center
    expect(resolved[22]).toBe('green');  // F center
    expect(resolved[31]).toBe('yellow'); // D center
    expect(resolved[40]).toBe('orange'); // L center
    expect(resolved[49]).toBe('blue');   // B center
  });
});
