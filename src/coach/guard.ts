/**
 * Cubyntra - Coach Move Guardrail
 * Necookie Labs (c) 2026
 *
 * The tutor engine picks every move; Claude only explains. This check finds every piece of move
 * notation in a reply and rejects the reply if any move is not part of the step (setup,
 * algorithm or repeated unit). A rejected reply is replaced by the built-in template.
 *
 * What counts as a move token. A candidate is a face turn, wide turn, slice or rotation letter
 * (`R`, `Rw`, `r`, `M`, `x`) with an optional `w`, `'`, `2`, `2'` or `'2`, standing alone: not
 * glued to letters, digits, `-`, `&`, `/`, `.`+letter or a following apostrophe-letter. So
 * "U-turn", "R&B", "R's", "F2L" and "B.C." are words, and "I" is never a move. A candidate
 * counts as a move only in move-like context:
 * - it carries a suffix (`R2`, `U'`, `Rw`), so a single invented "R2" is always caught;
 * - it is inside backticks (`` `F` ``);
 * - it is an upper-case letter right after "do", "then", "turn" or "try" ("then turn F."), or
 *   alone in brackets ("(F)");
 * - it is part of a run of two or more candidates separated only by spaces, commas or brackets,
 *   with at least one upper-case or suffixed token in the run ("R U R' U'", "r U r'").
 * A lone capital in prose ("plan B", "the F face", "the L becomes a line") is not a move, nor is
 * a bare letter used as a shape name ("L shape", "U perm", "an L"). The step's own case and
 * stage names ("Headlights (U)") are blanked out before the scan, and a repeat count after a
 * bracket, like "(R U R' U') x2", is not the rotation `x2`.
 */

import { parseMove } from '../cube/transforms';

export interface MoveToken {
  /** The text as written, prime normalised to `'`. */
  raw: string;
  /** Canonical notation (e.g. `Rw'` becomes `r'`), or null if it cannot be parsed. */
  canonical: string | null;
  index: number;
}

export interface GuardResult {
  ok: boolean;
  tokens: MoveToken[];
  /** Tokens whose move is not allowed for this step. */
  offending: MoveToken[];
}

