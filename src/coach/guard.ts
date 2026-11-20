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
 *
 * Condensed notation. A word made only of move units, glued together or joined by hyphens, is
 * read unit by unit: "RUR'U'", "R-U-R'-U'", "R2U". It counts as moves when it has a prime, a
 * count or a hyphen and at least one capital; a plain capital word ("URL", "FUR", "BUD") counts
 * only next to other moves ("Do RU R' U'"). A count other than 2 is a number of quarter turns
 * ("R3" is `R'`); a count that comes to no turn at all ("R4") cannot be checked and so is
 * rejected. "F2L", "3x3" and possessives ("R's") stay words; `x` with a count other than 2 is a
 * repeat count ("x3").
 *
 * Chat answers ("Ask the coach") use `checkChatMoves` instead: any sequence of two or more moves
 * must be a contiguous run of the step's setup and algorithm, and a lone move outside the step
 * is allowed only where the sentence explains notation ("D' means ..."). See the end of the file.
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
  /** Units of one condensed word share a word id; a run needs two words to be move-like. */
  word: number;
}

// One unit of a condensed word: a letter, an optional `w`, then an optional count and prime.
const UNIT = /([URFDLBMESurfdlbxyz])(w?)(\d+'?|'\d*)?/y;
// A maximal word for the condensed scan: letters, digits, primes and hyphens.
const CONDENSED_WORD = /[A-Za-z0-9'-]+/g;
// Cube words that look like notation.
const NOT_NOTATION = /^(?:F2L|[23]x[23])$/i;

/** Canonical move for a count of quarter turns (`R3` is `R'`), or null for no turn at all. */
function canonicalOfCount(letter: string, wide: string, suffix: string): string | null {
  const digits = suffix.replace("'", '');
  if (!digits) return canonicalOf(letter, wide, suffix);
  let turns = Number(digits) % 4;
  if (suffix.includes("'")) turns = (4 - turns) % 4;
  if (turns === 0) return null;
  return canonicalOf(letter, wide, turns === 1 ? '' : turns === 2 ? '2' : "'");
}

interface CondensedUnit {
  raw: string;
  letter: string;
  wide: string;
  suffix: string;
  index: number;
  end: number;
}

/** The units of a condensed word, or null if the word is not made only of move units. */
function splitCondensed(word: string, offset: number): { units: CondensedUnit[]; hyphen: boolean } | null {
  const units: CondensedUnit[] = [];
  let hyphen = false;
  let i = 0;
  while (i < word.length) {
    if (units.length && word[i] === '-') {
      hyphen = true;
      i++;
    }
    UNIT.lastIndex = i;
    const m = UNIT.exec(word);
    if (!m) return null;
    const [raw, letter, wide] = m;
    if (wide && !UPPER.test(letter)) return null;
    units.push({ raw, letter, wide, suffix: m[3] ?? '', index: offset + i, end: offset + i + raw.length });
    i += raw.length;
  }
  return units.length ? { units, hyphen } : null;
}

/**
 * Move units inside condensed or hyphenated words ("RUR'U'", "R-U-R'-U'") and counted turns
 * ("R3"), which the letter-by-letter scan skips because the letters touch.
 */
function condensedCandidates(text: string, nextWord: () => number): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(CONDENSED_WORD)) {
    let word = m[0];
    let offset = m.index ?? 0;
    // An opening quote is not part of the word; a closing one is tried both ways below.
    while (word.startsWith("'")) {
      word = word.slice(1);
      offset++;
    }
    if (!word || NOT_NOTATION.test(word)) continue;
    let split = splitCondensed(word, offset);
    if (!split && word.endsWith("'")) split = splitCondensed(word.slice(0, -1), offset);
    if (!split) continue;
    const { units, hyphen } = split;
    // "R's", "U'r": an apostrophe before a lower-case letter makes a possessive or contraction.
    if (/'[a-z]/.test(word)) continue;
    const suffixed = units.some((u) => u.suffix || u.wide);
    if (units.length === 1) {
      // A single unit is the letter scan's job, except a count it does not read ("R3", "U0").
      const [u] = units;
      const digits = u.suffix.replace("'", '');
      if (!digits || digits === '2') continue;
      // "x3": a repeat count, not a rotation.
      if (u.letter === 'x') continue;
      out.push({ raw: u.raw, canonical: canonicalOfCount(u.letter, u.wide, u.suffix), index: u.index, end: u.end, explicit: true, anchor: true, word: nextWord() });
      continue;
    }
    const capital = units.some((u) => UPPER.test(u.letter));
    if (!capital) continue;
    const explicit = suffixed || hyphen;
    const word_ = nextWord();
    for (const u of units) {
      out.push({
        raw: u.raw,
        canonical: canonicalOfCount(u.letter, u.wide, u.suffix),
        index: u.index,
        end: u.end,
        explicit,
        anchor: true,
        word: word_,
      });
    }
  }
  return out;
}

