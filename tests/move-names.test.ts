/**
 * Cubyntra - Plain-Language Move Name Tests
 *
 * Every move's name is pinned, and each direction word is checked against where a sticker
 * actually goes, so a name can never contradict the move it describes.
 */

import { describe, it, expect } from 'vitest';
import { FACES } from '../src/cube/constants';
import { applyMove, parseMove } from '../src/cube/transforms';
import type { CubeState, Face } from '../src/cube/types';
import { moveName } from '../src/cube/moveNames';

const EXPECTED: Record<string, string> = {
  R: 'Turn the right side up', "R'": 'Turn the right side down', R2: 'Turn the right side twice',
  L: 'Turn the left side down', "L'": 'Turn the left side up', L2: 'Turn the left side twice',
  U: 'Turn the top to the left', "U'": 'Turn the top to the right', U2: 'Turn the top twice',
  D: 'Turn the bottom to the right', "D'": 'Turn the bottom to the left', D2: 'Turn the bottom twice',
  F: 'Turn the front clockwise', "F'": 'Turn the front counter-clockwise', F2: 'Turn the front twice',
  B: 'Turn the back so the top goes to the left', "B'": 'Turn the back so the top goes to the right',
  B2: 'Turn the back twice',
  r: 'Turn the right two layers up', "r'": 'Turn the right two layers down', r2: 'Turn the right two layers twice',
  l: 'Turn the left two layers down', "l'": 'Turn the left two layers up', l2: 'Turn the left two layers twice',
  u: 'Turn the top two layers to the left', "u'": 'Turn the top two layers to the right',
  u2: 'Turn the top two layers twice',
  d: 'Turn the bottom two layers to the right', "d'": 'Turn the bottom two layers to the left',
  d2: 'Turn the bottom two layers twice',
  f: 'Turn the front two layers clockwise', "f'": 'Turn the front two layers counter-clockwise',
  f2: 'Turn the front two layers twice',
  b: 'Turn the back two layers so the top goes to the left',
  "b'": 'Turn the back two layers so the top goes to the right', b2: 'Turn the back two layers twice',
  M: 'Turn the middle layer between left and right down', "M'": 'Turn the middle layer between left and right up',
  M2: 'Turn the middle layer between left and right twice',
  E: 'Turn the middle layer between top and bottom to the right',
  "E'": 'Turn the middle layer between top and bottom to the left',
  E2: 'Turn the middle layer between top and bottom twice',
  S: 'Turn the middle layer between front and back clockwise',
  "S'": 'Turn the middle layer between front and back counter-clockwise',
  S2: 'Turn the middle layer between front and back twice',
  x: 'Turn the whole cube up', "x'": 'Turn the whole cube down', x2: 'Turn the whole cube up twice',
  y: 'Turn the whole cube to the left', "y'": 'Turn the whole cube to the right',
  y2: 'Turn the whole cube to the left twice',
  z: 'Turn the whole cube clockwise', "z'": 'Turn the whole cube counter-clockwise',
  z2: 'Turn the whole cube clockwise twice',
};

function labelledCube(): CubeState {
  const state = {} as Record<string, string[]>;
  for (const face of FACES) state[face] = Array.from({ length: 9 }, (_, i) => `${face}${i}`);
  return state as unknown as CubeState;
}

function whereDoes(label: string, notation: string): string {
  const after = applyMove(labelledCube(), parseMove(notation));
  for (const face of FACES) {
    const i = (after[face] as unknown as string[]).indexOf(label);
    if (i >= 0) return `${face}${i}`;
  }
  throw new Error(`${label} vanished`);
}

/**
 * A sticker the move carries, and where it lands, described as the student sees it.
 * Layer moves use a sticker of the turning layer; the front-plane ones track a top sticker.
 */
const PROBE: Record<string, { sticker: string; directions: Record<string, string> }> = {
  R: { sticker: 'F5', directions: { U: 'up', D: 'down' } },
  r: { sticker: 'F4', directions: { U: 'up', D: 'down' } },
  x: { sticker: 'F4', directions: { U: 'up', D: 'down' } },
  L: { sticker: 'F3', directions: { U: 'up', D: 'down' } },
  l: { sticker: 'F4', directions: { U: 'up', D: 'down' } },
  M: { sticker: 'F4', directions: { U: 'up', D: 'down' } },
  U: { sticker: 'F1', directions: { L: 'to the left', R: 'to the right' } },
  u: { sticker: 'F4', directions: { L: 'to the left', R: 'to the right' } },
  y: { sticker: 'F4', directions: { L: 'to the left', R: 'to the right' } },
  D: { sticker: 'F7', directions: { L: 'to the left', R: 'to the right' } },
  d: { sticker: 'F4', directions: { L: 'to the left', R: 'to the right' } },
  E: { sticker: 'F4', directions: { L: 'to the left', R: 'to the right' } },
  F: { sticker: 'U7', directions: { R: 'clockwise', L: 'counter-clockwise' } },
  f: { sticker: 'U4', directions: { R: 'clockwise', L: 'counter-clockwise' } },
  z: { sticker: 'U4', directions: { R: 'clockwise', L: 'counter-clockwise' } },
  S: { sticker: 'U4', directions: { R: 'clockwise', L: 'counter-clockwise' } },
  B: { sticker: 'U1', directions: { L: 'so the top goes to the left', R: 'so the top goes to the right' } },
  b: { sticker: 'U4', directions: { L: 'so the top goes to the left', R: 'so the top goes to the right' } },
};

describe('moveName', () => {
  it('names every move', () => {
    expect(Object.keys(EXPECTED)).toHaveLength(54);
    for (const [notation, name] of Object.entries(EXPECTED)) {
      expect(moveName(parseMove(notation)), notation).toBe(name);
    }
  });

  it('accepts the Rw spelling for wide moves', () => {
    expect(moveName(parseMove("Rw'"))).toBe('Turn the right two layers down');
  });

  it('uses the direction the stickers really travel', () => {
    for (const [symbol, probe] of Object.entries(PROBE)) {
      for (const suffix of ['', "'"]) {
        const notation = `${symbol}${suffix}`;
        const landed = whereDoes(probe.sticker, notation)[0] as Face;
        const direction = probe.directions[landed];
        expect(direction, `${notation}: ${probe.sticker} went to ${landed}`).toBeDefined();
        expect(moveName(parseMove(notation)).endsWith(` ${direction}`), notation).toBe(true);
      }
    }
  });
});
