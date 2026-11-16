/**
 * Cubyntra - Coach Case Notes
 * Necookie Labs (c) 2026
 *
 * Teaching notes for every case id the tutor can plan (`allCaseIds()`): a recognition cue, the
 * idea plus a common mistake, and a fingertrick or practice tip. They are generated, not written
 * case by case: the full OLL and PLL tables supply each case's pattern, cycles, recognition and
 * algorithm, and a short hand-written note per group (or per stage, for cases without a table)
 * supplies the words. So the notes can never disagree with the tables.
 *
 * Move rules. The cue and the idea/mistake text name no moves at all (hint levels 1 and 2 never
 * show moves). The hand tip names only moves copied from the case's own algorithm. On top of
 * that, `caseTip` drops any sentence whose moves are not allowed for the facts it is sent with.
 *
 * These notes travel per request (`CoachFacts.caseTip`, and the templates), never in the cached
 * system prompt.
 */

import { parseAlgorithm } from '../cube/transforms';
import { F2L_CASES, F2LGroup } from '../tutor/cases/f2l';
import { OllCase, OllGroup, OLL_CASES } from '../tutor/cases/oll';
import { LastLayerCase, OLL_CORNER_CASES, OLL_EDGE_CASES } from '../tutor/cases/oll2look';
import { PllCase, PllGroup, PLL_CASES } from '../tutor/cases/pll';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from '../tutor/cases/pll2look';
import { allCaseIds, caseIdsByStage } from '../tutor/caseIds';
import type { MethodId } from '../tutor/types';
import { checkReplyMoves, extractMoveTokens } from './guard';
import type { CoachFacts } from './types';

export interface CaseNote {
  /** Hint level 1: a recognition cue. Names no moves. */
  look: string;
  /** Hint level 2: what the algorithm does and a common mistake. Names no moves. */
  idea: string;
  /** Hint level 3: a fingertrick or practice tip. Names only moves of the case's algorithm. */
  hands: string;
}

/** Hand-written words for a group of cases (or a stage); the generator adds the case's own data. */
interface GroupNote {
  look: string;
  idea: string;
  mistake: string;
  /** Used when the case has no table algorithm to derive tips from. */
  hands?: string;
}

// ---------------------------------------------------------------------------------------------
// Group notes
// ---------------------------------------------------------------------------------------------

