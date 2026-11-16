/**
 * Cubyntra - Coach Move Guardrail
 * Necookie Labs (c) 2026
 *
 * The tutor engine picks every move; Claude only explains. This check finds every piece of move
 * notation in a reply and rejects the reply if any move is not part of the step (setup,
 * algorithm or repeated unit). A rejected reply is replaced by the built-in template.
 *
 * What counts as a move token:
 * - Upper-case face turns, wide turns and slices (`R`, `Rw`, `M`) with an optional `'` or `2`,
 *   standing alone: not glued to letters, digits, `-`, `&`, `/`, `.`+letter or a following
 *   apostrophe-letter. So "U-turn", "R&B", "R's" and "B.C." are words, and "I" is never a move.
 *   A bare letter used as a shape name ("L shape", "U perm", "an L") is not a move, and the step's own
 *   case and stage names ("Headlights (U)") are blanked out before the scan.
 * - Lower-case wide turns and rotations (`r`, `x`, `y`) only when they carry a `'` or `2`, or
 *   sit next to another move token: a lone lower-case letter is more likely a word or a label.
 * - A repeat count after a bracket, like "(R U R' U') x2", is not the rotation `x2`.
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

/** Every move-notation token in `text`, in order. */
export function extractMoveTokens(input: string): MoveToken[] {
  const text = input.replace(PRIMES, "'");
  const found: (MoveToken & { strong: boolean; end: number })[] = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const index = m.index ?? 0;
    const [raw, letter, wide] = m;
    let suffix = m[3] ?? '';
    const end = index + raw.length;
    if (!isBoundaryBefore(text, index) || !isBoundaryAfter(text, end)) continue;
    const lower = !UPPER.test(letter);
    if (lower && wide) continue; // "xw" and friends are not notation
    if (!lower && !wide && isShapeName(text, index, end, letter, suffix)) continue;
    // 'F' in single quotes: the closing quote is not a prime.
    if (suffix === "'" && text[index - 1] === "'") suffix = '';
    // "(...) x2": a repeat count, not a rotation.
    if (letter === 'x' && suffix && /\)\s*$/.test(text.slice(0, index))) continue;
    found.push({
      raw,
      canonical: canonicalOf(letter, wide, suffix),
      index,
      end,
      strong: !lower || suffix !== '',
    });
  }
  // A weak (bare lower-case) token counts only next to a strong one: "r U r'" yes, "a b c" no.
  const separatedBySpace = (a: { end: number }, b: { index: number }) =>
    /^[\s,()[\]]*$/.test(text.slice(a.end, b.index));
  return found
    .filter((t, i) => {
      if (t.strong) return true;
      const prev = found[i - 1];
      const next = found[i + 1];
      return (prev?.strong && separatedBySpace(prev, t)) || (next?.strong && separatedBySpace(t, next));
    })
    .map(({ raw, canonical, index }) => ({ raw, canonical, index }));
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
