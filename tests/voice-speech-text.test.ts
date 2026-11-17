/**
 * Cubyntra - Speakable text tests (voice, ADR-016)
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { moveName } from '../src/cube/moveNames';
import { parseMove } from '../src/cube/transforms';
import { allowedMoves } from '../src/coach/facts';
import { templateText } from '../src/coach/templates';
import { coachSpeech, speakableText, spokenNotation, stripMarkdown } from '../src/voice/speechText';
import { SAMPLE_FACTS } from './helpers/coachFacts';

/** Every move the tutor can show, with its notation-style spoken form. */
const NOTATION: [string, string][] = [
  ['U', 'U'],
  ["U'", "U prime"],
  ['U2', 'U two'],
  ['R', 'R'],
  ["R'", "R prime"],
  ['R2', 'R two'],
  ['F', 'F'],
  ["F'", "F prime"],
  ['F2', 'F two'],
  ['D', 'D'],
  ["D'", "D prime"],
  ['D2', 'D two'],
  ['L', 'L'],
  ["L'", "L prime"],
  ['L2', 'L two'],
  ['B', 'B'],
  ["B'", "B prime"],
  ['B2', 'B two'],
  ['u', 'U wide'],
  ["u'", "U wide prime"],
  ['u2', 'U wide two'],
  ['r', 'R wide'],
  ["r'", "R wide prime"],
  ['r2', 'R wide two'],
  ['f', 'F wide'],
  ["f'", "F wide prime"],
  ['f2', 'F wide two'],
  ['d', 'D wide'],
  ["d'", "D wide prime"],
  ['d2', 'D wide two'],
  ['l', 'L wide'],
  ["l'", "L wide prime"],
  ['l2', 'L wide two'],
  ['b', 'B wide'],
  ["b'", "B wide prime"],
  ['b2', 'B wide two'],
  ['M', 'M'],
  ["M'", "M prime"],
  ['M2', 'M two'],
  ['E', 'E'],
  ["E'", "E prime"],
  ['E2', 'E two'],
  ['S', 'S'],
  ["S'", "S prime"],
  ['S2', 'S two'],
  ['x', 'x'],
  ["x'", "x prime"],
  ['x2', 'x two'],
  ['y', 'y'],
  ["y'", "y prime"],
  ['y2', 'y two'],
  ['z', 'z'],
  ["z'", "z prime"],
  ['z2', 'z two'],
];

const WORDS: [string, string][] = [
  ["R", "Turn the right side up"],
  ["R'", "Turn the right side down"],
  ["R2", "Turn the right side twice"],
  ["L", "Turn the left side down"],
  ["L'", "Turn the left side up"],
  ["L2", "Turn the left side twice"],
  ["U", "Turn the top to the left"],
  ["U'", "Turn the top to the right"],
  ["U2", "Turn the top twice"],
  ["D", "Turn the bottom to the right"],
  ["D'", "Turn the bottom to the left"],
  ["D2", "Turn the bottom twice"],
  ["F", "Turn the front clockwise"],
  ["F'", "Turn the front counter-clockwise"],
  ["F2", "Turn the front twice"],
  ["B", "Turn the back so the top goes to the left"],
  ["B'", "Turn the back so the top goes to the right"],
  ["B2", "Turn the back twice"],
];

describe('spoken moves', () => {
  it('covers all 54 moves', () => {
    expect(NOTATION).toHaveLength(54);
  });

  it.each(NOTATION)('says %s as "%s" in notation style', (notation, spoken) => {
    expect(spokenNotation(notation, 'notation')).toBe(spoken);
    expect(speakableText(`Do \`${notation}\` \`${notation}\``, 'notation')).toBe(`Do ${spoken}, ${spoken}`);
  });

  it.each(NOTATION.map(([n]) => n))('says %s in words as its plain-language name', (notation) => {
    const name = moveName(parseMove(notation));
    expect(spokenNotation(notation, 'words')).toBe(name);
    expect(speakableText(`\`${notation}\` \`${notation}\``, 'words')).toBe(`${name}, ${name.charAt(0).toLowerCase()}${name.slice(1)}`);
  });

  it.each(WORDS)('says %s in words as "%s"', (notation, spoken) => {
    expect(spokenNotation(notation, 'words')).toBe(spoken);
  });

  it('accepts the wide form written with w', () => {
    expect(spokenNotation("Rw'", 'notation')).toBe('R wide prime');
    expect(spokenNotation('Rw', 'words')).toBe('Turn the right two layers up');
  });
});

describe('speakableText', () => {
  it('reads a run of moves as a list, glued or spaced', () => {
    expect(speakableText("Then do: R U R' U'.", 'notation')).toBe('Then do: R, U, R prime, U prime.');
    expect(speakableText("Do RUR'U' now", 'notation')).toBe('Do R, U, R prime, U prime now');
    expect(speakableText("Then do: R U R'.", 'words')).toBe(
      'Then do: Turn the right side up, turn the top to the left, turn the right side down.'
    );
  });

  it('reads a gloss once in words and with its letter in notation', () => {
    const gloss = "In words: U = turn the top to the left, R' = turn the right side down.";
    expect(speakableText(gloss, 'words')).toBe('In words: turn the top to the left, turn the right side down.');
    expect(speakableText(gloss, 'notation')).toBe(
      'In words: U, turn the top to the left, R prime, turn the right side down.'
    );
  });

  it('leaves prose letters alone', () => {
    const prose = "Plan B: the F face and an L shape. I'd say F2L is fun.";
    expect(speakableText(prose, 'words')).toBe(prose);
  });

  it('strips markdown and backticks', () => {
    expect(stripMarkdown('## Tip\n- **Look** at the _top_ and `the` [edge](http://x).')).toBe('Tip\nLook at the top and the edge.');
    expect(speakableText('Try `R2` now.', 'notation')).toBe('Try R two now.');
    expect(speakableText("**Then** `U'`", 'words')).toBe('Then turn the top to the right');
  });

  it('reads every coach template without notation left in it', () => {
    for (const hintLevel of [1, 2, 3] as const) {
      const text = templateText({ ...SAMPLE_FACTS, hintLevel });
      const spoken = speakableText(text, 'words');
      expect(spoken).not.toMatch(/`|\*\*|R'|U2/);
    }
  });
});

describe('coachSpeech: only guard-approved, final text', () => {
  const step = { allowed: allowedMoves(SAMPLE_FACTS), names: [SAMPLE_FACTS.caseName, SAMPLE_FACTS.stageName] };

  it('speaks the final reply', () => {
    expect(coachSpeech({ text: "Do R U R' and smile.", status: 'done' }, step, 'notation')).toBe('Do R, U, R prime and smile.');
  });

  it.each(['idle', 'loading', 'streaming', 'error'] as const)('says nothing while the reply is %s', (status) => {
    expect(coachSpeech({ text: 'Look at the top.', status }, step, 'words')).toBeNull();
  });

  it.each([
    ['an invented sequence', "Try L' D L instead."],
    ['an invented suffixed move', 'Then do F2 to finish.'],
    ['a move in backticks', 'Now `B` and done.'],
  ])('never speaks a reply that fails the guard: %s', (_name, text) => {
    expect(coachSpeech({ text, status: 'done' }, step, 'words')).toBeNull();
    expect(coachSpeech({ text, status: 'done' }, step, 'notation')).toBeNull();
  });

  it('says nothing for an empty reply', () => {
    expect(coachSpeech({ text: '  ', status: 'done' }, step, 'words')).toBeNull();
  });
});