const OLL_GROUPS: Readonly<Record<OllGroup, GroupNote>> = {
  Dot: {
    look: 'This is a dot case: no yellow edges on top, only the yellow center.',
    idea: 'Dot cases have the most to fix, so the algorithm is longer and the top looks messy half-way. That is normal.',
    mistake: 'The usual slip is starting a quarter turn off, so use the yellow bars and headlights on the sides to line it up.',
  },
  Square: {
    look: 'Look for a two-by-two square of yellow in one corner of the top.',
    idea: 'Two layers turn together to carry the square around, and the rest of the top drops into place.',
    mistake: 'The usual slip is turning only the outer layer where two layers should turn together.',
  },
  'Small lightning bolt': {
    look: 'The yellow on top makes a small zig-zag, like a lightning bolt.',
    idea: 'The algorithm swings the bolt around and fills in the missing yellow stickers.',
    mistake: 'Small lightning bolts come in mirror pairs, so check which way the bolt leans before you start.',
  },
  Fish: {
    look: 'The yellow on top looks like a fish: a diagonal body with a tail.',
    idea: 'The algorithm turns the fish into a full yellow top in one go.',
    mistake: 'Fish cases look alike, so compare the side stickers with the case description before you start.',
  },
  'Knight move': {
    look: 'The yellow on top makes a knight-move shape, like the jump of a chess knight.',
    idea: 'The algorithm flips the edges that are wrong and twists the corners in the same go.',
    mistake: 'Knight-move cases come in mirror pairs, so check where the yellow side stickers are before you start.',
  },
  Cross: {
    look: 'The yellow cross is already done. Only the corners are left, so count the yellow corners on top.',
    idea: 'The cross stays put while the algorithm twists the top corners until they all face up.',
    mistake: 'The usual slip is holding the case from the wrong side, so check where the yellow side stickers are.',
  },
  'Corners oriented': {
    look: 'All four corners are already yellow on top. Only some edges are not.',
    idea: 'The algorithm flips the top edges and leaves the yellow corners yellow.',
    mistake: 'It is easy to think the case is nearly done and rush it, so go at an even pace.',
  },
  Awkward: {
    look: 'This shape does not look like the others, so learn it by its yellow side stickers.',
    idea: 'The algorithm flips edges and twists corners together; the shape is odd but the moves flow.',
    mistake: 'Awkward cases come in mirror pairs, so check the side stickers carefully before you start.',
  },
  'P shapes': {
    look: 'The yellow on top makes a P-shape: a square block with one more sticker sticking out.',
    idea: 'The algorithm keeps the block together and flips the missing pieces up beside it.',
    mistake: 'P-shapes come in mirror pairs, so check which side the block is on before you start.',
  },
  'T shapes': {
    look: 'The yellow on top makes a T-shape.',
    idea: 'The algorithm flips the edges and turns the corners that are left, so the T fills out to a full top.',
    mistake: 'The usual slip is holding the T the wrong way round, so check where the yellow side stickers are.',
  },
  'C shapes': {
    look: 'The yellow on top makes a C-shape, like a horseshoe.',
    idea: 'The algorithm closes the C and finishes the top in one go.',
    mistake: 'The usual slip is holding the C facing the wrong way, so line it up as the case description says.',
  },
  'W shapes': {
    look: 'The yellow on top makes a W-shape, like a little staircase.',
    idea: 'The algorithm flattens the staircase into a full yellow top.',
    mistake: 'W-shapes come in mirror pairs, so check which way the steps go before you start.',
  },
  'Big lightning bolt': {
    look: 'The yellow on top makes a big zig-zag, like a large lightning bolt.',
    idea: 'The algorithm flips the edges and twists the corners together, and the bolt fills out to a full top.',
    mistake: 'Big lightning bolts come in mirror pairs, so check which way the bolt leans.',
  },
  'Small L': {
    look: 'The yellow edges make a small L-shape with the center.',
    idea: 'The algorithm flips the two other edges and twists the corners at the same time.',
    mistake: 'The usual slip is pointing the L-shape the wrong way, so check the side stickers too.',
  },
  Line: {
    look: 'The yellow edges make a line through the center.',
    idea: 'The algorithm flips the two other edges and twists the corners at the same time.',
    mistake: 'The usual slip is holding the line the wrong way: check whether it should run left to right or front to back.',
  },
};

const PLL_GROUPS: Readonly<Record<PllGroup, GroupNote>> = {
  'Corners only': {
    look: 'Only corners are out of place: the edges are already in the right order.',
    idea: 'Only the corners move.',
    mistake: 'The usual slip is starting from the wrong side, so find the side the case description names first.',
  },
  'Edges only': {
    look: 'Only edges are out of place: every side already has matching corners, like headlights.',
    idea: 'Only the edges move; the corners stay where they are.',
    mistake: 'The usual slip is mixing up the two directions an edge cycle can go, so check the middle stickers.',
  },
  'Adjacent corner swap': {
    look: 'Two corners next to each other need to swap: look for headlights or a solid bar on one side.',
    idea: 'Two corners on the same side swap places, and some edges move too.',
    mistake: 'The usual slip is holding the headlights or the bar on the wrong side before you start.',
  },
  'Diagonal corner swap': {
    look: 'Two corners across the top from each other need to swap: no side has headlights.',
    idea: 'Two corners swap across the top, and some edges move too.',
    mistake: 'These cases have no headlights to hold on to, so look for blocks of two instead.',
  },
  'G perms': {
    look: 'Three corners and three edges are out of place. There are headlights on one side and a block of two somewhere else.',
    idea: 'Three corners and three edges move round in circles at the same time.',
    mistake: 'The four G cases look alike: find the headlights first, then where the block of two is.',
  },
};