const PRIMES = /[’′´`]/g;

// Candidate: a move letter with an optional `w`, then an optional `2`, `'`, `2'` or `'2`.
const CANDIDATE = /([URFDLBMESurfdlbxyz])(w?)(2'|'2|2|')?/g;

const UPPER = /[URFDLBMES]/;
const WORD_CHAR = /[A-Za-z0-9_&\-/]/;
// Between two tokens of one run: only spaces, commas and brackets.
const RUN_GAP = /^[\s,()[\]]*$/;
// "then turn F", "do R": a verb right before a bare capital makes it a move.
const MOVE_VERB = /\b(?:do|then|turn|try)\s+$/i;

function isBoundaryBefore(text: string, index: number): boolean {
  if (index === 0) return true;
  const prev = text[index - 1];
  if (WORD_CHAR.test(prev)) return false;
  // "I'd", "don't": an apostrophe after a letter joins a word. An opening quote does not.
  if ((prev === "'" || prev === '.') && index >= 2 && /[A-Za-z0-9]/.test(text[index - 2])) return false;
  return true;
}

// Case names that use a letter for a shape: "L shape", "U perm", "the L points left".
const SHAPE_WORD = /^\s+(?:shape|shaped|perm|permutation|case|pattern|points|pointing)\b/i;
// "an L", "a U": with an article in front, these two letters are shapes, not turns.
const SHAPE_ARTICLE = /\ban?\s+$/i;

function isShapeName(text: string, index: number, end: number, letter: string, suffix: string): boolean {
  if (suffix) return false;
  if (SHAPE_WORD.test(text.slice(end, end + 16))) return true;
  return (letter === 'L' || letter === 'U') && SHAPE_ARTICLE.test(text.slice(Math.max(0, index - 4), index));
}

function isBoundaryAfter(text: string, end: number): boolean {
  if (end >= text.length) return true;
  const next = text[end];
  if (WORD_CHAR.test(next)) return false;
  // "R'" followed by a letter ("R's") is a possessive, and "B.C." is an abbreviation.
  if ((next === "'" || next === '.') && end + 1 < text.length && /[A-Za-z]/.test(text[end + 1])) return false;
  if (next === "'") return false;
  return true;
}

function canonicalOf(letter: string, wide: string, suffix: string): string | null {
  // "R2'" and "R'2" are both a half turn.
  const amount = suffix.includes('2') ? '2' : suffix;
  try {
    return parseMove(`${letter}${wide}${amount}`).notation;
  } catch {
    return null;
  }
}

/**
 * Backtick spans (`` `R U` ``) as index ranges, with their backticks blanked so they are not read
 * as primes. A stray backtick after a letter is still a prime.
 */
function codeSpans(input: string): { text: string; spans: [number, number][] } {
  const spans: [number, number][] = [];
  const text = input.replace(/`([^`\n]+)`/g, (match, inner: string, offset: number) => {
    if (!/[URFDLBMESurfdlbxyz]/.test(inner)) return match;
    spans.push([offset + 1, offset + 1 + inner.length]);
    return ` ${inner} `;
  });
  return { text, spans };
}

interface Candidate extends MoveToken {
  end: number;
  /** Counts on its own: suffixed, in backticks, or a capital after a move verb. */
  explicit: boolean;
  /** Upper-case or suffixed: anchors a run of bare letters. */
  anchor: boolean;
}

/** Every move-notation token in `text`, in order. */
export function extractMoveTokens(input: string): MoveToken[] {
  const { text: unquoted, spans } = codeSpans(input);
  const text = unquoted.replace(PRIMES, "'");
  const inCode = (i: number) => spans.some(([a, b]) => i >= a && i < b);
  const found: Candidate[] = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const index = m.index ?? 0;
    const [raw, letter, wide] = m;
    let suffix = m[3] ?? '';
    const end = index + raw.length;
    if (!isBoundaryBefore(text, index) || !isBoundaryAfter(text, end)) continue;
    const upper = UPPER.test(letter);
    if (!upper && wide) continue; // "xw" and friends are not notation
    const code = inCode(index);
    if (upper && !wide && !code && isShapeName(text, index, end, letter, suffix)) continue;
    // 'F' in single quotes: the closing quote is not a prime.
    if (suffix === "'" && text[index - 1] === "'") suffix = '';
    // "(...) x2": a repeat count, not a rotation.
    if (letter === 'x' && suffix && /\)\s*$/.test(text.slice(0, index))) continue;
    const suffixed = suffix !== '' || wide !== '';
    const verb = upper && MOVE_VERB.test(text.slice(Math.max(0, index - 8), index));
    // "(F)": a capital alone in brackets is written as notation.
    const bracketed = upper && /[([]/.test(text[index - 1] ?? '') && /[)\]]/.test(text[end] ?? '');
    found.push({
      raw,
      canonical: canonicalOf(letter, wide, suffix),
      index,
      end,
      explicit: suffixed || code || verb || bracketed,
      anchor: upper || suffixed,
    });
  }

  // Group candidates into runs that touch (only spaces, commas or brackets between them).
  const runs: Candidate[][] = [];
  for (const t of found) {
    const run = runs.at(-1);
    const prev = run?.at(-1);
    if (run && prev && RUN_GAP.test(text.slice(prev.end, t.index))) run.push(t);
    else runs.push([t]);
  }
  return runs
    .flatMap((run) => {
      const moveLike = run.length >= 2 && run.some((t) => t.anchor);
      return run.filter((t) => t.explicit || moveLike);
    })
    .map(({ raw, canonical, index }) => ({ raw, canonical, index }));
}

// A bare move letter at the end of the text, perhaps followed by a gap: the next word decides
// whether it starts a run ("F R U") or is prose ("the F face").
const TRAILING_BARE = /(^|[^A-Za-z0-9_&\-/'.])([URFDLBMESurfdlbxyz])[\s,()[\]]*$/;

/**
 * How much of a reply that is still streaming can be shown now: up to the last space or line
 * break (a token is complete once whitespace follows it), minus a trailing bare move letter,
 * which is held back until the next word shows whether it is part of a sequence of moves.
 */
export function relayableLength(text: string): number {
  const cut = Math.max(text.lastIndexOf(' '), text.lastIndexOf('\n')) + 1;
  const held = TRAILING_BARE.exec(text.slice(0, cut));
  return held ? held.index + held[1].length : cut;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rejects a reply that names any move outside `allowed` (canonical notation). `names` are
 * phrases from the facts (case and stage names such as "Headlights (U)") that are blanked out
 * before the scan, so quoting a case name is never mistaken for a move.
 */
export function checkReplyMoves(
  text: string,
  allowed: ReadonlySet<string>,
  names: readonly string[] = []
): GuardResult {
  let scanned = text;
  for (const name of names.filter((n) => n.trim().length > 1)) {
    scanned = scanned.replace(new RegExp(escapeRegExp(name), 'gi'), (match) => ' '.repeat(match.length));
  }
  const tokens = extractMoveTokens(scanned);
  const offending = tokens.filter((t) => t.canonical === null || !allowed.has(t.canonical));
  return { ok: offending.length === 0, tokens, offending };
}
