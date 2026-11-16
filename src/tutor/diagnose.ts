/**
 * Cubyntra - Mistake Diagnosis
 * Necookie Labs (c) 2026
 *
 * When a checkpoint does not match, the student most likely slipped once while doing the plan's
 * moves. This module lists the slips a learner makes (a turn the other way, a move skipped or
 * done twice, the wrong side turned, the cube held the wrong way, stopping early or going round
 * once too often), replays each on the logical cube from the plan's `startState`, and ranks
 * the resulting cubes by how well they explain every sticker the camera read, not only the
 * check-spec ones.
 *
 * A candidate's cube is compared as the student would hold it for the check: turned so its
 * centers match the plan's `gripAfter`. Deterministic; no DOM, camera or vision imports.
 */

import { CubeState, Face, Move, QuarterTurns } from '../cube/types';
import { FACES, OPPOSITE_FACES } from '../cube/constants';
import { ORIENTATIONS } from '../cube/geometry';
import { gripOf, viewInGrip } from '../cube/grip';
import { moveName } from '../cube/moveNames';
import {
  applyMoves,
  createMove,
  moveFromReference,
  moveReferenceFace,
  parseAlgorithm,
} from '../cube/transforms';
import { MIN_STICKER_CONFIDENCE } from './checkpoint';
import {
  Diagnosis,
  FaceObservation,
  LikelyMistake,
  MistakeDetail,
  MistakeKind,
  StepPlan,
} from './types';

export interface DiagnoseOptions {
  /** How many mistakes to return (default 3). */
  topK?: number;
  /** Stickers read below this confidence never count against a mistake (default 0.5). */
  minConfidence?: number;
}

/** One slip and the moves the student would have done, before it is scored. */
export interface MistakeCandidate {
  kind: MistakeKind;
  detail?: MistakeDetail;
  moveIndex?: number;
  description: string;
  /** From `startState` held in the plan's `grip`. */
  performedMoves: Move[];
  /** Relative weight of this kind of slip before looking at the cube (1 = the most common). */
  prior: number;
}

/**
 * How common each slip is, relative to turning one move the wrong way. These only order
 * mistakes the camera cannot tell apart, and tip a close call; one clearly read sticker
 * outweighs any of them.
 */
export const MISTAKE_PRIORS = {
  wrongDirection: 1,
  stoppedAtRepeat: 0.8,
  extraRepeat: 0.7,
  skipped: 0.6,
  halfTurnOnce: 0.5,
  oppositeFaceMirrored: 0.5,
  wrongFront: 0.5,
  doubled: 0.4,
  upsideDown: 0.3,
  oppositeFace: 0.3,
  wideOrNarrow: 0.3,
  twoExtraRepeats: 0.3,
  stoppedEarly: 0.25,
  wholeCubeOrLayer: 0.2,
  otherGrip: 0.12,
  /** Two slips in one step: the product of both priors times this. */
  second: 0.3,
} as const;

/** A sticker read with full confidence is taken to be right this often. */
const MAX_READ_PROBABILITY = 0.98;
const CHANCE = 1 / 6;

/** Pairs of slips are only searched for plans up to this many moves. */
const MAX_MOVES_FOR_PAIRS = 30;

/** The first mistake must hold at least this share of belief for `confident`. */
const CONFIDENT_SHARE = 0.6;

const flip = (q: QuarterTurns): QuarterTurns => (q === 2 ? 2 : q === 1 ? -1 : 1);

const withTurns = (move: Move, quarterTurns: QuarterTurns): Move =>
  moveFromReference(move.kind, moveReferenceFace(move), quarterTurns);

/** `"turn the top to the left"`: a move as an instruction inside a sentence. */
function say(move: Move): string {
  const name = moveName(move);
  return `"${name.charAt(0).toLowerCase()}${name.slice(1)}"`;
}

const times = (n: number) => (n === 1 ? '1 time' : `${n} times`);

interface Edit {
  kind: MistakeKind;
  index: number;
  replacement: Move[];
  prior: number;
  description: string;
  /** Simple slips (direction, skip, double) are the ones combined into pairs. */
  simple: boolean;
}