/** Cases of the 2-look last layer, by stage. */
const TWO_LOOK_STAGES: Readonly<Record<string, GroupNote>> = {
  'oll-edges': {
    look: 'Look only at the yellow edges on top: a dot, an L-shape or a line.',
    idea: 'The algorithm flips top edges over and leaves the two layers below as they were.',
    mistake: 'The usual slip is holding the shape the wrong way round: line it up as the case description says.',
  },
  'oll-corners': {
    look: 'The yellow cross is done. Count the yellow corners on top, then look for yellow on the sides.',
    idea: 'The algorithm twists the top corners in place while the yellow cross stays put.',
    mistake: 'The usual slip is holding the case from the wrong side, so check where the yellow side stickers are.',
  },
  'pll-corners': {
    look: 'Look round the sides for headlights: two corner stickers of the same color on one side.',
    idea: 'The algorithm swaps two corners, so afterwards every side has matching corners.',
    mistake: 'The usual slip is holding the headlights in the wrong place: they go where the case description says.',
  },
  'pll-edges': {
    look: 'Look for a side that is already a solid bar, and check where the other edges need to go.',
    idea: 'The algorithm moves only top edges around, leaving the corners where they are.',
    mistake: 'The usual slip is mixing up the two directions an edge cycle can go, so check the front edge.',
  },
};

const F2L_GROUPS: Readonly<Record<F2LGroup, GroupNote>> = {
  'easy-insert': {
    look: 'The corner and its edge are almost a pair already. Check that their colors line up.',
    idea: 'One short sequence joins them and drops the pair into its slot.',
    mistake: 'The usual slip is turning the top first when the pair is already lined up.',
  },
  'top-white-side': {
    look: 'Both pieces are on top and the white sticker on the corner faces sideways.',
    idea: 'The pieces are joined into a pair on top first, then the pair goes into the slot together.',
    mistake: 'The usual slip is turning the top the wrong way and splitting the pair, so watch where the edge goes.',
  },
  'top-white-up': {
    look: 'Both pieces are on top and the white sticker on the corner faces up.',
    idea: 'White facing up is awkward, so the corner is turned to face sideways before the pair is made.',
    mistake: 'The usual slip is trying to pair them straight away: the corner has to turn first.',
  },
  'corner-in-slot': {
    look: 'The corner is already in its slot and the edge is on top.',
    idea: 'The corner is lifted out or used where it is, then joined with the edge and put back.',
    mistake: 'The usual slip is forgetting that lifting the slot also moves the corner.',
  },
  'edge-in-slot': {
    look: 'The edge is already in its slot and the corner is on top.',
    idea: 'The edge is lifted out or used where it is, then joined with the corner and put back.',
    mistake: 'The usual slip is forgetting that lifting the slot also moves the edge.',
  },
  'both-in-slot': {
    look: 'Both pieces are in the slot already, but the pair is wrong.',
    idea: 'The pair is taken out, fixed on top, and put back the right way.',
    mistake: 'The usual slip is thinking it is finished: check both stickers of the edge and all three of the corner.',
  },
};

