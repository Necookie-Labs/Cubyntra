/**
 * Cubyntra - Voxel world
 * Necookie Labs (c) 2026
 *
 * A small isometric island drawn in SVG with flat faces only: one ground tile per stage, a full
 * block on every stage mastered and a low slab on stages started. Each face is a token color
 * (light top, mid left, dark right), outlined in the line color, so it reads in both themes.
 * The picture is decoration; the stage list next to it carries the same facts for screen
 * readers.
 */

import React from 'react';
import type { StageStatus } from '@/learn/mastery';

export type Biome = 'meadow' | 'sand';

export interface WorldStage {
  id: string;
  name: string;
  status: StageStatus;
}

interface Faces {
  top: string;
  left: string;
  right: string;
}

const BIOMES: Record<Biome, { ground: Faces; block: Faces; slab: Faces }> = {
  meadow: {
    ground: { top: 'var(--vx-success-soft)', left: 'var(--vx-raised-edge)', right: 'var(--vx-line)' },
    block: { top: 'var(--vx-success-soft)', left: 'var(--vx-success)', right: 'var(--vx-success-edge)' },
    slab: { top: 'var(--vx-panel)', left: 'var(--vx-line-soft)', right: 'var(--vx-muted)' },
  },
  sand: {
    ground: { top: 'var(--vx-warn-soft)', left: 'var(--vx-raised-edge)', right: 'var(--vx-line)' },
    block: { top: 'var(--vx-warn-soft)', left: 'var(--vx-warn)', right: 'var(--vx-warn-edge)' },
    slab: { top: 'var(--vx-well)', left: 'var(--vx-line-soft)', right: 'var(--vx-muted)' },
  },
};

/** Tile size on screen: 2:1 isometric. */
const TW = 48;
const TH = 24;
/** Screen height of one block. */
const BH = 26;
const GROUND = 0.5;
const SLAB = 0.3;
const COLS = 4;

/** Screen point of grid corner (x, y) at height z (in blocks). */
function pt(x: number, y: number, z: number): [number, number] {
  return [((x - y) * TW) / 2, ((x + y) * TH) / 2 - z * BH];
}

const poly = (points: [number, number][]) => points.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');

/** A box from (x, y) to (x + w, y + d), from height z0 to z1: its three visible faces. */
function Box({ x, y, w, d, z0, z1, faces }: { x: number; y: number; w: number; d: number; z0: number; z1: number; faces: Faces }) {
  const stroke = { stroke: 'var(--vx-line)', strokeWidth: 1.5, strokeLinejoin: 'round' as const };
  return (
    <g>
      <polygon
        points={poly([pt(x, y + d, z1), pt(x + w, y + d, z1), pt(x + w, y + d, z0), pt(x, y + d, z0)])}
        fill={faces.left}
        {...stroke}
      />
      <polygon
        points={poly([pt(x + w, y, z1), pt(x + w, y + d, z1), pt(x + w, y + d, z0), pt(x + w, y, z0)])}
        fill={faces.right}
        {...stroke}
      />
      <polygon
        points={poly([pt(x, y, z1), pt(x + w, y, z1), pt(x + w, y + d, z1), pt(x, y + d, z1)])}
        fill={faces.top}
        {...stroke}
      />
    </g>
  );
}

export function VoxelWorld({ stages, biome, label }: { stages: readonly WorldStage[]; biome: Biome; label: string }) {
  const colors = BIOMES[biome];
  const rows = Math.max(1, Math.ceil(stages.length / COLS));
  const cols = Math.min(COLS, Math.max(1, stages.length));

  // The island's outline: left corner (0, rows), right corner (cols, 0), bottom (cols, rows).
  const left = pt(0, rows, 0)[0];
  const right = pt(cols, 0, 0)[0];
  const top = pt(0, 0, GROUND + 1)[1];
  const bottom = pt(cols, rows, 0)[1];
  const pad = 4;
  const viewBox = `${left - pad} ${top - pad} ${right - left + pad * 2} ${bottom - top + pad * 2}`;

  // Painter's order: the back of the island first.
  const placed = stages
    .map((stage, i) => ({ stage, x: i % COLS, y: Math.floor(i / COLS) }))
    .sort((a, b) => a.x + a.y - (b.x + b.y));

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={viewBox}
      className="block h-auto w-full max-w-md"
      data-biome={biome}
    >
      <Box x={0} y={0} w={cols} d={rows} z0={0} z1={GROUND} faces={colors.ground} />
      {/* Grid lines on the ground, one tile per stage. */}
      {stages.map((stage, i) => {
        const x = i % COLS;
        const y = Math.floor(i / COLS);
        return (
          <polygon
            key={`tile-${stage.id}`}
            points={poly([pt(x, y, GROUND), pt(x + 1, y, GROUND), pt(x + 1, y + 1, GROUND), pt(x, y + 1, GROUND)])}
            fill="none"
            stroke="var(--vx-line-soft)"
            strokeWidth={1}
          />
        );
      })}
      {placed.map(({ stage, x, y }) =>
        stage.status === 'mastered' ? (
          <g key={stage.id} data-stage={stage.id} data-status="mastered" className="vx-place">
            <Box x={x + 0.08} y={y + 0.08} w={0.84} d={0.84} z0={GROUND} z1={GROUND + 1} faces={colors.block} />
          </g>
        ) : stage.status === 'started' ? (
          <g key={stage.id} data-stage={stage.id} data-status="started">
            <Box x={x + 0.2} y={y + 0.2} w={0.6} d={0.6} z0={GROUND} z1={GROUND + SLAB} faces={colors.slab} />
          </g>
        ) : (
          <g key={stage.id} data-stage={stage.id} data-status="new" />
        )
      )}
    </svg>
  );
}