/** Every single-move slip at position `index`. */
function editsAt(move: Move, index: number): Edit[] {
  const n = index + 1;
  const edits: Edit[] = [];
  const isRegrip = move.kind === 'rotation';
  const p = MISTAKE_PRIORS;
  const add = (kind: MistakeKind, replacement: Move[], prior: number, description: string, simple = false) =>
    edits.push({ kind: isRegrip && kind !== 'wrong-face' ? 'wrong-grip' : kind, index, replacement, prior, description, simple });

  if (move.quarterTurns !== 2) {
    add(
      'wrong-direction',
      [withTurns(move, flip(move.quarterTurns))],
      p.wrongDirection,
      `Move ${n} is ${say(move)}. You probably turned it the other way.`,
      true
    );
    add(
      'doubled-move',
      [withTurns(move, 2)],
      p.doubled,
      `Move ${n} is ${say(move)}. You probably did it twice.`,
      true
    );
  } else {
    for (const q of [1, -1] as const) {
      add(
        'skipped-move',
        [withTurns(move, q)],
        p.halfTurnOnce / 2,
        `Move ${n} is ${say(move)}. You probably turned it only once.`,
        true
      );
    }
  }
  add('skipped-move', [], p.skipped, `You probably skipped move ${n}: ${say(move)}.`, true);

  const instead = (other: Move, prior: number) =>
    add('wrong-face', [other], prior, `At move ${n} you probably did ${say(other)}. It should be ${say(move)}.`);

  const face = moveReferenceFace(move);
  const opposite = OPPOSITE_FACES[face];
  if (move.kind === 'face' || move.kind === 'wide') {
    // Right and left (top and bottom, front and back) mixed up: usually as a mirror image.
    instead(createMove({ kind: move.kind, face: opposite }, flip(move.quarterTurns)), p.oppositeFaceMirrored);
    if (move.quarterTurns !== 2) instead(createMove({ kind: move.kind, face: opposite }, move.quarterTurns), p.oppositeFace);
    // One layer instead of two, or two instead of one.
    instead(createMove({ kind: move.kind === 'face' ? 'wide' : 'face', face }, move.quarterTurns), p.wideOrNarrow);
    // The whole cube turned instead of one side.
    instead(moveFromReference('rotation', face, move.quarterTurns), p.wholeCubeOrLayer);
  } else if (move.kind === 'rotation') {
    // One side turned instead of the whole cube.
    instead(createMove({ kind: 'face', face }, move.quarterTurns), p.wholeCubeOrLayer);
  } else {
    // A middle layer: an outer layer next to it turned instead, or along with it.
    instead(createMove({ kind: 'face', face }, move.quarterTurns), p.wholeCubeOrLayer);
    instead(createMove({ kind: 'face', face: opposite }, flip(move.quarterTurns)), p.wholeCubeOrLayer);
    instead(createMove({ kind: 'wide', face }, move.quarterTurns), p.wholeCubeOrLayer);
    instead(createMove({ kind: 'wide', face: opposite }, flip(move.quarterTurns)), p.wholeCubeOrLayer);
  }
  return edits;
}

const planMoves = (plan: StepPlan): Move[] => [...plan.setupMoves, ...plan.algorithm];

const applyEdit = (moves: readonly Move[], edit: Edit): Move[] => [
  ...moves.slice(0, edit.index),
  ...edit.replacement,
  ...moves.slice(edit.index + 1),
];

/** The 23 other ways to hold the cube, as the regrip that leads to each. */
const OTHER_GRIPS: readonly Move[][] = ORIENTATIONS.filter((o) => o.rotation.length > 0).map((o) =>
  parseAlgorithm(o.rotation.join(' '))
);

/**
 * Every single slip considered for a plan, most common kinds first. Candidates that lead to
 * the same cube are all listed here; `diagnoseMistake` keeps the likeliest of each.
 */