/** Cases without a table of their own, by `method:stage`. */
const STAGE_GROUPS: Readonly<Record<string, GroupNote>> = {
  'beginner:daisy': {
    look: 'Find a white edge sticker anywhere that is not next to the yellow center yet.',
    idea: 'Each white edge goes up next to the yellow center like a petal, without pushing out the petals already there.',
    mistake: 'The usual slip is pushing a petal that is already in place back down.',
    hands: 'Keep yellow on top the whole time and turn the side the white edge is on.',
  },
  'beginner:white-cross': {
    look: 'Read the side color of a petal, not just the white.',
    idea: 'An edge sits between two centers, so both of its colors must match them.',
    mistake: 'The usual slip is sending a petal down before its side color sits above the matching center.',
    hands: 'Turn the side twice with a firm grip so the petal goes all the way down.',
  },
  'beginner:white-corners': {
    look: 'Read all three colors of the corner to know which slot it belongs to.',
    idea: 'The short trigger lifts the slot, brings the corner in and puts the slot back, so the cross stays safe.',
    mistake: 'The usual slip is stopping before white faces down: keep repeating the trigger as the hint says.',
    hands: 'Keep the corner at the front-right and do the short trigger with your right hand at a steady rhythm.',
  },
  'beginner:middle-edges': {
    look: 'Find a top edge with no yellow on it and match its front color with the center below.',
    idea: 'The edge goes down into the middle layer and the white corner is put back, so the first layer survives.',
    mistake: 'The usual slip is going the wrong way: the top color of the edge tells you left or right.',
    hands: 'Keep white on the bottom and say the two short triggers out loud as you go.',
  },
  'beginner:yellow-cross': {
    look: 'Look only at the yellow edges on top: a dot, an L-shape or a line.',
    idea: 'The algorithm flips top edges without touching the two finished layers.',
    mistake: 'The usual slip is holding the L-shape or the line the wrong way round.',
    hands: 'Do the middle part as one smooth trigger, then finish with the front turn.',
  },
  'beginner:yellow-edges': {
    look: 'Turn the top and count how many top edges match the center below them.',
    idea: 'The algorithm swaps top edges and keeps the yellow cross.',
    mistake: 'The usual slip is holding the matching edges in the wrong place before you start.',
    hands: 'This algorithm is mostly right-hand turns and top turns, so keep your right hand on the right side.',
  },
  'beginner:yellow-corners-position': {
    look: 'Find a top corner that sits between the three centers of its colors, even if it is twisted.',
    idea: 'Three corners move round in a circle and the front-right one stays where it is.',
    mistake: 'The usual slip is checking only the yellow sticker: a twisted corner can still be in the right place.',
    hands: 'Hold the good corner at the front-right and keep it there for the whole algorithm.',
  },
  'beginner:yellow-corners-orient': {
    look: 'Bring a corner without yellow on top to the front-right.',
    idea: 'The trigger twists the corner. The lower layers look mixed up in between and fix themselves at the end.',
    mistake: 'The usual slip is turning the whole cube between corners: turn only the top.',
    hands: 'Keep the same grip from the first corner to the last, and turn only the top between corners.',
  },
  'cfop:cross': {
    look: 'Find the four white edges and plan where each one goes before you turn.',
    idea: 'Each white edge must match the white center and its side center.',
    mistake: 'The usual slip is solving one edge and knocking out another, so plan the order first.',
    hands: 'Keep white on the bottom and try to look ahead at the next edge while you turn.',
  },
  'cfop:f2l': {
    look: 'The piece you need is stuck in another slot. Find the slot it is in.',
    idea: 'Lifting the slot and putting it back swaps the stuck piece for a top piece you do not need yet.',
    mistake: 'The usual slip is lifting the wrong slot, so hold the stuck piece where the hint says.',
    hands: 'Lift, turn the top, and put the slot back in one smooth motion.',
  },
  'cfop:auf': {
    look: 'Everything is done except one turn of the top.',
    idea: 'The top layer is solved but sits a turn away from the sides below it.',
    mistake: 'The usual slip is turning the top the wrong way, so check which side matches first.',
    hands: 'Flick the top with one finger, then celebrate.',
  },
};

// ---------------------------------------------------------------------------------------------
// Facts derived from the tables
// ---------------------------------------------------------------------------------------------

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four'];

function count(n: number, noun: string): string {
  return `${NUMBER_WORDS[n] ?? n} ${noun}${n === 1 ? '' : 's'}`;
}

