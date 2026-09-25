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

import { CubeColor, CubeState, Face, ValidationIssue, ValidationResult } from './types';
import { CANONICAL_CENTER_COLORS, COLORS, FACES } from './constants';

interface CornerDefinition {
  name: string;
  stickers: [
    { face: Face; index: number }, // primary (U or D)
    { face: Face; index: number },
    { face: Face; index: number }
  ];
}

interface EdgeDefinition {
  name: string;
  stickers: [
    { face: Face; index: number }, // primary (U/D, or F/B for E-slice)
    { face: Face; index: number }
  ];
}

const CORNERS: CornerDefinition[] = [
  { name: 'UBL', stickers: [{ face: 'U', index: 0 }, { face: 'B', index: 2 }, { face: 'L', index: 0 }] },
  { name: 'UBR', stickers: [{ face: 'U', index: 2 }, { face: 'R', index: 2 }, { face: 'B', index: 0 }] },
  { name: 'UFL', stickers: [{ face: 'U', index: 6 }, { face: 'L', index: 2 }, { face: 'F', index: 0 }] },
  { name: 'UFR', stickers: [{ face: 'U', index: 8 }, { face: 'F', index: 2 }, { face: 'R', index: 0 }] },
  { name: 'DFL', stickers: [{ face: 'D', index: 0 }, { face: 'F', index: 6 }, { face: 'L', index: 8 }] },
  { name: 'DFR', stickers: [{ face: 'D', index: 2 }, { face: 'R', index: 6 }, { face: 'F', index: 8 }] },
  { name: 'DBL', stickers: [{ face: 'D', index: 6 }, { face: 'L', index: 6 }, { face: 'B', index: 8 }] },
  { name: 'DBR', stickers: [{ face: 'D', index: 8 }, { face: 'B', index: 6 }, { face: 'R', index: 8 }] },
];

const EDGES: EdgeDefinition[] = [
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

/**
 * Validates a CubeState thoroughly. Returns a ValidationResult with granular diagnostic issues.
 */
export function validateCubeState(state: CubeState): ValidationResult {
  const issues: ValidationIssue[] = [];

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
  if (issues.length > 0) {
    return { valid: false, status: 'invalid', issues };
  }

  // 3. Validate Corners and Corner Parity
  let totalCornerTwist = 0;
  const observedCorners: string[] = [];

  for (const corner of CORNERS) {
    const c0 = state[corner.stickers[0].face][corner.stickers[0].index];
    const c1 = state[corner.stickers[1].face][corner.stickers[1].index];
    const c2 = state[corner.stickers[2].face][corner.stickers[2].index];
    const cornerColors = [c0, c1, c2];

    // Check for duplicate colors or opposite colors on the same corner
    if (new Set(cornerColors).size !== 3) {
      issues.push({
        code: 'INVALID_CORNER_COLORS',
        message: `Corner ${corner.name} contains duplicate colors: [${cornerColors.join(', ')}]`,
      });
      continue;
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
      continue;
    }

    // Sort to create a canonical piece identifier
    const pieceId = [...cornerColors].sort().join('-');
    observedCorners.push(pieceId);

    // Orientation / Twist calculation
    // A corner has one sticker that belongs to U or D (white or yellow)
    // Twist is 0 if white/yellow is on primary (U or D face)
    // Twist is 1 if white/yellow is on second face (CW twist)
    // Twist is 2 if white/yellow is on third face (CCW twist)
    if (c0 === 'white' || c0 === 'yellow') {
      totalCornerTwist += 0;
    } else if (c1 === 'white' || c1 === 'yellow') {
      totalCornerTwist += 1;
    } else if (c2 === 'white' || c2 === 'yellow') {
      totalCornerTwist += 2;
    }
  }

  // Check unique corner pieces
  if (new Set(observedCorners).size !== 8) {
    issues.push({
      code: 'INVALID_CORNER_COLORS',
      message: 'Duplicate or missing corner cubies detected.',
    });
  }

  if (totalCornerTwist % 3 !== 0) {
    issues.push({
      code: 'CORNER_TWIST_PARITY',
      message: 'Corner orientation parity invalid: A corner cubie appears twisted.',
    });
  }

  // 4. Validate Edges and Edge Parity
  let totalEdgeFlip = 0;
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
      continue;
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
      continue;
    }

    const pieceId = [...edgeColors].sort().join('-');
    observedEdges.push(pieceId);

    // Edge orientation
    // For edges touching U or D: oriented if white/yellow is on U or D
    // For E-slice edges (FL, FR, BL, BR): oriented if F or B color (green/blue) is on F or B face
    const isUD = edge.stickers[0].face === 'U' || edge.stickers[0].face === 'D';
    if (isUD) {
      if (e0 === 'white' || e0 === 'yellow') {
        totalEdgeFlip += 0;
      } else {
        totalEdgeFlip += 1;
      }
    } else {
      // E-slice edge: stickers[0] is F or B
      if (e0 === 'green' || e0 === 'blue') {
        totalEdgeFlip += 0;
      } else {
        totalEdgeFlip += 1;
      }
    }
  }

  if (new Set(observedEdges).size !== 12) {
    issues.push({
      code: 'INVALID_EDGE_COLORS',
      message: 'Duplicate or missing edge cubies detected.',
    });
  }

  if (totalEdgeFlip % 2 !== 0) {
    issues.push({
      code: 'EDGE_FLIP_PARITY',
      message: 'Edge orientation parity invalid: A single edge piece appears flipped.',
    });
  }

  // 5. Permutation Parity
  // Check permutation parity of corners and edges
  if (issues.length === 0) {
    const cornerParity = getCornerPermutationParity(state);
    const edgeParity = getEdgePermutationParity(state);
    if (cornerParity !== edgeParity) {
      issues.push({
        code: 'PERMUTATION_PARITY',
        message: 'Permutation parity mismatch: Two pieces appear swapped (parity impossible).',
      });
    }
  }

  return {
    valid: issues.length === 0,
    status: issues.length === 0 ? 'valid' : 'invalid',
    issues,
  };
}

