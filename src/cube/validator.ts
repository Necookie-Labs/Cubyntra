/**
 * Cubyntra - Cube State Validator & Diagnostic Engine
 * Necookie Labs (c) 2026
 *
 * Implements strict mathematical cube invariants:
 * 1. 54 stickers total
 * 2. 9 of each canonical color
 * 3. 6 unique centers in canonical orientation
 * 4. 8 valid corner pieces with no duplicate pieces or opposing colors
 * 5. Corner twist parity: sum(corner twists) mod 3 === 0
 * 6. 12 valid edge pieces with no duplicate pieces or opposing colors
 * 7. Edge flip parity: sum(edge flips) mod 2 === 0
 * 8. Overall permutation parity: corner_parity === edge_parity
 */

import { CubeColor, CubeState, ValidationIssue, ValidationResult } from './types';
import { CANONICAL_CENTER_COLORS, COLORS, FACES } from './constants';
import { cubeStateToFaceletString } from './transforms';
import { normalizeOrientation } from './orientation';
import { CORNER_SLOTS as CORNERS, EDGE_SLOTS as EDGES } from './pieces';
import { Cube } from 'rubik-solver';

/**
 * Validates a CubeState thoroughly. Returns a ValidationResult with granular diagnostic issues.
 *
 * A state held in another orientation (after x, y, z or slice moves) is first turned to the
 * standard one, so issues name faces in standard orientation. Centers that no real cube can
 * show are reported as INVALID_CENTERS.
 */
export function validateCubeState(input: CubeState): ValidationResult {
  const issues: ValidationIssue[] = [];
  const state = normalizeOrientation(input)?.state ?? input;

  // 1. Check Color Counts
  const colorCounts: Record<CubeColor, number> = {
    white: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    red: 0,
    orange: 0,
  };

  for (const face of FACES) {
    const stickers = state[face];
    if (!stickers || stickers.length !== 9) {
      issues.push({
        code: 'INVALID_TOTAL_COUNT',
        message: `Face ${face} does not contain exactly 9 stickers.`,
        face,
      });
      continue;
    }
    for (let i = 0; i < 9; i++) {
      const color = stickers[i];
      if (color && colorCounts[color] !== undefined) {
        colorCounts[color]++;
      }
    }
  }

  for (const color of COLORS) {
    if (colorCounts[color] !== 9) {
      issues.push({
        code: 'INVALID_COLOR_COUNT',
        message: `Expected 9 ${color} stickers, found ${colorCounts[color]}.`,
        details: { color, count: colorCounts[color] },
      });
    }
  }

  // 2. Check Center Stickers
  for (const face of FACES) {
    const centerColor = state[face]?.[4];
    const expected = CANONICAL_CENTER_COLORS[face];
    if (centerColor !== expected) {
      issues.push({
        code: 'INVALID_CENTERS',
        message: `Face ${face} center sticker must be ${expected}, but got ${centerColor}.`,
        face,
        stickerIndex: 4,
        expectedColor: expected,
      });
    }
  }

  // If basic counts or centers are invalid, abort parity checks early
  // 3. Physical Corner and Edge Piece Integrity
  const observedCorners: string[] = [];
  for (const corner of CORNERS) {
    const c0 = state[corner.stickers[0].face][corner.stickers[0].index];
    const c1 = state[corner.stickers[1].face][corner.stickers[1].index];
    const c2 = state[corner.stickers[2].face][corner.stickers[2].index];
    const cornerColors = [c0, c1, c2];

    if (new Set(cornerColors).size !== 3) {
      issues.push({
        code: 'INVALID_CORNER_COLORS',
        message: `Corner ${corner.name} contains duplicate colors: [${cornerColors.join(', ')}]`,
      });
    }

    if (
      (cornerColors.includes('white') && cornerColors.includes('yellow')) ||
      (cornerColors.includes('green') && cornerColors.includes('blue')) ||
      (cornerColors.includes('red') && cornerColors.includes('orange'))
    ) {
      issues.push({
        code: 'INVALID_CORNER_COLORS',
        message: `Corner ${corner.name} has physically impossible opposing colors: [${cornerColors.join(', ')}]`,
      });
    }

    observedCorners.push([...cornerColors].sort().join('-'));
  }

  if (new Set(observedCorners).size !== 8) {
    issues.push({
      code: 'INVALID_CORNER_COLORS',
      message: 'Duplicate or missing corner cubies detected.',
    });
  }

  const observedEdges: string[] = [];
  for (const edge of EDGES) {
    const e0 = state[edge.stickers[0].face][edge.stickers[0].index];
    const e1 = state[edge.stickers[1].face][edge.stickers[1].index];
    const edgeColors = [e0, e1];

    if (e0 === e1) {
      issues.push({
        code: 'INVALID_EDGE_COLORS',
        message: `Edge ${edge.name} has identical colors: ${e0}-${e1}`,
      });
    }

    if (
      (edgeColors.includes('white') && edgeColors.includes('yellow')) ||
      (edgeColors.includes('green') && edgeColors.includes('blue')) ||
      (edgeColors.includes('red') && edgeColors.includes('orange'))
    ) {
      issues.push({
        code: 'INVALID_EDGE_COLORS',
        message: `Edge ${edge.name} has physically impossible opposing colors: ${edgeColors.join('-')}`,
      });
    }

    observedEdges.push([...edgeColors].sort().join('-'));
  }

  if (new Set(observedEdges).size !== 12) {
    issues.push({
      code: 'INVALID_EDGE_COLORS',
      message: 'Duplicate or missing edge cubies detected.',
    });
  }

  if (issues.length > 0) {
    return { valid: false, status: 'invalid', issues };
  }

  // 4. Deep Mathematical Validation & Parity Invariants
  // Converts to standard facelet string and checks corner twist, edge flip, and permutation parities
  try {
    const faceletStr = cubeStateToFaceletString(state);
    const cube = Cube.fromString(faceletStr);
    const verifyResult = cube.verify();

    if (verifyResult !== true) {
      const msg = typeof verifyResult === 'string' ? verifyResult : 'Physical cube validation failed.';
      if (msg.includes('twist')) {
        issues.push({
          code: 'CORNER_TWIST_PARITY',
          message: 'Corner orientation parity invalid: A corner cubie appears twisted.',
        });
      } else if (msg.includes('flip')) {
        issues.push({
          code: 'EDGE_FLIP_PARITY',
          message: 'Edge orientation parity invalid: A single edge piece appears flipped.',
        });
      } else if (msg.includes('Parity')) {
        issues.push({
          code: 'PERMUTATION_PARITY',
          message: 'Permutation parity mismatch: Two pieces appear swapped (parity impossible).',
        });
      } else if (msg.includes('corner')) {
        issues.push({
          code: 'INVALID_CORNER_COLORS',
          message: msg,
        });
      } else if (msg.includes('edge')) {
        issues.push({
          code: 'INVALID_EDGE_COLORS',
          message: msg,
        });
      } else {
        issues.push({
          code: 'INVALID_TOTAL_COUNT',
          message: msg,
        });
      }
    }
  } catch (err: unknown) {
    issues.push({
      code: 'INVALID_TOTAL_COUNT',
      message: err instanceof Error ? err.message : 'Invalid cube state.',
    });
  }

  return {
    valid: issues.length === 0,
    status: issues.length === 0 ? 'valid' : 'invalid',
    issues,
  };
}
