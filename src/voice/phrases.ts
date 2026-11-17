/**
 * Cubyntra - Phrase bank (ADR-016)
 * Necookie Labs (c) 2026
 *
 * The fixed lines the tutor speaks: every move in both styles (plain-language names and "R
 * prime" notation), an intro for every stage of both methods, and the checkpoint lines (match,
 * praise, show it again, show me a face, the wrong face, a mismatch). With ElevenLabs each line
 * is generated once and kept in `data/voice/`, so narrating steps costs no credits after that
 * (`npm run voice:prewarm` makes them all at once). Free-form coach replies are not in the bank.
 *
 * Pure TypeScript: no DOM, Node or network imports.
 */

import { moveName } from '../cube/moveNames';
import { createMove } from '../cube/transforms';
import type { Face, Move, QuarterTurns } from '../cube/types';
import { BEGINNER_METHOD } from '../tutor/methods/beginner';
import { CFOP_FULL_METHOD, CFOP_METHOD } from '../tutor/methods/cfop';
import type { CheckpointStatus } from '../tutor/types';
import { spokenMove, type MoveSpeech } from './speechText';

export type PhraseKind = 'move' | 'stage' | 'checkpoint' | 'other';

export interface Phrase {
  id: string;
  kind: PhraseKind;
  text: string;
}

const FACES: readonly Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
const TURNS: readonly QuarterTurns[] = [1, -1, 2];

/** Every move the twin can play: face, wide, slice and whole-cube turns, each three ways. */
export function allMoves(): Move[] {
  const out: Move[] = [];
  for (const face of FACES) for (const q of TURNS) out.push(createMove({ kind: 'face', face }, q));
  for (const face of FACES) for (const q of TURNS) out.push(createMove({ kind: 'wide', face }, q));
  for (const slice of ['M', 'E', 'S'] as const) for (const q of TURNS) out.push(createMove({ kind: 'slice', slice }, q));
  for (const axis of ['x', 'y', 'z'] as const) for (const q of TURNS) out.push(createMove({ kind: 'rotation', axis }, q));
  return out;
}

const FACE_WORD: Record<Face, string> = { U: 'top', D: 'bottom', F: 'front', B: 'back', R: 'right', L: 'left' };

/** The fixed checkpoint and general lines, by id. */
export const LINES = {
  match: 'That matches. Block placed!',
  matchByHand: 'Great. Block placed!',
  praise1: 'Nice work!',
  praise2: 'You got it!',
  praise3: 'Great turning!',
  showAgain: 'I could not read that clearly. Show it to me again.',
  holdAsShown: 'Show it again, held the way the picture shows.',
  wrongFace: 'That is a different face.',
  oneMoreFace: 'One more face will tell me what happened.',
  mismatch: 'That does not match yet. Let us look at what happened.',
  solved: 'Solved! Every step checked.',
  doItNow: 'Now do it on your cube, then show me.',
  testVoice: 'Hi! I am your cube coach. Let us solve it together.',
} as const;

export type LineId = keyof typeof LINES;

const PRAISE: readonly LineId[] = ['praise1', 'praise2', 'praise3'];

export const movePhraseId = (move: Move, style: MoveSpeech) =>
  `move-${style}-${move.kind}-${move.kind === 'slice' ? move.slice : move.kind === 'rotation' ? move.axis : move.face}${move.quarterTurns}`;

/** The spoken line for a move in the student's style. */
export function movePhrase(move: Move, style: MoveSpeech): string {
  return style === 'words' ? moveName(move) : spokenMove(move, style);
}

/** "Show me the top face." */
export function showFacePhrase(face: Face): string {
  return `Show me the ${FACE_WORD[face]} face.`;
}

/** "Next stage: White cross." */
export function stagePhrase(stageName: string): string {
  return `Next stage: ${stageName}.`;
}

function buildBank(): Phrase[] {
  const phrases: Phrase[] = [];
  for (const style of ['words', 'notation'] as const) {
    for (const move of allMoves()) phrases.push({ id: movePhraseId(move, style), kind: 'move', text: movePhrase(move, style) });
  }
  for (const [i, method] of [BEGINNER_METHOD, CFOP_METHOD, CFOP_FULL_METHOD].entries()) {
    for (const stage of method.stages) phrases.push({ id: `stage-${i}-${stage.id}`, kind: 'stage', text: stagePhrase(stage.name) });
  }
  for (const face of FACES) phrases.push({ id: `show-${face}`, kind: 'checkpoint', text: showFacePhrase(face) });
  for (const [id, text] of Object.entries(LINES)) {
    phrases.push({ id, kind: id === 'testVoice' || id === 'doItNow' ? 'other' : 'checkpoint', text });
  }
  // One entry per distinct text: the cache is keyed by text, and a text spoken twice costs once.
  const seen = new Set<string>();
  return phrases.filter((p) => (seen.has(p.text) ? false : (seen.add(p.text), true)));
}

/** The whole bank, one entry per distinct text. */
export const PHRASES: readonly Phrase[] = buildBank();

const TEXTS: ReadonlySet<string> = new Set(PHRASES.map((p) => p.text));

/** True when `text` is a line of the bank (only these are cached on the laptop). */
export function isPhraseText(text: string): boolean {
  return TEXTS.has(text);
}

/** Characters in the whole bank: what generating it all once sends to ElevenLabs. */
export function phraseBankCharacters(phrases: readonly Phrase[] = PHRASES): number {
  return phrases.reduce((sum, p) => sum + p.text.length, 0);
}

/** What a checkpoint result says, reduced to what the voice needs. */
export interface CheckpointSpeechInput {
  status: CheckpointStatus;
  /** True when the student confirmed by hand ("It matches"). */
  manual?: boolean;
  /** The face to show next (asked again, the right face after a wrong one, or one more face). */
  askFace?: Face | null;
  /** The check could not tell which way up a face was held. */
  rotationUnclear?: boolean;
  /** The recovery wants one more face before deciding. */
  oneMoreFace?: boolean;
  /** Picks the praise line (e.g. the number of checkpoints passed). */
  praiseIndex?: number;
}

/**
 * The bank lines that say a checkpoint result, in order: a match with praise, show it again,
 * the wrong face and which face to show, or a mismatch (whose details the coach then explains).
 */
export function checkpointLines(input: CheckpointSpeechInput): string[] {
  const ask = input.askFace ? [showFacePhrase(input.askFace)] : [];
  switch (input.status) {
    case 'match':
      return [
        input.manual ? LINES.matchByHand : LINES.match,
        LINES[PRAISE[Math.abs(Math.trunc(input.praiseIndex ?? 0)) % PRAISE.length]],
      ];
    case 'uncertain':
      if (input.rotationUnclear) return [LINES.holdAsShown, ...ask];
      return [LINES.showAgain, ...ask];
    case 'wrong-face':
      return [LINES.wrongFace, ...ask];
    case 'mismatch':
      return input.oneMoreFace ? [LINES.mismatch, LINES.oneMoreFace, ...ask] : [LINES.mismatch];
  }
}
