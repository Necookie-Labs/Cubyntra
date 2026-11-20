/**
 * Cubyntra - Color contrast of the design tokens, in both themes
 * Necookie Labs (c) 2026
 *
 * Computes WCAG contrast ratios straight from the token block of src/app/globals.css: every
 * text pair the components use must reach 4.5:1 (AA), and every non-text pair that identifies
 * a control or its focus 3:1 (WCAG 1.4.11). jsdom has no layout, so axe cannot check this.
 * Text sits on the page gradient anywhere from its top (`ground`) to its bottom (`ground-deep`),
 * so both ends are checked.
 */

import { describe, expect, it } from 'vitest';
import { STICKER_LETTER_INK } from '@/lib/tokens';
import { contrastRatio, readThemeTokens } from './helpers/contrast';

const { light, dark } = readThemeTokens();

/** [foreground, background] token names (without --vx-) for body text, labels and chips. */
const SURFACES = ['ground', 'ground-deep', 'panel', 'well', 'raised'] as const;
const TINTS = ['primary-soft', 'success-soft', 'warn-soft', 'danger-soft'] as const;

const TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ...[...SURFACES, ...TINTS].flatMap((bg) => [['ink', bg] as const, ['muted', bg] as const]),
  ['on-primary', 'primary'], // primary buttons, the current move, the active tab
  ['on-success', 'success'], // done marks, the armed timer pad
  ['on-accent', 'accent'], // the teal brand pill
  ['on-warn', 'warn'],
  ['on-danger', 'danger'],
  ['sticker-white', 'sticker-core'], // camera overlays
  // Color-blind letters, in the ink chosen for each sticker (twin, grids, mini-cube, review).
  ...Object.entries(STICKER_LETTER_INK).map(([color, ink]) => [`sticker-${ink}`, `sticker-${color}`] as const),
];

/**
 * Non-text pairs: control outlines (buttons, inputs, switches, radio cards) against the
 * surfaces they sit on, and the focus ring against every surface it is drawn over.
 */
const UI_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ...SURFACES.map((bg) => ['line', bg] as const),
  ...SURFACES.map((bg) => ['focus', bg] as const),
  ['focus', 'primary-soft'],
];

/**
 * Pairs that only occur in the dark theme: the phone companion is always dark, and its small
 * labels are teal accent text on the night ground and its cards.
 */
const DARK_TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['accent', 'ground'],
  ['accent', 'panel'],
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

describe('dark-only contrast (the always-dark phone companion)', () => {
  it.each(DARK_TEXT_PAIRS)('%s text on %s reaches 4.5:1', (fg, bg) => {
    expect(contrastRatio(dark[fg], dark[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrast math', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });
});
