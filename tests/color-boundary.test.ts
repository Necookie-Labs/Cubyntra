/**
 * Cubyntra - Red / Orange Hue Boundary
 *
 * The Kaggle dataset's mean orange sticker, RGB (201, 82, 58), has a hue of about 10 degrees and
 * used to be boosted as red. Orange must win there while real reds stay red.
 */

import { describe, it, expect } from 'vitest';
import { classifyColor, rgbToHsv, RED_ORANGE_HUE_SPLIT } from '../src/vision/color';
import profile from '../src/vision/ml/datasetColorProfile.json';
import type { RGBColor } from '../src/vision/types';

const rgb = (r: number, g: number, b: number): RGBColor => ({ r, g, b });
const fromProfile = (c: 'red' | 'orange'): RGBColor => {
  const [r, g, b] = profile[c].mean_rgb;
  return rgb(r, g, b);
};

describe('red / orange boundary', () => {
  it('classifies the dataset mean orange (201, 82, 58) as orange', () => {
    const result = classifyColor(rgb(201, 82, 58));
    expect(result.color).toBe('orange');
    expect(result.isCubeColor).toBe(true);
    expect(classifyColor(fromProfile('orange')).color).toBe('orange');
  });

  it('keeps reds red', () => {
    const reds = [rgb(190, 30, 40), rgb(200, 20, 30), rgb(170, 25, 35), rgb(200, 40, 40), rgb(220, 60, 40), fromProfile('red')];
    for (const c of reds) {
      const result = classifyColor(c);
      expect(result.color, JSON.stringify(c)).toBe('red');
      expect(result.isCubeColor, JSON.stringify(c)).toBe(true);
    }
  });

  it('keeps bright oranges orange', () => {
    for (const c of [rgb(230, 90, 30), rgb(255, 110, 0), rgb(240, 100, 60)]) {
      expect(classifyColor(c).color, JSON.stringify(c)).toBe('orange');
    }
  });

  it('splits between the dataset red and orange hues', () => {
    expect(rgbToHsv(fromProfile('red')).h).toBeLessThan(RED_ORANGE_HUE_SPLIT);
    expect(rgbToHsv(fromProfile('orange')).h).toBeGreaterThanOrEqual(RED_ORANGE_HUE_SPLIT);
  });
});