/**
 * Calculates parity (0 = even, 1 = odd) of corner piece permutation.
 */
function getCornerPermutationParity(state: CubeState): number {
  const canonicalOrder = [
    'blue-orange-white', // UBL
    'blue-red-white',    // UBR
    'green-orange-white',// UFL
    'green-red-white',   // UFR
    'green-orange-yellow',// DFL
    'green-red-yellow',  // DFR
    'blue-orange-yellow',// DBL
    'blue-red-yellow',   // DBR
  ];

  const perm: number[] = [];
  for (const corner of CORNERS) {
    const c0 = state[corner.stickers[0].face][corner.stickers[0].index];
    const c1 = state[corner.stickers[1].face][corner.stickers[1].index];
    const c2 = state[corner.stickers[2].face][corner.stickers[2].index];
    const id = [c0, c1, c2].sort().join('-');
    const idx = canonicalOrder.indexOf(id);
    if (idx !== -1) perm.push(idx);
  }

  return calculatePermutationParity(perm);
}

/**
 * Calculates parity (0 = even, 1 = odd) of edge piece permutation.
 */
function getEdgePermutationParity(state: CubeState): number {
  const canonicalOrder = [
    'blue-white',   // UB
    'orange-white', // UL
    'red-white',    // UR
    'green-white',  // UF
    'green-orange', // FL
    'green-red',    // FR
    'blue-orange',  // BL
    'blue-red',     // BR
    'green-yellow', // DF
    'orange-yellow',// DL
    'red-yellow',   // DR
    'blue-yellow',  // DB
  ];

  const perm: number[] = [];
  for (const edge of EDGES) {
    const e0 = state[edge.stickers[0].face][edge.stickers[0].index];
    const e1 = state[edge.stickers[1].face][edge.stickers[1].index];
    const id = [e0, e1].sort().join('-');
    const idx = canonicalOrder.indexOf(id);
    if (idx !== -1) perm.push(idx);
  }

  return calculatePermutationParity(perm);
}

/**
 * Counts inversions in a permutation to compute parity (0 = even, 1 = odd).
 */
function calculatePermutationParity(arr: number[]): number {
  let inversions = 0;
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] > arr[j]) inversions++;
    }
  }
  return inversions % 2;
}