export function enumerateMistakes(plan: StepPlan): MistakeCandidate[] {
  const moves = planMoves(plan);
  const total = moves.length;
  const setup = plan.setupMoves.length;
  const p = MISTAKE_PRIORS;
  const list: MistakeCandidate[] = [];

  // 1. One move turned the other way, skipped, doubled or swapped for a look-alike.
  const edits = moves.flatMap((move, index) => editsAt(move, index));
  for (const edit of edits) {
    list.push({
      kind: edit.kind,
      moveIndex: edit.index,
      description: edit.description,
      performedMoves: applyEdit(moves, edit),
      prior: edit.prior,
    });
  }

  // 2. A repeated sequence done too few or too many times.
  const repeat = plan.facts.repeat;
  if (repeat) {
    const unit = repeat.unit.length;
    for (let done = 0; done < repeat.times; done++) {
      list.push({
        kind: 'other',
        detail: 'stopped-early',
        moveIndex: setup + done * unit,
        description:
          done === 0
            ? `You probably have not done the sequence yet. Do it ${times(repeat.times)}.`
            : `You probably did the sequence ${times(done)}, not ${times(repeat.times)}.`,
        performedMoves: moves.slice(0, setup + done * unit),
        prior: p.stoppedAtRepeat,
      });
    }
    for (const extra of [1, 2]) {
      list.push({
        kind: 'other',
        detail: 'extra-repeat',
        description: `You probably did the sequence ${times(repeat.times + extra)}, not ${times(repeat.times)}.`,
        performedMoves: [...moves, ...Array.from({ length: extra }, () => repeat.unit).flat()],
        prior: extra === 1 ? p.extraRepeat : p.twoExtraRepeats,
      });
    }
  }

  // 3. Stopped part-way.
  for (let done = 0; done < total; done++) {
    list.push({
      kind: 'other',
      detail: 'stopped-early',
      moveIndex: done,
      description:
        done === 0
          ? 'It looks like the cube has not been turned yet.'
          : `You probably stopped after move ${done} of ${total}.`,
      performedMoves: moves.slice(0, done),
      prior: p.stoppedEarly,
    });
  }

  // 4. The cube held another way round from the start.
  for (const regrip of OTHER_GRIPS) {
    const held = gripOf(applyMoves(plan.startState, regrip));
    const prior =
      held.top === plan.grip.top ? p.wrongFront : held.front === plan.grip.front ? p.upsideDown : p.otherGrip;
    list.push({
      kind: 'wrong-grip',
      moveIndex: 0,
      description:
        `You probably started with ${held.top} on top and ${held.front} in front. ` +
        `This step starts with ${plan.grip.top} on top and ${plan.grip.front} in front.`,
      performedMoves: [...regrip, ...moves],
      prior,
    });
  }
  return list;
}

/** Two simple slips at different moves, cheapest way round: shared prefixes are replayed once. */
function enumeratePairs(plan: StepPlan): MistakeCandidate[] {
  const moves = planMoves(plan);
  if (moves.length > MAX_MOVES_FOR_PAIRS) return [];
  const simple = moves.map((move, index) => editsAt(move, index).filter((e) => e.simple));
  const list: MistakeCandidate[] = [];
  for (let i = 0; i < moves.length; i++) {
    for (const first of simple[i]) {
      for (let j = i + 1; j < moves.length; j++) {
        for (const second of simple[j]) {
          list.push({
            kind: 'other',
            detail: 'two-mistakes',
            moveIndex: i,
            description: `Two things probably went wrong. ${first.description} ${second.description}`,
            performedMoves: [
              ...moves.slice(0, i),
              ...first.replacement,
              ...moves.slice(i + 1, j),
              ...second.replacement,
              ...moves.slice(j + 1),
            ],
            prior: first.prior * second.prior * MISTAKE_PRIORS.second,
          });
        }
      }
    }
  }
  return list;
}

interface Seen {
  face: Face;
  index: number;
  color: string;
  /** Log-probability of this reading if the sticker really is / is not that color. */
  ifSame: number;
  ifOther: number;
  clear: boolean;
}

function readings(observations: readonly FaceObservation[], minConfidence: number): Seen[] {
  const latest = new Map<Face, FaceObservation>();
  for (const observation of observations) latest.set(observation.face, observation);
  const seen: Seen[] = [];
  for (const [face, observation] of latest) {
    observation.stickers.forEach((sticker, index) => {
      const confidence = Math.max(0, Math.min(1, sticker.confidence));
      const right = CHANCE + (MAX_READ_PROBABILITY - CHANCE) * confidence;
      seen.push({
        face,
        index,
        color: sticker.color,
        ifSame: Math.log(right),
        ifOther: Math.log((1 - right) / 5),
        clear: confidence >= minConfidence,
      });
    });
  }
  return seen;
}

const stateKey = (state: CubeState): string => FACES.map((f) => state[f].map((c) => c[0]).join('')).join('');

interface Scored extends MistakeCandidate {
  state: CubeState;
  key: string;
  /** What this cube shows on the observed stickers; equal signatures cannot be told apart. */
  signature: string;
  score: number;
  contradictions: number;
}