/** Every move-notation token in `text`, in order. */
export function extractMoveTokens(input: string): MoveToken[] {
  const { text: unquoted, spans } = codeSpans(input);
  const text = unquoted.replace(PRIMES, "'");
  const inCode = (i: number) => spans.some(([a, b]) => i >= a && i < b);
  let words = 0;
  const nextWord = () => words++;
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
      word: nextWord(),
    });
  }
  const seen = new Set(found.map((t) => t.index));
  for (const t of condensedCandidates(text, nextWord)) if (!seen.has(t.index)) found.push(t);
  found.sort((a, b) => a.index - b.index);

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
      // A plain capital word ("URL") on its own is not a run: it needs a neighbour.
      const moveLike = run.length >= 2 && run.some((t) => t.anchor) && new Set(run.map((t) => t.word)).size >= 2;
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

// ---------------------------------------------------------------------------------------------
// Chat guardrail ("Ask the coach")
// ---------------------------------------------------------------------------------------------

/** A run of move tokens written together ("R U R' U'", "RUR'U'"). */
export interface MoveRun {
  tokens: MoveToken[];
  /** Canonical notation of each token (null where it cannot be parsed). */
  moves: (string | null)[];
}

export interface ChatGuardResult {
  ok: boolean;
  runs: MoveRun[];
  /** Runs that broke a rule (a sequence that is not the plan's, or a lone move out of context). */
  offending: MoveRun[];
}

