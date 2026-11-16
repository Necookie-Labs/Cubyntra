/**
 * Cubyntra - Coach Move Guardrail Tests
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { checkReplyMoves, extractMoveTokens } from '../src/coach/guard';
import { allowedMoves } from '../src/coach/facts';

const tokens = (text: string) => extractMoveTokens(text).map((t) => t.canonical);
const SUNE = allowedMoves({ setupMoves: 'U', algorithm: "R U R' U R U2 R'" });

describe('extractMoveTokens', () => {
  it('finds a whole sequence', () => {
    expect(tokens("Now do R U R' U' and look again.")).toEqual(['R', 'U', "R'", "U'"]);
  });

  it('reads every suffix and the curly prime', () => {
    expect(tokens("R2 U2' F'2 L’ D")).toEqual(['R2', 'U2', 'F2', "L'", 'D']);
  });

  it('reads wide moves, slices and rotations', () => {
    expect(tokens("Rw U Rw' then r U r' and M2 E S' with y x' z2")).toEqual([
      'r', 'U', "r'", 'r', 'U', "r'", 'M2', 'E', "S'", 'y', "x'", 'z2',
    ]);
  });

  it('finds moves inside brackets, quotes and lists', () => {
    expect(tokens("Try (R U R' U'), then 'F' and \"B2\".")).toEqual(['R', 'U', "R'", "U'", 'F', 'B2']);
  });

  it('catches a lone face letter at the end of a sentence', () => {
    expect(tokens('Then turn F.')).toEqual(['F']);
  });

  it.each([
    'Make a U-turn with the top.',
    'I like R&B music.',
    "I think R's turn is next.",
    "I'd say you're nearly there!",
    'This is the F2L stage of CFOP and a 3x3 cube.',
    'Use the L shape or the U perm.',
    'Two edges make an L with the center, so the L points to the front.',
    'The Ua perm and the H perm move edges.',
    'A b c, x marks the spot.',
    'Born in the U.S.A.',
    'Look at the 3D model.',
    "Do (R U R' U') x2.",
  ])('does not flag ordinary words in "%s"', (text) => {
    const found = tokens(text);
    if (text.includes("(R U R' U')")) expect(found).toEqual(['R', 'U', "R'", "U'"]);
    else expect(found).toEqual([]);
  });

  it('counts a bare lower-case move only next to other notation', () => {
    expect(tokens("Do r U r' now")).toEqual(['r', 'U', "r'"]);
    expect(tokens('Point x at the slot')).toEqual([]);
  });
});

describe('checkReplyMoves', () => {
  it('accepts a reply that uses only the plan moves', () => {
    const result = checkReplyMoves("Turn the top once (U), then do R U R' U R U2 R'.", SUNE);
    expect(result.ok).toBe(true);
    expect(result.tokens).toHaveLength(8);
  });

  it('accepts a reply with no moves at all', () => {
    expect(checkReplyMoves('Find the corner with yellow facing you. You can do it!', SUNE).ok).toBe(true);
  });

  it('rejects a reply that invents a move', () => {
    const result = checkReplyMoves("Do R U R' U' F to finish.", SUNE);
    expect(result.ok).toBe(false);
    expect(result.offending.map((t) => t.canonical)).toEqual(["U'", 'F']);
  });

  it('rejects a changed amount of an allowed face', () => {
    expect(checkReplyMoves('Do R2 instead.', SUNE).ok).toBe(false);
  });

  it('ignores the step case and stage names', () => {
    const allowed = allowedMoves({ setupMoves: '', algorithm: "R2 D R' U2 R D' R' U2 R'" });
    const reply = 'This is Headlights (U). Hold the headlights at the front.';
    expect(checkReplyMoves(reply, allowed).ok).toBe(false);
    expect(checkReplyMoves(reply, allowed, ['Headlights (U)', 'Yellow top']).ok).toBe(true);
  });

  it('treats Rw and r as the same move', () => {
    const allowed = allowedMoves({ setupMoves: '', algorithm: "f R U R' U' f'" });
    expect(checkReplyMoves("Do Fw R U R' U' Fw'.", allowed).ok).toBe(true);
  });
});
