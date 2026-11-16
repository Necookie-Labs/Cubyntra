/**
 * Cubyntra - Piece Queries
 * Necookie Labs (c) 2026
 *
 * Finds edges and corners by their colors and checks whether pieces, the cross, F2L slots and
 * layers are solved. "Solved" always means relative to the centers, so the answers hold in any
 * orientation the cube is held in.
 */

import { CubeColor, CubeState } from './types';
import { COLORS, FACES, OPPOSITE_COLORS } from './constants';
import { StickerRef } from './geometry';

export type CornerSlot = 'UBL' | 'UBR' | 'UFL' | 'UFR' | 'DFL' | 'DFR' | 'DBL' | 'DBR';
export type EdgeSlot = 'UB' | 'UL' | 'UR' | 'UF' | 'FL' | 'FR' | 'BL' | 'BR' | 'DF' | 'DL' | 'DR' | 'DB';

export interface CornerSlotDefinition {
  name: CornerSlot;
  /** U/D sticker first, then the other two counter-clockwise around the corner. */
  stickers: readonly [StickerRef, StickerRef, StickerRef];
}

export interface EdgeSlotDefinition {
  name: EdgeSlot;
  /** U/D sticker first (F/B for middle-layer edges). */
  stickers: readonly [StickerRef, StickerRef];
}

export const CORNER_SLOTS: readonly CornerSlotDefinition[] = [
  { name: 'UBL', stickers: [{ face: 'U', index: 0 }, { face: 'B', index: 2 }, { face: 'L', index: 0 }] },
  { name: 'UBR', stickers: [{ face: 'U', index: 2 }, { face: 'R', index: 2 }, { face: 'B', index: 0 }] },
  { name: 'UFL', stickers: [{ face: 'U', index: 6 }, { face: 'L', index: 2 }, { face: 'F', index: 0 }] },
  { name: 'UFR', stickers: [{ face: 'U', index: 8 }, { face: 'F', index: 2 }, { face: 'R', index: 0 }] },
  { name: 'DFL', stickers: [{ face: 'D', index: 0 }, { face: 'F', index: 6 }, { face: 'L', index: 8 }] },
  { name: 'DFR', stickers: [{ face: 'D', index: 2 }, { face: 'R', index: 6 }, { face: 'F', index: 8 }] },
  { name: 'DBL', stickers: [{ face: 'D', index: 6 }, { face: 'L', index: 6 }, { face: 'B', index: 8 }] },
  { name: 'DBR', stickers: [{ face: 'D', index: 8 }, { face: 'B', index: 6 }, { face: 'R', index: 8 }] },
];

export const EDGE_SLOTS: readonly EdgeSlotDefinition[] = [
  { name: 'UB', stickers: [{ face: 'U', index: 1 }, { face: 'B', index: 1 }] },
  { name: 'UL', stickers: [{ face: 'U', index: 3 }, { face: 'L', index: 1 }] },
  { name: 'UR', stickers: [{ face: 'U', index: 5 }, { face: 'R', index: 1 }] },
  { name: 'UF', stickers: [{ face: 'U', index: 7 }, { face: 'F', index: 1 }] },
  { name: 'FL', stickers: [{ face: 'F', index: 3 }, { face: 'L', index: 5 }] },
  { name: 'FR', stickers: [{ face: 'F', index: 5 }, { face: 'R', index: 3 }] },
  { name: 'BL', stickers: [{ face: 'B', index: 5 }, { face: 'L', index: 3 }] },
  { name: 'BR', stickers: [{ face: 'B', index: 3 }, { face: 'R', index: 5 }] },
  { name: 'DF', stickers: [{ face: 'D', index: 1 }, { face: 'F', index: 7 }] },
  { name: 'DL', stickers: [{ face: 'D', index: 3 }, { face: 'L', index: 7 }] },
  { name: 'DR', stickers: [{ face: 'D', index: 5 }, { face: 'R', index: 7 }] },
  { name: 'DB', stickers: [{ face: 'D', index: 7 }, { face: 'B', index: 7 }] },
];

export interface EdgeLocation {
  slot: EdgeSlot;
  /** Where each requested color sits: `stickers[i]` shows `colors[i]`. */
  stickers: [StickerRef, StickerRef];
  /** Which of the slot's stickers (0 = U/D or F/B) shows the first requested color. */
  orientation: 0 | 1;
}

export interface CornerLocation {
  slot: CornerSlot;
  /** Where each requested color sits: `stickers[i]` shows `colors[i]`. */
  stickers: [StickerRef, StickerRef, StickerRef];
  /** Which of the slot's stickers (0 = U/D) shows the first requested color. */
  orientation: 0 | 1 | 2;
}

