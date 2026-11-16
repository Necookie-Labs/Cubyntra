/**
 * Cubyntra - 3x3 Logo Glyph
 * Necookie Labs (c) 2026
 *
 * A flat 3x3 face of sticker blocks on dark plastic. Sticker tokens are the same in both
 * themes, so the logo never changes with the theme.
 */

import React from 'react';
import { CubeColor } from '@/cube/types';
import { stickerColor } from '@/components/ui';

const TILES: CubeColor[] = ['red', 'blue', 'yellow', 'green', 'white', 'orange', 'blue', 'green', 'red'];

export const CubeGlyph: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <div aria-hidden className={`${className} grid grid-cols-3 gap-0.5 p-0.5 bg-sticker-core border-2 border-line`}>
    {TILES.map((color, i) => (
      <div key={i} style={{ backgroundColor: stickerColor(color) }} />
    ))}
  </div>
);