function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** "Quick check: one yellow edge and two yellow corners on top; a yellow bar on the left." */
export function ollQuickCheck(pattern: string): string {
  const rows = pattern.split('|');
  const top = rows.slice(1, 4).map((r) => r.slice(1, 4));
  const yellow = (r: number, c: number) => top[r][c] === 'x';
  const edges = [yellow(0, 1), yellow(1, 0), yellow(1, 2), yellow(2, 1)].filter(Boolean).length;
  const corners = [yellow(0, 0), yellow(0, 2), yellow(2, 0), yellow(2, 2)].filter(Boolean).length;
  const sides: [string, string][] = [
    ['the front', rows[4]],
    ['the right', rows.slice(1, 4).map((r) => r[4]).join('')],
    ['the back', rows[0]],
    ['the left', rows.slice(1, 4).map((r) => r[0]).join('')],
  ];
  const bars = sides.filter(([, s]) => s === 'xxx').map(([name]) => name);
  const lights = sides.filter(([, s]) => s === 'x.x').map(([name]) => name);
  const features: string[] = [];
  if (bars.length) features.push(`${bars.length === 1 ? 'a yellow bar' : 'yellow bars'} on ${listWords(bars)}`);
  if (lights.length) features.push(`yellow headlights on ${listWords(lights)}`);
  const tail = features.length ? `; ${features.join(' and ')}` : '; no side shows a full yellow bar or headlights';
  return `Quick check: ${count(edges, 'yellow edge')} and ${count(corners, 'yellow corner')} on top${tail}.`;
}

/** What `Front: ...` etc. say in a PLL recognition text, by side. */
function pllSides(recognition: string): [string, string][] {
  return [...recognition.matchAll(/\b(Front|Right|Back|Left): ([^.]+)\./g)].map((m) => [
    `the ${m[1].toLowerCase()}`,
    m[2].trim(),
  ]);
}

/** "Quick check: headlights on the left; a solid bar on the front." */
export function pllQuickCheck(recognition: string): string {
  const sides = pllSides(recognition);
  const lights = sides.filter(([, s]) => s.startsWith('headlights')).map(([n]) => n);
  const bars = sides.filter(([, s]) => s.startsWith('a solid bar')).map(([n]) => n);
  const blocks = sides.filter(([, s]) => s.startsWith('a block of two')).map(([n]) => n);
  const features: string[] = [];
  if (lights.length) features.push(`headlights on ${lights.length === 4 ? 'every side' : listWords(lights)}`);
  if (bars.length) features.push(`${bars.length === 1 ? 'a solid bar' : 'solid bars'} on ${listWords(bars)}`);
  if (!lights.length && !bars.length) {
    features.push(blocks.length ? `no headlights and no bar, but blocks of two on ${listWords(blocks)}` : 'no headlights, no bars and no blocks anywhere');
  }
  return `Quick check: ${features.join('; ')}.`;
}

/** "It swaps two corners and two edges." from cycles like `(UBR UFR) (UF UR)`. */
export function describeCycles(cycles: string): string {
  const groups = [...cycles.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim().split(/\s+/));
  const kind = (piece: string) => (piece.length === 3 ? 'corner' : 'edge');
  const parts: string[] = [];
  const pairs = new Map<string, number>();
  for (const g of groups) {
    if (g.length === 2) pairs.set(kind(g[0]), (pairs.get(kind(g[0])) ?? 0) + 1);
    else parts.push(`moves ${count(g.length, kind(g[0]))} round in a circle`);
  }
  for (const [k, n] of pairs) parts.unshift(n === 1 ? `swaps ${count(2, k)}` : `swaps ${count(n, `pair`)} of ${k}s`);
  return `It ${listWords(parts)}.`;
}

/** "It flips two edges and twists three corners." from an OLL pattern. */
function describeOrientation(pattern: string): string {
  const top = pattern.split('|').slice(1, 4).map((r) => r.slice(1, 4));
  const up = (cells: [number, number][]) => cells.filter(([r, c]) => top[r][c] === 'x').length;
  const edges = 4 - up([[0, 1], [1, 0], [1, 2], [2, 1]]);
  const corners = 4 - up([[0, 0], [0, 2], [2, 0], [2, 2]]);
  const parts: string[] = [];
  if (edges) parts.push(`flips ${count(edges, 'edge')}`);
  if (corners) parts.push(`twists ${count(corners, 'corner')}`);
  return parts.length ? `It ${listWords(parts)} so they show yellow on top.` : '';
}

