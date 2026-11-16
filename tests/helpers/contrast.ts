/**
 * WCAG 2.x contrast from the voxel tokens in src/app/globals.css (ADR-011).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type TokenTheme = Readonly<Record<string, string>>;

/** The light tokens (`:root`) and the dark ones (light, overridden by `:root[data-theme="dark"]`). */
export function readThemeTokens(css = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'globals.css'), 'utf8')): {
  light: TokenTheme;
  dark: TokenTheme;
} {
  const block = css.split('/* tokens:start */')[1]?.split('/* tokens:end */')[0] ?? '';
  const [lightSrc, darkSrc = ''] = block.split(':root[data-theme="dark"]');
  const parse = (src: string) =>
    Object.fromEntries([...src.matchAll(/--vx-([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b(?![0-9a-fA-F])/g)].map((m) => [m[1], m[2]]));
  const light = parse(lightSrc);
  return { light, dark: { ...light, ...parse(darkSrc) } };
}

/** Relative luminance of a #RRGGBB color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio of two #RRGGBB colors, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
