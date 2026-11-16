/**
 * Cubyntra - Coach Case Notes Tests
 * Necookie Labs (c) 2026
 *
 * Every case id the tutor can plan has teaching notes, the notes agree with the case tables,
 * and templates built with them pass the move guardrail at every hint level.
 */

import { describe, expect, it } from 'vitest';
import { allCaseIds, caseIdsByStage, F2L_CASES, OLL_CASES, PLL_CASES } from '../src/tutor';
import { OLL_CORNER_CASES, OLL_EDGE_CASES } from '../src/tutor/cases/oll2look';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from '../src/tutor/cases/pll2look';
import type { MethodId } from '../src/tutor/types';
import { CASE_NOTES, caseIdsWithoutNotes, caseNote, caseTip, describeCycles } from '../src/coach/caseNotes';
import { allowedMoves, guardNames, parseCoachFacts } from '../src/coach/facts';
import { checkReplyMoves, extractMoveTokens } from '../src/coach/guard';
import { COACH_SYSTEM_PROMPT } from '../src/coach/systemPrompt';
import { templateText } from '../src/coach/templates';
import { CoachFacts, HINT_LEVELS, MAX_TEXT_FIELD } from '../src/coach/types';
import { SAMPLE_FACTS } from './helpers/coachFacts';

const ALGORITHMS = new Map(
  [...OLL_CASES, ...PLL_CASES, ...F2L_CASES, ...OLL_EDGE_CASES, ...OLL_CORNER_CASES, ...PLL_CORNER_CASES, ...PLL_EDGE_CASES].map(
    (c) => [c.id, c.algorithm] as const
  )
);

/** `[method, stage, caseId]` for every id of every method variant. */
const STAGED: [MethodId, string, string][] = (
  [
    ['beginner', {}],
    ['cfop', {}],
    ['cfop', { lastLayer: 'full' }],
  ] as const
).flatMap(([method, options]) =>
  Object.entries(caseIdsByStage(method, options)).flatMap(([stage, ids]) => ids.map((id) => [method, stage, id] as [MethodId, string, string]))
);

const FULL_LAST_LAYER = [...OLL_CASES, ...PLL_CASES];

function factsFor(method: MethodId, stage: string, caseId: string, hintLevel: 1 | 2 | 3): CoachFacts {
  const parsed = parseCoachFacts({
    ...SAMPLE_FACTS,
    method,
    stage,
    stageName: stage,
    caseId,
    caseName: caseId,
    hintLevel,
    setupMoves: '',
    algorithm: ALGORITHMS.get(caseId) ?? SAMPLE_FACTS.algorithm,
  });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

describe('coach case notes', () => {
  it('has notes for every id from allCaseIds()', () => {
    expect(caseIdsWithoutNotes()).toEqual([]);
    for (const id of allCaseIds()) {
      const note = caseNote(id);
      expect(note, id).toBeDefined();
      for (const text of [note!.look, note!.idea, note!.hands]) {
        expect(text.length, id).toBeGreaterThan(20);
        expect(text.length, id).toBeLessThanOrEqual(MAX_TEXT_FIELD);
      }
    }
    expect(FULL_LAST_LAYER).toHaveLength(78);
    for (const c of FULL_LAST_LAYER) expect(Object.keys(CASE_NOTES)).toContain(c.id);
  });

  it('passes the move guardrail in templates for every id at hint levels 1 to 3', () => {
    expect(STAGED.length).toBeGreaterThanOrEqual(allCaseIds().length);
    for (const [method, stage, id] of STAGED) {
      for (const level of HINT_LEVELS) {
        const facts = factsFor(method, stage, id, level);
        const text = templateText(facts);
        const guard = checkReplyMoves(text, allowedMoves(facts), guardNames(facts));
        expect(guard.offending, `${id} level ${level}: ${text}`).toEqual([]);
        if (level !== 3) expect(guard.tokens, `${id} level ${level}: ${text}`).toEqual([]);
        expect(facts.caseTip, `${id} level ${level}`).toBeTruthy();
        expect(text, id).toContain(facts.caseTip!.replace(/[.!?]$/, ''));
      }
    }
  });

  it('keeps every note sentence for the full last layer, naming only moves of the case algorithm', () => {
    for (const c of FULL_LAST_LAYER) {
      const note = caseNote(c.id)!;
      expect(extractMoveTokens(note.look), c.id).toEqual([]);
      expect(extractMoveTokens(note.idea), c.id).toEqual([]);
      const own = allowedMoves({ setupMoves: '', algorithm: c.algorithm });
      expect(checkReplyMoves(note.hands, own).offending, `${c.id}: ${note.hands}`).toEqual([]);
      const base = { caseId: c.id, caseName: c.name, stageName: 'Last layer' };
      expect(caseTip({ ...base, hintLevel: 1 }, own)).toBe(note.look);
      expect(caseTip({ ...base, hintLevel: 2 }, own)).toBe(note.idea);
      expect(caseTip({ ...base, hintLevel: 3 }, own)).toBe(note.hands);
    }
  });

  it('agrees with the OLL patterns and the PLL cycles', () => {
    const cue = (id: string) => caseNote(id)!.look;
    for (const c of OLL_CASES) {
      const look = cue(c.id);
      if (c.group === 'Dot') expect(look, c.id).toContain('no yellow edges and');
      if (c.group === 'Cross') expect(look, c.id).toContain('four yellow edges and');
      if (c.group === 'Corners oriented') expect(look, c.id).toContain('and four yellow corners on top');
      if (c.group === 'Line' || c.group === 'Small L') expect(look, c.id).toContain('two yellow edges and');
    }
    expect(cue('oll-01')).toContain('yellow bars on the right and the left');
    expect(describeCycles('(UBL UFL) (UBR UFR)')).toBe('It swaps two pairs of corners.');
    expect(describeCycles('(UBR UFR) (UL UR)')).toBe('It swaps two edges and swaps two corners.');
    expect(describeCycles('(UF UR UL)')).toBe('It moves three edges round in a circle.');
    expect(caseNote('pll-h')!.look).toContain('headlights on every side');
    expect(caseNote('pll-e')!.look).toContain('no headlights, no bars');
  });

  it('sets caseTip on the server from the case id and ignores a client value', () => {
    const parsed = parseCoachFacts({ ...SAMPLE_FACTS, hintLevel: 1, caseTip: 'Turn everything at random.' });
    expect(parsed.ok && parsed.value.caseTip).toBe(caseNote('oll-corners-sune')!.look);
    const unknown = parseCoachFacts({ ...SAMPLE_FACTS, caseId: 'zz-07', caseTip: 'R2 B2' });
    expect(unknown.ok && 'caseTip' in unknown.value).toBe(false);
  });

  it('drops a level-3 sentence whose moves are not allowed for the facts', () => {
    const facts = { caseId: 'oll-01', caseName: 'OLL 1', stageName: 'Last layer', hintLevel: 3 as const };
    expect(caseTip(facts, new Set(['R']))).toBeUndefined();
    expect(caseTip({ ...facts, hintLevel: 1 }, new Set())).toBe(caseNote('oll-01')!.look);
  });

  it('keeps per-case notes out of the cached system prompt', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('caseTip');
    expect(COACH_SYSTEM_PROMPT).not.toContain('Quick check');
    expect(COACH_SYSTEM_PROMPT).not.toContain('sledgehammer');
  });
});