function scoreCandidate(plan: StepPlan, candidate: MistakeCandidate, seen: readonly Seen[]): Scored {
  const raw = applyMoves(plan.startState, candidate.performedMoves);
  const state = viewInGrip(raw, plan.gripAfter).state;
  let likelihood = 0;
  let contradictions = 0;
  let signature = '';
  for (const s of seen) {
    const color = state[s.face][s.index];
    signature += color[0];
    if (color === s.color) likelihood += s.ifSame;
    else {
      likelihood += s.ifOther;
      if (s.clear) contradictions++;
    }
  }
  return {
    ...candidate,
    state,
    key: stateKey(state),
    signature,
    score: likelihood + Math.log(candidate.prior),
    contradictions,
  };
}

/** Keeps the likeliest candidate for each distinct cube, dropping the cube the plan expects. */
function distinctCubes(scored: readonly Scored[], expectedKey: string): Scored[] {
  const best = new Map<string, Scored>();
  for (const candidate of scored) {
    if (candidate.key === expectedKey) continue;
    const held = best.get(candidate.key);
    if (!held || candidate.prior > held.prior) best.set(candidate.key, candidate);
  }
  return [...best.values()];
}

/**
 * Ranks the slips that fit what the checkpoint scan saw. Only mistakes that explain every
 * clearly read sticker are returned; an empty list means nothing considered fits and the cube
 * needs a full rescan. Pairs of slips are searched only when no single slip fits.
 */
export function diagnoseMistake(
  plan: StepPlan,
  observations: readonly FaceObservation[],
  options: DiagnoseOptions = {}
): Diagnosis {
  const topK = options.topK ?? 3;
  const seen = readings(observations, options.minConfidence ?? MIN_STICKER_CONFIDENCE);
  if (!seen.some((s) => s.clear)) return { likelyMistakes: [], confident: false };

  const expectedKey = stateKey(plan.expectedState);
  const score = (candidates: MistakeCandidate[]) =>
    distinctCubes(
      candidates.map((c) => scoreCandidate(plan, c, seen)),
      expectedKey
    );

  let cubes = score(enumerateMistakes(plan));
  if (!cubes.some((c) => c.contradictions === 0)) {
    const known = new Set(cubes.map((c) => c.key));
    cubes = [...cubes, ...score(enumeratePairs(plan)).filter((c) => !known.has(c.key))];
  }

  // Share of belief over every cube considered, fitting or not.
  const top = Math.max(...cubes.map((c) => c.score));
  const weights = cubes.map((c) => Math.exp(c.score - top));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const share = new Map(cubes.map((c, i) => [c.key, weights[i] / totalWeight]));

  const fitting = cubes
    .map((c, order) => ({ c, order }))
    .filter(({ c }) => c.contradictions === 0)
    .sort((x, y) => y.c.score - x.c.score || x.order - y.order)
    .map(({ c }) => c);
  if (!fitting.length) return { likelyMistakes: [], confident: false };

  const first = fitting[0];
  const lookAlikes = fitting.filter((c) => c.signature === first.signature);
  const confident = lookAlikes.length === 1 && share.get(first.key)! >= CONFIDENT_SHARE;

  const likelyMistakes: LikelyMistake[] = fitting.slice(0, topK).map((c) => ({
    kind: c.kind,
    ...(c.detail ? { detail: c.detail } : {}),
    ...(c.moveIndex !== undefined ? { moveIndex: c.moveIndex } : {}),
    confidence: Math.round(share.get(c.key)! * 1000) / 1000,
    description: c.description,
    performedMoves: c.performedMoves,
    resultingState: c.state,
    score: c.score,
    contradictions: c.contradictions,
  }));

  const diagnosis: Diagnosis = { likelyMistakes, confident };
  if (lookAlikes.length > 1) {
    const shown = new Set(seen.map((s) => s.face));
    let bestFace: Face | undefined;
    let bestCount = 1;
    for (const face of FACES) {
      if (shown.has(face)) continue;
      const count = new Set(lookAlikes.map((c) => c.state[face].join())).size;
      if (count > bestCount) {
        bestCount = count;
        bestFace = face;
      }
    }
    if (bestFace) diagnosis.showNext = bestFace;
  }
  return diagnosis;
}
