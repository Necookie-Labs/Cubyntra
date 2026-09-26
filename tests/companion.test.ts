/**
 * Cubyntra - Mobile Companion Sequence & Reticle Unit Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect } from 'vitest';
import { SCAN_SEQUENCE, CANONICAL_CENTER_COLORS, FACES } from '../src/cube/constants';
import { Face } from '../src/cube/types';

describe('Companion Scan Sequence Protocol', () => {
  it('covers exactly all 6 canonical faces without omission or duplicates', () => {
    expect(SCAN_SEQUENCE.length).toBe(6);
    const facesInSequence = SCAN_SEQUENCE.map((s) => s.face);
    const uniqueFaces = new Set(facesInSequence);

    expect(uniqueFaces.size).toBe(6);
    for (const face of FACES) {
      expect(uniqueFaces.has(face)).toBe(true);
    }
  });

  it('guarantees center color alignment with canonical Rubik standard', () => {
    for (const step of SCAN_SEQUENCE) {
      expect(step.centerColor).toBe(CANONICAL_CENTER_COLORS[step.face]);
    }
  });

  it('enforces unambiguous orientation protocol for all faces', () => {
    // Step 0: White face (U) has Green on bottom
    expect(SCAN_SEQUENCE[0].face).toBe('U');
    expect(SCAN_SEQUENCE[0].instruction).toContain('Green');

    // Step 1 to 4: Front, Right, Back, Left all keep White on top
    const sideSteps = SCAN_SEQUENCE.slice(1, 5);
    for (const step of sideSteps) {
      expect(step.instruction).toContain('White');
    }

    // Step 5: Yellow face (D) has Green on top
    expect(SCAN_SEQUENCE[5].face).toBe('D');
    expect(SCAN_SEQUENCE[5].instruction).toContain('Green');
  });

  it('verifies that each step has a valid rotation hint for user guidance', () => {
    for (const step of SCAN_SEQUENCE) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.rotationHint.length).toBeGreaterThan(0);
      expect(step.instruction.length).toBeGreaterThan(0);
    }
  });
});
