/**
 * Cubyntra - Design Tokens for Code That Cannot Read CSS
 * Necookie Labs (c) 2026
 *
 * WebGL materials need real color values, not `var(--vx-*)`. This module mirrors the tokens the
 * 3D twin, the manifest and the icons use from the token block in src/app/globals.css (ADR-018).
 * tests/tokens.test.ts fails if the two ever disagree, so change a color there first and then here.
 */

import type { CubeColor } from '@/cube/types';

export type ThemeName = 'light' | 'dark';

/** Flat sticker colors (`--vx-sticker-*`), identical in both themes. */
export const STICKER_HEX: Readonly<Record<CubeColor, string>> = {
  white: '#F4F4EE',
  yellow: '#F2CF1D',
  red: '#C8352E',
  orange: '#F07A1A',
  blue: '#2F6CD0',
  green: '#24A64F',
};

/** Plastic between the stickers (`--vx-sticker-core`). */
export const STICKER_CORE_HEX = '#1B2E13';

/** The light neutral that spotlit-away pieces of the twin are washed toward (the light `--vx-ground`). */
export const FADE_WASH_HEX = '#F3F2FF';
/** How far a faded twin piece's colors move toward `FADE_WASH_HEX` (0 = unchanged, 1 = all wash). */
export const FADE_WASH = 0.7;

/**
 * Ink of the color-blind letter on each sticker: the core color on the light stickers, sticker
 * white on red and blue. Every pair reaches 4.5:1 (tests/a11y-contrast.test.ts).
 */
export const STICKER_LETTER_INK: Readonly<Record<CubeColor, 'core' | 'white'>> = {
  white: 'core',
  yellow: 'core',
  red: 'white',
  orange: 'core',
  blue: 'white',
  green: 'core',
};

/**
 * Theme-dependent tokens the twin draws guidance with. Arrows and the slot outline sit over
 * the page background, so they use the two tokens built to contrast with it in each theme.
 */
export interface TwinThemeTokens {
  /** `--vx-ink`: move arrows. */
  ink: string;
  /** `--vx-focus`: the target-slot outline. */
  focus: string;
}

export const TWIN_THEME_HEX: Readonly<Record<ThemeName, TwinThemeTokens>> = {
  light: { ink: '#1B1842', focus: '#1F5FCC' },
  dark: { ink: '#F4F3FF', focus: '#8FC1FF' },
};

/**
 * Colors the browser chrome uses outside CSS: the PWA manifest (splash screen, title bar),
 * the `theme-color` meta tag and the generated app icons. `ground` is `--vx-ground` (the top of
 * the page gradient) and `ink` is `--vx-ink` in each theme.
 */
export const APP_CHROME_HEX: Readonly<Record<ThemeName, { ground: string; ink: string }>> = {
  light: { ground: '#F3F2FF', ink: '#1B1842' },
  dark: { ground: '#120F2B', ink: '#F4F3FF' },
};

