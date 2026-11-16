/**
 * Cubyntra - Design Tokens for Code That Cannot Read CSS
 * Necookie Labs (c) 2026
 *
 * WebGL materials need real color values, not `var(--vx-*)`. This module mirrors the tokens the
 * 3D twin uses from the token block in src/app/globals.css (ADR-011). tests/tokens.test.ts fails
 * if the two ever disagree, so change a color there first and then here.
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
  green: '#1F9A4A',
};

/** Plastic between the stickers (`--vx-sticker-core`). */
export const STICKER_CORE_HEX = '#1B2E13';

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
  light: { ink: '#2E4A22', focus: '#1D5FB8' },
  dark: { ink: '#E4EFD8', focus: '#8CC4FF' },
};
