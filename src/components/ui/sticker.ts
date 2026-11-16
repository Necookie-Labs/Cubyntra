import type { CubeColor } from '@/cube/types';

/** CSS color for a cube sticker in the UI: the flat sticker token from globals.css. */
export function stickerColor(color: CubeColor): string {
  return `var(--vx-sticker-${color})`;
}
