'use client';

/**
 * Cubyntra - Mini Cube Orientation Guide
 * Necookie Labs (c) 2026
 *
 * An isometric cube showing how to hold the real one for the current photo: which center
 * faces the camera, which is on top and which is on the right.
 */

import React from 'react';
import { stickerColor } from '@/components/ui';
import { CubeColor } from '@/cube/types';

type Point = [number, number];

// Isometric corners in a 100x100 box: a top rhombus over two side faces.
const TOP: [Point, Point, Point, Point] = [[50, 8], [88, 27], [50, 46], [12, 27]];
const FRONT: [Point, Point, Point, Point] = [[12, 27], [50, 46], [50, 92], [12, 73]];
const RIGHT: [Point, Point, Point, Point] = [[50, 46], [88, 27], [88, 73], [50, 92]];

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Point at (u, v) across a parallelogram given as [origin, uEnd, far, vEnd]. */
function at(face: typeof TOP, u: number, v: number): Point {
  return lerp(lerp(face[0], face[1], u), lerp(face[3], face[2], u), v);
}

/** Nine inset tiles of one face, as SVG polygon point strings. */
function tiles(face: typeof TOP): string[] {
  const inset = 0.06;
  const out: string[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const u0 = col / 3 + inset / 3;
      const u1 = (col + 1) / 3 - inset / 3;
      const v0 = row / 3 + inset / 3;
      const v1 = (row + 1) / 3 - inset / 3;
      out.push([at(face, u0, v0), at(face, u1, v0), at(face, u1, v1), at(face, u0, v1)].map((p) => p.join(',')).join(' '));
    }
  }
  return out;
}

const CORE = 'var(--vx-sticker-core)';

const TOP_TILES = tiles(TOP);
const FRONT_TILES = tiles(FRONT);
const RIGHT_TILES = tiles(RIGHT);

interface FaceGuideProps {
  front: CubeColor;
  top: CubeColor;
  right: CubeColor;
  className?: string;
}

export const FaceGuide: React.FC<FaceGuideProps> = ({ front, top, right, className = '' }) => {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Hold the cube with ${front} facing the camera, ${top} on top and ${right} on the right`}
      className={className}
    >
      {/* Flat block body; colors come from the sticker tokens, so no hex lives here. */}
      <polygon points={TOP.map((p) => p.join(',')).join(' ')} style={{ fill: CORE }} />
      <polygon points={FRONT.map((p) => p.join(',')).join(' ')} style={{ fill: CORE }} />
      <polygon points={RIGHT.map((p) => p.join(',')).join(' ')} style={{ fill: CORE }} />

      {/* Side faces are flat darker tones so the face toward the camera reads first. */}
      {TOP_TILES.map((pts, i) => (
        <polygon key={`t${i}`} points={pts} style={{ fill: stickerColor(top) }} opacity={0.7} />
      ))}
      {RIGHT_TILES.map((pts, i) => (
        <polygon key={`r${i}`} points={pts} style={{ fill: stickerColor(right) }} opacity={0.5} />
      ))}
      {FRONT_TILES.map((pts, i) => (
        <polygon key={`f${i}`} points={pts} style={{ fill: stickerColor(front) }} />
      ))}

      {/* Camera lens pointing at the front face: a square pixel block */}
      <g transform="translate(0 82)">
        <rect width="10" height="10" style={{ fill: 'var(--vx-leaf)', stroke: CORE }} strokeWidth="1.5" />
        <rect x="3" y="3" width="4" height="4" style={{ fill: CORE }} />
      </g>
    </svg>
  );
};
