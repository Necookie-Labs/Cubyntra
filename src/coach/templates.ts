/**
 * Cubyntra - Coach Templates
 * Necookie Labs (c) 2026
 *
 * Deterministic hint text for any step at every hint level. Served in mock mode (no API key),
 * when the monthly cap is reached, and whenever Claude's reply is refused, cut off, fails the
 * move guardrail or errors. The text is built from the plan's own facts (goal, lookFor, why,
 * case and stage names, setup and algorithm moves), so it works for any stage or case the tutor
 * produces, including ones the coach has never heard of. Stage notes only fill gaps; case notes
 * (`caseNotes.ts`) add a cue, a common mistake or a fingertrick for the case. Templates
 * only ever name moves from the facts, so they always pass the guardrail.
 */

import { caseTip } from './caseNotes';
import { allowedMoves, describeMoves, taughtMoves } from './facts';
import { stageNote } from './stages';
import { CoachFacts, MistakeKind } from './types';

const MISTAKE_TIPS: Record<MistakeKind, string> = {
  'wrong-direction': 'Last time one turn probably went the wrong way. Watch the arrow for each turn.',
  'skipped-move': 'Last time a turn was probably skipped. Go slowly and count each turn.',
  'doubled-move': 'Last time a turn was probably done twice. Count each turn as you go.',
  'wrong-face': 'Last time a different side was probably turned. Check which side the arrow is on.',
  'wrong-grip': 'Last time the cube was probably held a different way. Check the top and front colors first.',
  other: 'The last try did not match. Undo back to the start of the step and try again slowly.',
};

function sentence(text: string): string {
  const t = text.trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function gripSentence(facts: CoachFacts): string {
  return `Hold the cube with ${facts.grip.top} on top and ${facts.grip.front} facing you.`;
}

function movesSentence(facts: CoachFacts): string {
  const parts: string[] = [];
  if (facts.setupMoves) parts.push(`First line it up: ${facts.setupMoves}.`);
  if (facts.repeat) {
    parts.push(`${facts.setupMoves ? 'Then do' : 'Do'} ${facts.repeat.unit}, ${facts.repeat.times} times in a row.`);
  } else {
    parts.push(`${facts.setupMoves ? 'Then do' : 'Do'}: ${facts.algorithm}.`);
  }
  return parts.join(' ');
}

/** "In words: R = turn the right side up, U = turn the top to the left." */
function wordsSentence(facts: CoachFacts): string {
  const words = facts.moveWords?.length ? facts.moveWords : describeMoves(taughtMoves(facts));
  return words.length ? `In words: ${words.join(', ')}.` : '';
}

function mistakeSentence(facts: CoachFacts): string | null {
  const diagnosis = facts.diagnosis;
  const top = diagnosis?.likelyMistakes[0];
  if (diagnosis && top) {
    // The tutor's own words ("Move 3 is ... You probably turned it the other way.") when sure.
    const said = diagnosis.confident && top.description ? sentence(top.description) : MISTAKE_TIPS[top.kind];
    const show = !diagnosis.confident && diagnosis.showNext ? ` If it still does not match, show ${diagnosis.showNext} to the camera.` : '';
    return said + show;
  }
  const last = facts.attempts.at(-1);
  if (last?.result === 'mismatch') return MISTAKE_TIPS[last.mistakes?.[0] ?? 'other'];
  return null;
}

/** The case's teaching note for this level, recomputed so a template never trusts the field. */
function caseTipSentence(facts: CoachFacts): string {
  return sentence(caseTip(facts, allowedMoves(facts)) ?? '');
}

function caseSentence(facts: CoachFacts): string {
  const caseName = facts.caseName.trim();
  const stageName = facts.stageName.trim();
  if (!caseName || caseName.toLowerCase() === stageName.toLowerCase()) {
    return stageName ? `This step is part of ${stageName}.` : '';
  }
  return stageName ? `This is ${caseName}, part of ${stageName}.` : `This is ${caseName}.`;
}

/** True when the stage has teaching notes of its own (otherwise the plan's facts are used alone). */
export function hasStageTemplate(method: CoachFacts['method'], stage: string): boolean {
  return stageNote(method, stage) !== undefined;
}

/**
 * The template reply for a hint request. Level 1: what to look for. Level 2: why it works.
 * Level 3: the exact moves, each with its plain-language name. A tip about the last mistake
 * comes first when there is one.
 */
export function templateText(facts: CoachFacts): string {
  const stage = stageNote(facts.method, facts.stage);
  const lines: string[] = [];
  const mistake = mistakeSentence(facts);
  if (mistake) lines.push(mistake);

  if (facts.hintLevel === 1) {
    lines.push(sentence(facts.goal));
    lines.push(sentence(facts.lookFor) || stage?.lookTip || 'Look at the pieces lit up on the cube.');
    lines.push(caseTipSentence(facts));
    lines.push('Can you spot it?');
  } else if (facts.hintLevel === 2) {
    lines.push(caseSentence(facts));
    lines.push(sentence(facts.why) || stage?.whyTip || sentence(facts.goal));
    lines.push(caseTipSentence(facts));
  } else {
    lines.push(gripSentence(facts));
    lines.push(movesSentence(facts));
    lines.push(wordsSentence(facts));
    lines.push(caseTipSentence(facts));
    lines.push('Then show the cube to the camera to check.');
  }
  return lines.filter(Boolean).join(' ');
}

/** Short notices shown with a template reply. */
export const NOTICES = {
  mock: 'The AI coach is off (no API key), so you are seeing the built-in hints.',
  capped: 'The AI coach reached its monthly limit, so you are seeing the built-in hints.',
  fallback: 'The AI coach could not answer this time, so here is the built-in hint.',
} as const;
