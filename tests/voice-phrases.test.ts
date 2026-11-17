/**
 * Cubyntra - Phrase bank tests (voice, ADR-016)
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { moveName } from '../src/cube/moveNames';
import { FACES } from '../src/cube/constants';
import type { Face } from '../src/cube/types';
import { METHODS } from '../src/tutor/api';
import { CFOP_FULL_METHOD } from '../src/tutor/methods/cfop';
import {
  LINES,
  PHRASES,
  allMoves,
  checkpointLines,
  isPhraseText,
  movePhrase,
  phraseBankCharacters,
  showFacePhrase,
  stagePhrase,
} from '../src/voice/phrases';
import { spokenMove } from '../src/voice/speechText';

describe('phrase bank', () => {
  it('has 54 moves, each in both styles', () => {
    const moves = allMoves();
    expect(moves).toHaveLength(54);
    expect(new Set(moves.map((m) => m.notation)).size).toBe(54);
    for (const move of moves) {
      expect(isPhraseText(moveName(move))).toBe(true);
      expect(isPhraseText(spokenMove(move, 'notation'))).toBe(true);
      expect(movePhrase(move, 'words')).toBe(moveName(move));
    }
  });

  it('introduces every stage of both methods and the full last layer', () => {
    for (const method of [...Object.values(METHODS), CFOP_FULL_METHOD]) {
      for (const stage of method.stages) expect(isPhraseText(stagePhrase(stage.name))).toBe(true);
    }
  });

  it('asks for every face and has every fixed line', () => {
    for (const face of FACES as readonly Face[]) expect(isPhraseText(showFacePhrase(face))).toBe(true);
    for (const text of Object.values(LINES)) expect(isPhraseText(text)).toBe(true);
  });

  it('keeps one entry per text with unique ids', () => {
    expect(new Set(PHRASES.map((p) => p.text)).size).toBe(PHRASES.length);
    expect(new Set(PHRASES.map((p) => p.id)).size).toBe(PHRASES.length);
  });

  it('is small: the whole bank costs under 2,500 Flash credits', () => {
    const chars = phraseBankCharacters();
    expect(chars).toBe(PHRASES.reduce((n, p) => n + p.text.length, 0));
    expect(chars * 0.5).toBeLessThan(2500);
  });

  it('does not accept free text', () => {
    expect(isPhraseText('Say something else entirely.')).toBe(false);
    expect(isPhraseText('')).toBe(false);
  });
});

describe('checkpointLines', () => {
  it.each([
    ['a match with praise', { status: 'match' as const, praiseIndex: 1 }, [LINES.match, LINES.praise2]],
    ['a match by hand', { status: 'match' as const, manual: true }, [LINES.matchByHand, LINES.praise1]],
    ['an unclear reading', { status: 'uncertain' as const, askFace: 'F' as Face }, [LINES.showAgain, showFacePhrase('F')]],
    ['a face held turned', { status: 'uncertain' as const, rotationUnclear: true, askFace: 'U' as Face }, [LINES.holdAsShown, showFacePhrase('U')]],
    ['the wrong face', { status: 'wrong-face' as const, askFace: 'R' as Face }, [LINES.wrongFace, showFacePhrase('R')]],
    ['a mismatch', { status: 'mismatch' as const }, [LINES.mismatch]],
    ['a mismatch that needs one more face', { status: 'mismatch' as const, oneMoreFace: true, askFace: 'B' as Face }, [LINES.mismatch, LINES.oneMoreFace, showFacePhrase('B')]],
  ])('says %s with bank lines only', (_name, input, expected) => {
    const lines = checkpointLines(input);
    expect(lines).toEqual(expected);
    for (const line of lines) expect(isPhraseText(line)).toBe(true);
  });
});
