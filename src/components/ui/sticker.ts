import type { CubeColor } from '@/cube/types';

/** CSS color for a cube sticker in the UI: the flat sticker token from globals.css. */
export function stickerColor(color: CubeColor): string {
  return `var(--vx-sticker-${color})`;
}

const LETTER: Record<CubeColor, string> = {
  white: 'W',
  yellow: 'Y',
  red: 'R',
  orange: 'O',
  blue: 'B',
  green: 'G',
};

/** The color-blind letter for a sticker (the same letters as the 3D twin). */
export function stickerLetter(color: CubeColor): string {
  return LETTER[color];
}