// ---------------------------------------------------------------------------------------------
// Tips derived from the algorithm
// ---------------------------------------------------------------------------------------------

/** Well-known triggers, named only when they appear in the algorithm exactly as written. */
const TRIGGERS: readonly { moves: string; tip: string }[] = [
  { moves: "R U R' U R U2 R'", tip: 'is the Sune, one of the first algorithms speedcubers learn; let it roll.' },
  { moves: "R U2 R' U' R U' R'", tip: 'is the Anti-Sune; it is the Sune backwards.' },
  { moves: "R U R' U'", tip: 'is the most used trigger in cubing; practise it until your hands do it without thinking.' },
  { moves: "R' F R F'", tip: 'is the sledgehammer trigger; it comes up in many cases.' },
  { moves: "F R U R' U' F'", tip: 'is the yellow-cross algorithm from the beginner method, so you already know it.' },
  { moves: "r U R' U'", tip: 'is the classic trigger with the right side turned two layers deep.' },
];

function tokensOf(algorithm: string): string[] {
  return algorithm.trim().split(/\s+/).filter(Boolean);
}

function containsRun(algorithm: string, run: string): boolean {
  return ` ${tokensOf(algorithm).join(' ')} `.includes(` ${run} `);
}

/** Up to two fingertrick or practice tips, plus a chunking tip for long algorithms. */
export function handsTips(algorithm: string): string {
  const moves = tokensOf(algorithm);
  const has = (m: string) => moves.includes(m);
  const tips: string[] = [];
  const trigger = TRIGGERS.find((t) => containsRun(algorithm, t.moves));
  if (trigger) tips.push(`${trigger.moves} ${trigger.tip.charAt(0).toLowerCase()}${trigger.tip.slice(1)}`);
  const wide = moves.find((m) => /^[rlfbud]/.test(m));
  const slice = moves.find((m) => /^[MES]/.test(m));
  const d = moves.find((m) => /^D/.test(m));
  if (wide) tips.push(`For ${wide}, grip the outer layer and the middle layer together so both turn as one.`);
  if (slice) tips.push(`For ${slice}, hold the two outer sides still and flick only the middle layer with a ring finger.`);
  if (d && tips.length < 2) tips.push(`For ${d}, pull the bottom layer with a ring finger instead of moving your whole hand.`);
  if (has("U'") && tips.length < 2) tips.push("For U', push the top to the right with your left index finger, so your right hand stays put.");
  if (has('U2') && tips.length < 2) tips.push('For U2, flick the top twice in a row with your right index finger.');
  if (has('U') && tips.length < 2) tips.push('For U, flick the top to the left with your right index finger.');
  const kept = tips.slice(0, 2);
  const turns = parseAlgorithm(algorithm).length;
  if (turns >= 12) kept.push(`It is ${turns} moves long, so learn it in two or three chunks and practise each chunk until it flows.`);
  if (!kept.length) kept.push('Hold the cube lightly with your thumbs on the front and keep the same grip for the whole algorithm.');
  return kept.join(' ');
}

