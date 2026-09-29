/**
 * Cubyntra - 3x3 Logo Glyph
 * Necookie Labs (c) 2026
 *
 * Uses fixed cube colors rather than theme classes, so the logo looks the same in light and
 * dark themes.
 */

import React from 'react';
import { COLOR_HEX } from '@/cube/constants';
import { CubeColor } from '@/cube/types';

const TILES: CubeColor[] = ['red', 'blue', 'yellow', 'green', 'white', 'orange', 'blue', 'green', 'red'];

export const CubeGlyph: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <div
    aria-hidden
    className={`${className} rounded-lg p-1 grid grid-cols-3 gap-0.5 shadow-inner`}
    style={{ backgroundColor: '#15161b', border: '1px solid #33363d' }}
  >
    {TILES.map((color, i) => (
      <div key={i} className="rounded-[1px]" style={{ backgroundColor: COLOR_HEX[color] }} />
    ))}
  </div>
);
