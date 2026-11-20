/**
 * Cubyntra - Speakable text (ADR-016)
 * Necookie Labs (c) 2026
 *
 * Turns what the tutor shows into what the voice says. Moves become plain-language names
 * ("turn the right side up") or, for a student who chose notation, letter names ("R prime");
 * markdown and backticks are stripped. Coach text is spoken only once the coach panel shows its
 * final text (after any `replace` event), and only if it still passes the move guardrail for the
 * step: voice never reads text the coach panel would not show.
 *
 * Pure TypeScript: no DOM, React or network imports.
 */

import { moveName } from '../cube/moveNames';
import { formatMove, moveReferenceFace, parseMove } from '../cube/transforms';
import type { Move } from '../cube/types';
import { checkReplyMoves, extractMoveTokens } from '../coach/guard';

export type MoveSpeech = 'words' | 'notation';

/**
 * One move as spoken. Words: "Turn the right side up". Notation: "R", "R prime", "R two",
 * "R wide prime" (wide turns), "M prime", "x two" (slices and rotations keep their letter).
 */
export function spokenMove(move: Move, style: MoveSpeech): string {
  if (style === 'words') return moveName(move);
  const notation = formatMove(move);
  const letter = move.kind === 'wide' ? `${moveReferenceFace(move)} wide` : notation[0];
  const turn = move.quarterTurns === -1 ? ' prime' : move.quarterTurns === 2 ? ' two' : '';
  return `${letter}${turn}`;
}

/** A move written in notation (e.g. `R'`, `Rw2`), as spoken; the notation itself if it cannot be read. */
export function spokenNotation(notation: string, style: MoveSpeech): string {
  try {
    return spokenMove(parseMove(notation), style);
  } catch {
    return notation;
  }
}

/**
 * Removes markdown so the voice does not read stars, hashes or backticks. `keepCode` leaves the
 * backticks in (the move scan treats a letter in backticks as a move).
 */
export function stripMarkdown(text: string, { keepCode = false }: { keepCode?: boolean } = {}): string {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links: keep the label
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // headings
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '') // list markers
    .replace(/(\*\*|__)(.+?)\1/g, '$2') // bold
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2') // italic *x*
    .replace(/(^|\W)_(?!\s)([^_\n]+?)_(?!\w)/g, '$1$2') // italic _x_
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .trim();
  return keepCode ? plain : dropCodeMarks(plain);
}

/** Code marks go; the code itself stays. */
function dropCodeMarks(text: string): string {
  return text.replace(/`+/g, '').replace(/[ \t]+/g, ' ').trim();
}

const GLOSS = /(^|[^A-Za-z0-9'])((?:[URFDLB]w?|[urfdlbMESxyz])(?:2'|'2|2|')?) = /g;

const SENTENCE_START = /(?:^|[.!?:\n]\s*)$/;

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Text ready for a voice: markdown stripped, every move in notation replaced by its spoken form.
 * A run of moves ("R U R' U'", "RUR'U'") is read as a list. A gloss written as
 * "R = turn the right side up" is read once in words style ("turn the right side up") and as
 * "R, turn the right side up" in notation style.
 */
export function speakableText(input: string, style: MoveSpeech): string {
  const text = stripMarkdown(input, { keepCode: true })
    .replace(/[’′´]/g, "'")
    // A gloss "R = turn the right side up": in words the words that follow say it already.
    .replace(GLOSS, (_m, pre: string, notation: string) =>
      style === 'words' ? pre : `${pre}${spokenNotation(notation, style)}, `
    );
  const tokens = extractMoveTokens(text);
  let out = '';
  let at = 0;
  let prevReplaced = false;
  for (const token of tokens) {
    const end = token.index + token.raw.length;
    const gap = text.slice(at, token.index);
    if (token.canonical === null) {
      out += text.slice(at, end);
      at = end;
      prevReplaced = false;
      continue;
    }
    let spoken = spokenNotation(token.canonical, style);
    // Moves next to each other are read as a list: "turn the right side up, turn the top ...".
    const listed = prevReplaced && /^[\s,`-]*$/.test(gap);
    const before = listed ? `${out}, ` : out + gap;
    if (style === 'words' && (listed || !SENTENCE_START.test(before.replace(/`/g, '')))) spoken = lowerFirst(spoken);
    out = before + spoken;
    at = end;
    prevReplaced = true;
  }
  return dropCodeMarks(out + text.slice(at));
}

/** What the coach panel shows: its text and whether the reply has finished. */
export interface CoachShown {
  text: string;
  status: 'idle' | 'loading' | 'streaming' | 'done' | 'error';
}

/** The step a coach reply belongs to: the moves it may name and the names it may quote. */
export interface CoachStepMoves {
  /** Canonical notation of every move the reply may name (setup, algorithm, repeat unit). */
  allowed: ReadonlySet<string>;
  /** Case and stage names, blanked out before the guard scans (see `checkReplyMoves`). */
  names?: readonly string[];
}

/**
 * The coach reply to speak, or null. Only the final text (status `done`, so any `replace` has
 * already swapped in the template) is spoken, and only when it passes the move guardrail again;
 * a reply naming a move outside the step is never read out.
 */
export function coachSpeech(shown: CoachShown, step: CoachStepMoves, style: MoveSpeech): string | null {
  if (shown.status !== 'done' || !shown.text.trim()) return null;
  if (!checkReplyMoves(shown.text, step.allowed, step.names ?? []).ok) return null;
  const spoken = speakableText(shown.text, style);
  return spoken || null;
}

/**
 * A finished "Ask the coach" answer to speak, or null. As for hints, only the final text is
 * read (after any `replace`), and only when it still passes the chat guardrail for the step
 * (`passes`, see `checkChatAnswer`), which allows single moves explained as notation.
 */
export function chatSpeech(shown: CoachShown, passes: (text: string) => boolean, style: MoveSpeech): string | null {
  if (shown.status !== 'done' || !shown.text.trim()) return null;
  if (!passes(shown.text)) return null;
  return speakableText(shown.text, style) || null;
}
