/**
 * Cubyntra - Coach Move Guardrail Tests
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { checkReplyMoves, extractMoveTokens, relayableLength } from '../src/coach/guard';
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

  it('finds moves inside brackets, lists and backticks', () => {
    expect(tokens("Try (R U R' U'), then `F` and \"B2\".")).toEqual(['R', 'U', "R'", "U'", 'F', 'B2']);
  });

  it('counts a bare lower-case move only next to other notation', () => {
    expect(tokens("Do r U r' now")).toEqual(['r', 'U', "r'"]);
    expect(tokens('Point x at the slot')).toEqual([]);
  });

  // Text that names moves: every listed token must be found, in order.
  it.each<[string, string[]]>([
    ["R U R' U'", ['R', 'U', "R'", "U'"]],
    ['R U R U', ['R', 'U', 'R', 'U']],
    ['Do R U.', ['R', 'U']],
    ['Then R, U, F.', ['R', 'U', 'F']],
    ['Try [R U] twice.', ['R', 'U']],
    ['(F R)', ['F', 'R']],
    ['Finish with B2', ['B2']],
    ['Do R2 instead.', ['R2']],
    ["Just U'.", ["U'"]],
    ['L2 is a half turn.', ['L2']],
    ['Use Rw here.', ['r']],
    ["Use Fw' here.", ["f'"]],
    ['A quick M2 helps.', ['M2']],
    ['Turn y2 first.', ['y2']],
    ["Rotate with x' first.", ["x'"]],
    ['Then turn F.', ['F']],
    ['Do B now.', ['B']],
    ['Try D and see.', ['D']],
    ['Press `R` once.', ['R']],
    ['Turn the top once (U).', ['U']],
    ['Then the front [F].', ['F']],
    ['Lowercase `r` is wide.', ['r']],
    ['`R U R`', ['R', 'U', 'R']],
    ["R U R' U' R' F R F'", ['R', 'U', "R'", "U'", "R'", 'F', 'R', "F'"]],
    ['R’ U′ F´', ["R'", "U'", "F'"]],
    ['r U x', ['r', 'U', 'x']],
    ["M' U M", ["M'", 'U', 'M']],
    ['E S', ['E', 'S']],
  ])('finds the moves in "%s"', (text, expected) => {
    expect(tokens(text)).toEqual(expected);
  });

  // Ordinary prose: no move tokens at all.
  it.each([
    'Make a U-turn with the top.',
    'I like R&B music.',
    "I think R's turn is next.",
    "I'd say you're nearly there!",
    'This is the F2L stage of CFOP and a 3x3 cube.',
    'Use the L shape or the U perm.',
    'Two edges make an L with the center, so the L points to the front.',
    'The dot becomes an L, the L becomes a line, the line becomes the cross.',
    'The Ua perm and the H perm move edges.',
    'A b c, x marks the spot.',
    'Born in the U.S.A.',
    'Look at the 3D model.',
    'If that fails, go to plan B.',
    'Look at the F face first.',
    'Hold the cube so the R side faces you.',
    'The R and L sides stay still.',
    'Corner D is the one at the bottom.',
    'Grade: B. Nice work.',
    'Option E is the safest.',
    'Point x at the slot.',
    'Plot y against time.',
    'The x and y axes are fine.',
    'Is it piece F or piece B? Look again.',
    'The letters F, then nothing.',
    'Turn the top so the L is at the back.',
    'This is the U case.',
    'An S shape appears.',
    'Ask your friend M about it.',
    'Name: L. Simple.',
  ])('does not flag ordinary words in "%s"', (text) => {
    expect(tokens(text)).toEqual([]);
  });

  it('reads a repeat count after a bracket as a count, not a rotation', () => {
    expect(tokens("Do (R U R' U') x2.")).toEqual(['R', 'U', "R'", "U'"]);
  });

  it('still reads a stray backtick after a letter as a prime', () => {
    expect(tokens('Do R` now.')).toEqual(["R'"]);
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

  it.each([
    'If that fails, go to plan B.',
    'Look at the F face, then the L side.',
    'The dot becomes an L, the L becomes a line.',
  ])('accepts prose with a lone capital: "%s"', (text) => {
    expect(checkReplyMoves(text, SUNE).ok).toBe(true);
  });

  it.each([
    ["Do R U R' U' to finish.", ["U'"]],
    ['Then do R2.', ['R2']],
    ['Next: F R.', ['F']],
    ['Turn F now.', ['F']],
    ['Press `B` first.', ['B']],
    ["Try (L') once.", ["L'"]],
  ])('rejects invented notation in "%s"', (text, offending) => {
    const result = checkReplyMoves(text, SUNE);
    expect(result.ok).toBe(false);
    expect(result.offending.map((t) => t.canonical)).toEqual(offending);
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

describe('relayableLength', () => {
  it.each<[string, string]>([
    ['Look at the corner', 'Look at the '],
    ['Look at the F ', 'Look at the '],
    ['Look at the F face ', 'Look at the F face '],
    ["Do R U R' ", "Do R U R' "],
    ['Then (F ', 'Then ('],
    ['Plan B', 'Plan '],
    ['Line one\nline', 'Line one\n'],
    ["I'd go ", "I'd go "],
  ])('shows "%s" up to "%s"', (text, shownPart) => {
    expect(text.slice(0, relayableLength(text))).toBe(shownPart);
  });
});

describe('condensed and hyphenated notation', () => {
  const SEXY = allowedMoves({ setupMoves: '', algorithm: "R U R' U'" });

  it.each<[string, (string | null)[]]>([
    ["RUR'U'", ['R', 'U', "R'", "U'"]],
    ["Do RUR'U' now.", ['R', 'U', "R'", "U'"]],
    ["R-U-R'-U'", ['R', 'U', "R'", "U'"]],
    ["Then R-U-R'-U'-F.", ['R', 'U', "R'", "U'", 'F']],
    ['R2U', ['R2', 'U']],
    ["R'2U", ['R2', 'U']],
    ["RwUr'", ['r', 'U', "r'"]],
    ['R3', ["R'"]],
    ["Do U3' first.", ['U']],
    ['Try R5.', ['R']],
    ['R4', [null]],
    ["(RUR'U')", ['R', 'U', "R'", "U'"]],
    ["[RUR'U']", ['R', 'U', "R'", "U'"]],
    ["Press `RUR'U'` twice.", ['R', 'U', "R'", "U'"]],
    ["- RUR'U'", ['R', 'U', "R'", "U'"]],
    ["1. R-U-R'-U'", ['R', 'U', "R'", "U'"]],
    ["* RUR'U', then F.", ['R', 'U', "R'", "U'", 'F']],
    ["Try 'RUR'U'' next.", ['R', 'U', "R'", "U'"]],
    ["Do RU R' U'.", ['R', 'U', "R'", "U'"]],
    ["(RUR'U') x2", ['R', 'U', "R'", "U'"]],
    ["R U R'U'", ['R', 'U', "R'", "U'"]],
  ])('reads the moves in "%s"', (text, expected) => {
    expect(tokens(text)).toEqual(expected);
  });

  it.each([
    'RUN to the shop.',
    'Open the URL in a browser.',
    'Ready? Go!',
    'The FUR coat is warm.',
    'A BUD and a LED.',
    'This is the F2L stage on a 3x3.',
    "I think R's turn is next.",
    'Repeat it x3.',
    'Make a U-turn with the top.',
    'The F face, the R side and plan B.',
    'Born in the U.S.A.',
    "Don't stop, you're doing well.",
    'Rb perm and Ua perm.',
    'The x-axis and the y-axis.',
  ])('leaves ordinary words alone in "%s"', (text) => {
    expect(tokens(text)).toEqual([]);
  });

  it.each([
    ["Do RUR'U' twice.", true],
    ["Do RUR'F' twice.", false],
    ["R-U-R'-F", false],
    ['Use R3 here.', true],
    ['Use F3 here.', false],
    ['Use R4 here.', false],
    ["Do RUF R' U'.", false],
    ['Open the URL.', true],
  ] as const)('guards "%s" (ok: %s)', (text, ok) => {
    expect(checkReplyMoves(text, SEXY).ok).toBe(ok);
  });
});