// Between two tokens of one run: spaces, commas, brackets or the hyphen of "R-U-R'".
const CHAT_RUN_GAP = /^[\s,()[\]-]*$/;
// "R' means ...", "R = ...", "R stands for ...", "R is short for ...", "R is the right side".
const NOTATION_AFTER = /^\s*["'”]?\s*(?:means\b|meaning\b|stands\s+for\b|is\s+short\s+for\b|=|is\s+(?:a|an|the|one|just|when|how|what|where)\b|tells\s+you\b|says\b|turns\b)/i;
// "a letter like R'", "for example R2", "written as U'", "the move R'".
const NOTATION_BEFORE =
  /(?:\bletters?|\bnotation|\bwritten(?:\s+as)?|\blike|\bsuch\s+as|\bexample,?|\be\.g\.,?|\bcalled|\bsymbol|\bversus|\bvs\.?)\s*["'“`]?\s*$/i;

// A sentence that explains what moves mean, e.g. "F' undoes F", "F is clockwise, F' is counter-clockwise".
const NOTATION_SENTENCE =
  /\b(?:means?|meaning|prime|clockwise|counter-?clockwise|anti-?clockwise|opposite|reverses?|reversed|undoes|undo|inverse|the\s+other\s+way|other\s+direction|stands\s+for|notation|letter)\b/i;
// An instruction right before a move ("do D", "now turn D2", "then try L") is never an explanation.
const INSTRUCTION_BEFORE = /\b(?:do|doing|turn|turning|now|then|next|try|make|perform|apply|use|start\s+with|finish\s+with)\s+(?:the\s+|a\s+)?["'“`(]?\s*$/i;

/** The sentence around `index` (split at . ! ? and line breaks). */
function sentenceAround(text: string, index: number): { sentence: string; start: number } {
  const start = Math.max(text.lastIndexOf('.', index - 1), text.lastIndexOf('!', index - 1), text.lastIndexOf('?', index - 1), text.lastIndexOf('\n', index - 1)) + 1;
  const ends = ['.', '!', '?', '\n'].map((c) => text.indexOf(c, index)).filter((i) => i !== -1);
  const end = ends.length ? Math.min(...ends) : text.length;
  return { sentence: text.slice(start, end), start };
}

/** Splits move tokens into runs written together (only spaces, commas, brackets or hyphens between them). */
export function moveRuns(text: string, tokens: readonly MoveToken[]): MoveRun[] {
  const runs: MoveRun[] = [];
  let prevEnd = -1;
  for (const t of tokens) {
    const run = runs.at(-1);
    if (run && CHAT_RUN_GAP.test(text.slice(prevEnd, t.index))) {
      run.tokens.push(t);
      run.moves.push(t.canonical);
    } else {
      runs.push({ tokens: [t], moves: [t.canonical] });
    }
    prevEnd = t.index + t.raw.length;
  }
  return runs;
}

/** True when `run` appears, in order and without gaps, inside `sequence`. */
export function isContiguousRun(run: readonly string[], sequence: readonly string[]): boolean {
  if (!run.length || run.length > sequence.length) return false;
  for (let start = 0; start + run.length <= sequence.length; start++) {
    if (run.every((m, i) => sequence[start + i] === m)) return true;
  }
  return false;
}

/**
 * The chat guardrail. Claude may answer questions about notation, so the rules differ from the
 * hint guard (`checkReplyMoves`, unchanged):
 * - a sequence of two or more moves must be a contiguous run of the plan's own moves (`sequence`:
 *   setup moves then the algorithm, canonical), so no invented or reordered sequence can appear;
 * - a single move is allowed when it is one of the step's moves (`allowed`), or, for any other
 *   move, when the sentence explains notation around it ("R' means turn the right side down",
 *   "a letter like U2", "F' undoes F", "F is clockwise, F' is counter-clockwise"). A lone move
 *   outside the step with no such context, or one told as an instruction ("Now do D.",
 *   "Turn D the other way."), fails.
 * Moves that cannot be parsed always fail. `names` (case and stage names) are blanked first.
 */
export function checkChatMoves(
  text: string,
  sequence: readonly string[],
  allowed: ReadonlySet<string>,
  names: readonly string[] = []
): ChatGuardResult {
  let scanned = text;
  for (const name of names.filter((n) => n.trim().length > 1)) {
    scanned = scanned.replace(new RegExp(escapeRegExp(name), 'gi'), (match) => ' '.repeat(match.length));
  }
  const normalised = codeSpans(scanned).text.replace(PRIMES, "'");
  const runs = moveRuns(normalised, extractMoveTokens(scanned));
  const offending = runs.filter((run) => {
    if (run.moves.some((m) => m === null)) return true;
    const moves = run.moves as string[];
    if (moves.length >= 2) return !isContiguousRun(moves, sequence);
    const [token] = run.tokens;
    if (allowed.has(moves[0])) return false;
    const end = token.index + token.raw.length;
    const after = normalised.slice(end, end + 24);
    const before = normalised.slice(Math.max(0, token.index - 24), token.index);
    if (NOTATION_AFTER.test(after) || NOTATION_BEFORE.test(before)) return false;
    // A sentence that explains notation may name moves next to each other's meaning
    // ("F' undoes F"), unless the move is being told to the student ("now do D").
    const { sentence, start } = sentenceAround(normalised, token.index);
    const lead = sentence.slice(0, token.index - start);
    return !(NOTATION_SENTENCE.test(sentence) && !INSTRUCTION_BEFORE.test(lead));
  });
  return { ok: offending.length === 0, runs, offending };
}
