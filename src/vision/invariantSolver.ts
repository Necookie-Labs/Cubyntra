/**
 * Cubyntra - 54-Sticker Invariant & Constrained Assignment Solver
 * Necookie Labs (c) 2026
 *
 * Enforces the physical invariant that a valid Rubik's Cube contains exactly 9 stickers
 * of each of the 6 colors (1 center + 8 edge/corner facets per color).
 *
 * Uses the Hungarian (Kuhn-Munkres) algorithm for minimal-cost optimal assignment.
 */

import { CubeColor } from '../cube/types';
import { COLORS } from '../cube/constants';

export interface StickerCostProfile {
  index: number;
  isCenter: boolean;
  fixedColor?: CubeColor;
  costs: Record<CubeColor, number>; // distance in CIELAB space
}

/**
 * Solves the Minimum Cost Bipartite Matching using the Hungarian (Munkres) Algorithm.
 * Matrix is N x N where rows are non-center stickers (48) and columns are color slots (6 colors x 8 slots = 48).
 */
export function solveHungarian(costMatrix: number[][]): number[] {
  const n = costMatrix.length;
  if (n === 0) return [];

  // u, v are potential vectors
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  // Result mapping: assignment[row] = col
  const assignment = new Array(n);
  for (let j = 1; j <= n; j++) {
    assignment[p[j] - 1] = j - 1;
  }

  return assignment;
}

/**
 * Enforces the 9-stickers-per-color invariant across all 54 stickers.
 *
 * @param stickerProfiles Array of 54 sticker cost profiles (ordered 0..53).
 * @returns Array of 54 resolved CubeColors guaranteed to have exactly 9 of each color.
 */
export function resolve54StickerInvariant(
  stickerProfiles: StickerCostProfile[]
): CubeColor[] {
  if (stickerProfiles.length !== 54) {
    throw new Error(`Expected 54 sticker profiles, received ${stickerProfiles.length}`);
  }

  const result: CubeColor[] = new Array(54);

  // 1. Separate fixed centers (6) from non-center stickers (48)
  const nonCenterIndices: number[] = [];
  for (let i = 0; i < 54; i++) {
    const profile = stickerProfiles[i];
    if (profile.isCenter && profile.fixedColor) {
      result[i] = profile.fixedColor;
    } else {
      nonCenterIndices.push(i);
    }
  }

  // 2. Build target slot mapping (6 colors x 8 slots = 48 slots)
  const targetColorSlots: CubeColor[] = [];
  for (const color of COLORS) {
    for (let count = 0; count < 8; count++) {
      targetColorSlots.push(color);
    }
  }

  // 3. Construct 48x48 cost matrix
  const matrixSize = nonCenterIndices.length; // 48
  const costMatrix: number[][] = [];

  for (let r = 0; r < matrixSize; r++) {
    const stickerIdx = nonCenterIndices[r];
    const profile = stickerProfiles[stickerIdx];
    const rowCosts: number[] = [];

    for (let c = 0; c < targetColorSlots.length; c++) {
      const color = targetColorSlots[c];
      rowCosts.push(profile.costs[color] ?? 999.0);
    }

    costMatrix.push(rowCosts);
  }

  // 4. Solve optimal assignment via Hungarian Algorithm
  const matching = solveHungarian(costMatrix);

  // 5. Populate final resolved colors
  for (let r = 0; r < matrixSize; r++) {
    const stickerIdx = nonCenterIndices[r];
    const slotIdx = matching[r];
    result[stickerIdx] = targetColorSlots[slotIdx];
  }

  return result;
}
