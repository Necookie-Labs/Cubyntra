/**
 * Cubyntra - Color contrast of the voxel tokens, in both themes
 * Necookie Labs (c) 2026
 *
 * Computes WCAG contrast ratios straight from the token block of src/app/globals.css: every
 * text pair the components use must reach 4.5:1 (AA), and every non-text pair that identifies
 * a control or its focus 3:1 (WCAG 1.4.11). jsdom has no layout, so axe cannot check this.
 */

import { describe, expect, it } from 'vitest';
import { contrastRatio, readThemeTokens } from './helpers/contrast';

const { light, dark } = readThemeTokens();

/** [foreground, background] token names (without --vx-) for body text, labels and chips. */
const TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['ink', 'ground'],
  ['ink', 'panel'],
  ['ink', 'well'],
  ['ink', 'leaf-soft'],
  ['ink', 'warn-soft'],
  ['ink', 'danger-soft'],
  ['muted', 'ground'],
  ['muted', 'panel'],
  ['muted', 'well'],
  ['muted', 'leaf-soft'],
  ['muted', 'warn-soft'],
  ['muted', 'danger-soft'],
  ['on-leaf', 'leaf'], // primary buttons, armed timer pad
  ['on-leaf', 'warn'],
  ['on-danger', 'danger'],
  ['sticker-white', 'sticker-core'], // camera overlays
];

/**
 * Non-text pairs: control outlines (buttons, inputs, switches, radio cards) against the
 * surfaces they sit on, and the focus ring against every surface it is drawn over.
 */
const UI_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['line', 'ground'],
  ['line', 'panel'],
  ['line', 'well'],
  ['focus', 'ground'],
  ['focus', 'panel'],
  ['focus', 'well'],
  ['focus', 'leaf-soft'],
];

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s theme contrast', (_theme, tokens) => {
  it.each(TEXT_PAIRS)('%s text on %s reaches 4.5:1', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('%s against %s reaches 3:1', (fg, bg) => {
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe('contrast math', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });
});