function colorAt(state: CubeState, ref: StickerRef): CubeColor {
  return state[ref.face][ref.index];
}

function locate(
  state: CubeState,
  slots: readonly { name: string; stickers: readonly StickerRef[] }[],
  colors: readonly CubeColor[]
): { name: string; stickers: StickerRef[]; orientation: number } {
  for (const slot of slots) {
    const shown = slot.stickers.map((s) => colorAt(state, s));
    const positions = colors.map((c) => shown.indexOf(c));
    if (positions.every((p) => p >= 0) && new Set(positions).size === colors.length) {
      return { name: slot.name, stickers: positions.map((p) => slot.stickers[p]), orientation: positions[0] };
    }
  }
  throw new Error(`No piece with colors ${colors.join('/')} on this cube`);
}

/** Finds the edge with the two given colors. Throws if the cube has no such edge. */
export function findEdge(state: CubeState, colors: readonly [CubeColor, CubeColor]): EdgeLocation {
  const found = locate(state, EDGE_SLOTS, colors);
  return {
    slot: found.name as EdgeSlot,
    stickers: found.stickers as [StickerRef, StickerRef],
    orientation: found.orientation as 0 | 1,
  };
}

/** Finds the corner with the three given colors (any order). Throws if there is none. */
export function findCorner(
  state: CubeState,
  colors: readonly [CubeColor, CubeColor, CubeColor]
): CornerLocation {
  const found = locate(state, CORNER_SLOTS, colors);
  return {
    slot: found.name as CornerSlot,
    stickers: found.stickers as [StickerRef, StickerRef, StickerRef],
    orientation: found.orientation as 0 | 1 | 2,
  };
}

/**
 * True when every sticker of the piece with these colors (1 = center, 2 = edge, 3 = corner)
 * sits on the face whose center has the same color.
 */
export function isPieceSolved(state: CubeState, colors: readonly CubeColor[]): boolean {
  if (colors.length === 1) return FACES.some((f) => state[f][4] === colors[0]);
  const refs =
    colors.length === 2
      ? findEdge(state, colors as [CubeColor, CubeColor]).stickers
      : colors.length === 3
        ? findCorner(state, colors as [CubeColor, CubeColor, CubeColor]).stickers
        : null;
  if (!refs) throw new Error(`A piece has 1 to 3 colors, got ${colors.length}`);
  return refs.every((ref, i) => state[ref.face][4] === colors[i]);
}

/** The four colors next to `color` (everything except it and its opposite). */
export function sideColors(color: CubeColor): CubeColor[] {
  return COLORS.filter((c) => c !== color && c !== OPPOSITE_COLORS[color]);
}

/** True when the four edges of `color` (the cross) are solved. */
export function isCrossSolved(state: CubeState, color: CubeColor): boolean {
  return sideColors(color).every((side) => isPieceSolved(state, [color, side]));
}

/** An F2L slot, named by the two side colors it sits between, e.g. ['green', 'red']. */
export type F2LSlot = readonly [CubeColor, CubeColor];

/** The four F2L slots around a cross color. */
export function f2lSlots(crossColor: CubeColor): F2LSlot[] {
  const sides = sideColors(crossColor);
  const slots: F2LSlot[] = [];
  for (let i = 0; i < sides.length; i++) {
    for (let j = i + 1; j < sides.length; j++) {
      if (OPPOSITE_COLORS[sides[i]] !== sides[j]) slots.push([sides[i], sides[j]]);
    }
  }
  return slots;
}

/** True when the corner and edge of one F2L slot are both solved. */
export function isF2LSlotSolved(state: CubeState, crossColor: CubeColor, slot: F2LSlot): boolean {
  const [a, b] = slot;
  const sides = sideColors(crossColor);
  if (!sides.includes(a) || !sides.includes(b) || a === b || OPPOSITE_COLORS[a] === b) {
    throw new Error(`${a}/${b} is not an F2L slot around ${crossColor}`);
  }
  return isPieceSolved(state, [crossColor, a, b]) && isPieceSolved(state, [a, b]);
}

/** True when the whole layer of `color` (its center, 4 edges and 4 corners) is solved. */
export function isLayerSolved(state: CubeState, color: CubeColor): boolean {
  return isCrossSolved(state, color) && f2lSlots(color).every(([a, b]) => isPieceSolved(state, [color, a, b]));
}

/** True when the four middle-layer edges between `color`'s layer and the opposite one are solved. */
export function isMiddleLayerSolved(state: CubeState, color: CubeColor): boolean {
  return f2lSlots(color).every(([a, b]) => isPieceSolved(state, [a, b]));
}
