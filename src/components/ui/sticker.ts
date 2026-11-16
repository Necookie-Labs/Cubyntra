import type { CubeColor } from '@/cube/types';
import { STICKER_LETTER_INK } from '@/lib/tokens';

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

/** Text color class for the letter on a sticker, chosen for 4.5:1 on that sticker. */
export function stickerLetterClass(color: CubeColor): string {
  return STICKER_LETTER_INK[color] === 'white' ? 'text-sticker-white' : 'text-sticker-core';
}
