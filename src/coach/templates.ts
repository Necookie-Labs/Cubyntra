/**
 * Cubyntra - Coach Templates
 * Necookie Labs (c) 2026
 *
 * Deterministic hint text for every stage and case, at every hint level. Served in mock mode (no
 * API key), when the monthly cap is reached, and whenever Claude's reply is refused, cut off,
 * fails the move guardrail or errors. Templates only ever name moves from the facts, so they
 * always pass the guardrail.
 */

import { F2L_CASES } from '../tutor/cases/f2l';
import { OLL_CORNER_CASES, OLL_EDGE_CASES } from '../tutor/cases/oll2look';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from '../tutor/cases/pll2look';
import { stageNote } from './stages';
import { CoachFacts, MistakeKind } from './types';

export interface CaseNote {
  name: string;
  /** What the student sees for this case. */
  recognition: string;
}

/** Cases the engine produces outside the F2L / OLL / PLL tables. */
const ENGINE_CASES: Record<string, CaseNote> = {
  cross: {
    name: 'White cross',
    recognition: 'Find the white edges and where each one belongs on the bottom.',
  },
  'f2l-extract-corner': {
    name: 'Free a stuck corner',
    recognition: 'The white corner is stuck in the wrong slot. Take it out to the top first.',
  },
  'f2l-extract-edge': {
    name: 'Free a stuck edge',
    recognition: 'The edge is stuck in the wrong slot. Take it out to the top first.',
  },
  'auf-u': { name: 'Line up the top', recognition: 'The top is finished; one turn lines it up.' },
  "auf-u'": { name: 'Line up the top', recognition: 'The top is finished; one turn lines it up.' },
  'auf-u2': { name: 'Line up the top', recognition: 'The top is finished; a half turn lines it up.' },
  'yellow-corner-twist-2': {
    name: 'Twist a corner (2 rounds)',
    recognition: 'The front-right top corner shows yellow on the right side.',
  },
  'yellow-corner-twist-4': {
    name: 'Twist a corner (4 rounds)',
    recognition: 'The front-right top corner shows yellow on the front.',
  },
  'yellow-corners-align': {
    name: 'Line up the top',
    recognition: 'The whole top is yellow; one more turn of the top finishes the cube.',
  },
};

/** Every case the coach has a dedicated note for: the case tables plus the engine's own cases. */
export const CASE_NOTES: Readonly<Record<string, CaseNote>> = Object.freeze({
  ...Object.fromEntries(
    [...F2L_CASES, ...OLL_EDGE_CASES, ...OLL_CORNER_CASES, ...PLL_CORNER_CASES, ...PLL_EDGE_CASES].map((c) => [
      c.id,
      { name: c.name, recognition: c.recognition },
    ])
  ),
  ...ENGINE_CASES,
});

const MISTAKE_TIPS: Record<MistakeKind, string> = {
  'wrong-direction': 'Last time one turn probably went the wrong way. Watch the arrow for each turn.',
  'skipped-move': 'Last time a turn was probably skipped. Go slowly and count each turn.',
  'doubled-move': 'Last time a turn was probably done twice. Count each turn as you go.',
  'wrong-face': 'Last time a different side was probably turned. Check which side the arrow is on.',
  'wrong-grip': 'Last time the cube was probably held a different way. Check the top and front colors first.',
  other: 'The last try did not match. Undo back to the start of the step and try again slowly.',
};

function gripSentence(facts: CoachFacts): string {
  return `Hold the cube with ${facts.grip.top} on top and ${facts.grip.front} facing you.`;
}

function movesSentence(facts: CoachFacts): string {
  const parts: string[] = [];
  if (facts.setupMoves) parts.push(`First line it up: ${facts.setupMoves}.`);
  if (facts.repeat) {
    parts.push(`Then do ${facts.repeat.unit}, ${facts.repeat.times} times in a row.`);
  } else {
    parts.push(`${facts.setupMoves ? 'Then do' : 'Do'}: ${facts.algorithm}.`);
  }
  return parts.join(' ');
}

function mistakeSentence(facts: CoachFacts): string | null {
  const top = facts.diagnosis?.likelyMistakes[0]?.kind;
  if (top) return MISTAKE_TIPS[top];
  const last = facts.attempts.at(-1);
  if (last?.result === 'mismatch') return MISTAKE_TIPS[last.mistakes?.[0] ?? 'other'];
  return null;
}

/** True when the stage has its own teaching notes (otherwise the plan's facts are used alone). */
export function hasStageTemplate(method: CoachFacts['method'], stage: string): boolean {
  return stageNote(method, stage) !== undefined;
}

/** True when the case has its own recognition note. */
export function hasCaseTemplate(caseId: string): boolean {
  return Object.prototype.hasOwnProperty.call(CASE_NOTES, caseId);
}

/**
 * The template reply for a hint request. Level 1: what to look for. Level 2: why it works.
 * Level 3: the exact moves. A tip about the last mistake comes first when there is one.
 */
export function templateText(facts: CoachFacts): string {
  const stage = stageNote(facts.method, facts.stage);
  const caseNote = hasCaseTemplate(facts.caseId) ? CASE_NOTES[facts.caseId] : undefined;
  const lines: string[] = [];
  const mistake = mistakeSentence(facts);
  if (mistake) lines.push(mistake);

  if (facts.hintLevel === 1) {
    lines.push(facts.goal);
    lines.push(stage?.lookTip ?? 'Look at the pieces lit up on the cube.');
    const look = caseNote?.recognition ?? facts.lookFor;
    if (look !== stage?.lookTip) lines.push(look);
  } else if (facts.hintLevel === 2) {
    lines.push(`This is ${caseNote?.name ?? facts.caseName}, part of ${facts.stageName}.`);
    lines.push(facts.why);
    if (stage && stage.whyTip !== facts.why) lines.push(stage.whyTip);
  } else {
    lines.push(gripSentence(facts));
    lines.push(movesSentence(facts));
    lines.push('Then show the cube to the camera to check.');
  }
  return lines.join(' ');
}

/** Short notices shown with a template reply. */
export const NOTICES = {
  mock: 'The AI coach is off (no API key), so you are seeing the built-in hints.',
  capped: 'The AI coach reached its monthly limit, so you are seeing the built-in hints.',
  fallback: 'The AI coach could not answer this time, so here is the built-in hint.',
} as const;