/** A common slip that the algorithm's own moves invite, in words (no move letters). */
function algorithmMistake(algorithm: string): string | undefined {
  const moves = tokensOf(algorithm);
  if (moves.some((m) => /^[MES]/.test(m))) return 'Watch the middle-layer turns: only the middle moves, and the sides stay still.';
  if (moves.some((m) => /^[rlfbud]/.test(m))) return 'Watch the wide turns: two layers move together, not just the outer one.';
  if (moves.some((m) => /^B/.test(m))) return 'Watch the back turns: clockwise for the back is judged from behind, so it feels backwards.';
  if (moves.some((m) => /^D/.test(m))) return 'Watch the bottom turns: clockwise for the bottom is judged from below, so it feels backwards.';
  if (moves.some((m) => /^L/.test(m))) return 'Watch the left-side turns: they go the opposite way to the right side for the same letter.';
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Building the notes
// ---------------------------------------------------------------------------------------------

function fromTable(group: GroupNote, algorithm: string, cue = '', idea = ''): CaseNote {
  return {
    look: [group.look, cue].filter(Boolean).join(' '),
    idea: [group.idea, idea, algorithmMistake(algorithm) ?? group.mistake].filter(Boolean).join(' '),
    hands: handsTips(algorithm),
  };
}

function fromGroup(group: GroupNote): CaseNote {
  return { look: group.look, idea: `${group.idea} ${group.mistake}`, hands: group.hands ?? '' };
}

function ollNote(c: OllCase): CaseNote {
  return fromTable(OLL_GROUPS[c.group], c.algorithm, ollQuickCheck(c.pattern), describeOrientation(c.pattern));
}

function pllNote(c: PllCase): CaseNote {
  return fromTable(PLL_GROUPS[c.group], c.algorithm, pllQuickCheck(c.recognition), describeCycles(c.cycles));
}

const TABLES: Readonly<Record<string, readonly LastLayerCase[]>> = {
  'oll-edges': OLL_EDGE_CASES,
  'oll-corners': OLL_CORNER_CASES,
  'pll-corners': PLL_CORNER_CASES,
  'pll-edges': PLL_EDGE_CASES,
};

function buildNotes(): Record<string, CaseNote> {
  const notes: Record<string, CaseNote> = {};
  for (const c of OLL_CASES) notes[c.id] = ollNote(c);
  for (const c of PLL_CASES) notes[c.id] = pllNote(c);
  for (const c of F2L_CASES) notes[c.id] = fromTable(F2L_GROUPS[c.group], c.algorithm);
  for (const [stage, cases] of Object.entries(TABLES)) {
    for (const c of cases) notes[c.id] ??= fromTable(TWO_LOOK_STAGES[stage], c.algorithm);
  }
  const variants: [MethodId, { lastLayer?: 'full' }][] = [['beginner', {}], ['cfop', {}], ['cfop', { lastLayer: 'full' }]];
  for (const [method, options] of variants) {
    for (const [stage, ids] of Object.entries(caseIdsByStage(method, options))) {
      const group = STAGE_GROUPS[`${method}:${stage}`];
      if (group) for (const id of ids) notes[id] ??= fromGroup(group);
    }
  }
  return notes;
}

/** Notes for every case id the tutor can plan (checked against `allCaseIds()` in the tests). */
export const CASE_NOTES: Readonly<Record<string, CaseNote>> = buildNotes();

/** Notes for one case, or undefined for an id the tutor does not know. */
export function caseNote(caseId: string): CaseNote | undefined {
  return Object.prototype.hasOwnProperty.call(CASE_NOTES, caseId) ? CASE_NOTES[caseId] : undefined;
}

/** Ids the tutor can plan that have no notes (empty when coverage is complete). */
export function caseIdsWithoutNotes(): string[] {
  return allCaseIds().filter((id) => !caseNote(id));
}

function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()) ?? (text.trim() ? [text.trim()] : []);
}

/**
 * The note for the facts' case at their hint level: the cue at level 1, the idea and a common
 * mistake at level 2, the hand tip at level 3. Sentences that would break the move guardrail
 * are dropped: any move at levels 1 and 2, or a move outside `allowed` at level 3.
 */
export function caseTip(
  facts: Pick<CoachFacts, 'caseId' | 'hintLevel' | 'caseName' | 'stageName'>,
  allowed: ReadonlySet<string>
): string | undefined {
  const note = caseNote(facts.caseId);
  if (!note) return undefined;
  const text = facts.hintLevel === 1 ? note.look : facts.hintLevel === 2 ? note.idea : note.hands;
  const names = [facts.caseName, facts.stageName];
  const kept = sentences(text).filter((s) =>
    facts.hintLevel === 3 ? checkReplyMoves(s, allowed, names).ok : extractMoveTokens(s).length === 0
  );
  return kept.length ? kept.join(' ') : undefined;
}
