/**
 * Cubyntra - Chat guardrail ("Ask the coach"): sequences must be the plan's, lone moves only to
 * explain notation. The hint guard stays as it was.
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { checkChatMoves, checkReplyMoves, isContiguousRun, moveRuns, extractMoveTokens } from '../src/coach/guard';
import { allowedMoves, planSequence } from '../src/coach/facts';

// Setup U, then the algorithm R U R' U'.
const step = { setupMoves: 'U', algorithm: "R U R' U'" };
const sequence = planSequence(step);
const allowed = allowedMoves(step);
const names = ['Headlights (U)', 'Last layer'];
const check = (text: string) => checkChatMoves(text, sequence, allowed, names);

describe('planSequence', () => {
  it('is the setup then the algorithm, canonical', () => {
    expect(sequence).toEqual(['U', 'R', 'U', "R'", "U'"]);
    expect(planSequence({ setupMoves: '', algorithm: "Rw U Rw'" })).toEqual(['r', 'U', "r'"]);
    expect(planSequence({ setupMoves: '', algorithm: '' })).toEqual([]);
  });
});

describe('checkChatMoves', () => {
  it.each([
    // Sequences: contiguous runs of the plan pass.
    ["Do R U R' U'.", true],
    ["First U, then R U R' U'.", true],
    ["The whole step is U R U R' U'.", true],
    ["Start with R U R'.", true],
    ["Finish with R' U'.", true],
    ["Written short it is RUR'U'.", true],
    ["Or R-U-R'-U'.", true],
    ["Do (R U R' U') once.", true],
    ["Do R, U, R', U'.", true],
    // Sequences that are not the plan's fail.
    ["Do R U' R' U.", false],
    ['Do R U R U.', false],
    ["Try F R U R' U' F'.", false],
    ["Do it like this: R U R' U' R U R' U'.", false],
    ["Do U' R U R' U'.", false],
    ["Or RU'R'U.", false],
    ['Turn U2 R2.', false],
    // Lone moves of the step pass anywhere.
    ['Then turn U.', true],
    ["The R' brings the piece down.", true],
    // Lone moves outside the step pass only to explain notation.
    ["R' means turn the right side down.", true],
    ["D' means turn the bottom the other way.", true],
    ['F2 means turn the front side twice.', true],
    ['D stands for down, the bottom side.', true],
    ['B is the back side, facing away from you.', true],
    ['A letter like F2 is a half turn.', true],
    ['For example, L2 is two quarter turns.', true],
    ['L = turn the left side down.', true],
    ['The prime in x means the other way: x is a whole-cube turn.', true],
    ['Now do D.', false],
    ['Then turn D2.', false],
    // Explaining a move by comparing it with its opposite is notation, not an instruction
    // (a live Haiku answer about F' was replaced by the built-in one before this).
    ["A prime (') reverses a move, so F' undoes F.", true],
    ["F is clockwise, F' is counter-clockwise.", true],
    ["The normal F turn goes clockwise, so F' goes counter-clockwise.", true],
    ["So F' is the opposite of F.", true],
    ['D2 turns the bottom twice, the same in either direction.', true],
    // Named only to say the step does not use them (both from live Haiku answers).
    ["Your step only uses a single R, which turns the right side up, so you don't need R2 here.", true],
    ["The moves you need are just the setup turn U and then R, so you won't need F' today.", true],
    ['D is not part of this step.', true],
    ["This step doesn't use L2.", true],
    // ...unless an instruction comes right before them.
    ["You don't need U, just do D instead.", false],
    // Told as instructions, even in a sentence about direction, they still fail.
    ['Turn D the other way.', false],
    ['Now do D, then the opposite.', false],
    ["Next try L' to undo it.", false],
    ['Do F to reverse it.', false],
    ["Next comes F'.", false],
    ['Try `B` here.', false],
    // Words that look like letters are not moves.
    ['The F face is in front of you.', true],
    ['Plan B: go slowly.', true],
    ['Make an L shape on top.', true],
    ['Headlights (U) has two matching corners.', true],
    // Moves that cannot be checked fail.
    ['Do R4 here.', false],
  ])('%s -> %s', (text, ok) => {
    expect(check(text).ok).toBe(ok);
  });

  it('reports the offending run', () => {
    const result = check("Good. Now do F R U R' U' F' and you are done.");
    expect(result.ok).toBe(false);
    expect(result.offending).toHaveLength(1);
    expect(result.offending[0].moves).toEqual(['F', 'R', 'U', "R'", "U'", "F'"]);
  });

  it('allows a repeated step only as many times as the plan has it', () => {
    const repeated = { setupMoves: '', algorithm: "R U R' U' R U R' U'" };
    const seq = planSequence(repeated);
    const ok = (t: string) => checkChatMoves(t, seq, allowedMoves(repeated)).ok;
    expect(ok("R U R' U' R U R' U'")).toBe(true);
    expect(ok("R U R' U' R U R' U' R U R' U'")).toBe(false);
  });
});

describe('helpers', () => {
  it('finds contiguous runs', () => {
    expect(isContiguousRun(['R', 'U'], ['U', 'R', 'U'])).toBe(true);
    expect(isContiguousRun(['U', 'U'], ['U', 'R', 'U'])).toBe(false);
    expect(isContiguousRun([], ['U'])).toBe(false);
  });

  it('groups tokens into runs written together', () => {
    const text = "Do R U R' then U' alone.";
    const runs = moveRuns(text, extractMoveTokens(text));
    expect(runs.map((r) => r.moves)).toEqual([['R', 'U', "R'"], ["U'"]]);
  });
});

describe('the hint guard is unchanged', () => {
  it.each([
    ["R' means turn the right side down.", true],
    ["D' means turn the bottom the other way.", false],
    ["Do R U' R' U.", true],
    ['Now do D.', false],
  ])('%s -> %s', (text, ok) => {
    expect(checkReplyMoves(text, allowed, names).ok).toBe(ok);
  });
});
