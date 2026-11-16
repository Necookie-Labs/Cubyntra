/**
 * Cubyntra - Coach Template Coverage Tests
 * Necookie Labs (c) 2026
 *
 * Every stage and every case in the tutor tables has template text at every hint level, and
 * template text always passes the move guardrail.
 */

import { describe, expect, it } from 'vitest';
import { F2L_CASES } from '../src/tutor/cases/f2l';
import { OLL_CORNER_CASES, OLL_EDGE_CASES } from '../src/tutor/cases/oll2look';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from '../src/tutor/cases/pll2look';
import { CFOP_METHOD } from '../src/tutor/methods/cfop';
import { COACH_STAGES } from '../src/coach/stages';
import { CASE_NOTES, hasCaseTemplate, hasStageTemplate, templateText } from '../src/coach/templates';
import { checkReplyMoves } from '../src/coach/guard';
import { allowedMoves } from '../src/coach/facts';
import { CoachFacts, HINT_LEVELS } from '../src/coach/types';
import { SAMPLE_FACTS } from './helpers/coachFacts';

const TABLE_CASES = [
  ...F2L_CASES.map((c) => ({ ...c, stage: 'f2l' })),
  ...OLL_EDGE_CASES.map((c) => ({ ...c, stage: 'oll-edges' })),
  ...OLL_CORNER_CASES.map((c) => ({ ...c, stage: 'oll-corners' })),
  ...PLL_CORNER_CASES.map((c) => ({ ...c, stage: 'pll-corners' })),
  ...PLL_EDGE_CASES.map((c) => ({ ...c, stage: 'pll-edges' })),
];

function factsFor(stage: string, caseId: string, caseName: string, algorithm: string): CoachFacts {
  return { ...SAMPLE_FACTS, stage, caseId, caseName, algorithm, setupMoves: "U'" };
}

function expectGoodTemplate(facts: CoachFacts) {
  const text = templateText(facts);
  expect(text.trim().length).toBeGreaterThan(20);
  const guard = checkReplyMoves(text, allowedMoves(facts), [facts.caseName, facts.stageName]);
  expect(guard.offending).toEqual([]);
  if (facts.hintLevel === 3) expect(text).toContain(facts.algorithm);
  else expect(guard.tokens).toEqual([]);
  return text;
}

describe('coach templates', () => {
  it('has stage notes for every CFOP stage the engine defines', () => {
    for (const stage of CFOP_METHOD.stages) {
      expect(hasStageTemplate('cfop', stage.id), stage.id).toBe(true);
    }
  });

  it('covers every stage at every hint level', () => {
    for (const stage of COACH_STAGES) {
      expect(hasStageTemplate(stage.method, stage.id)).toBe(true);
      for (const hintLevel of HINT_LEVELS) {
        expectGoodTemplate({ ...SAMPLE_FACTS, method: stage.method, stage: stage.id, stageName: stage.name, hintLevel });
      }
    }
  });

  it('covers every table case at every hint level, with the case recognition at level 1', () => {
    expect(TABLE_CASES.length).toBe(41 + 3 + 7 + 2 + 4);
    for (const c of TABLE_CASES) {
      expect(hasCaseTemplate(c.id), c.id).toBe(true);
      for (const hintLevel of HINT_LEVELS) {
        const text = expectGoodTemplate({ ...factsFor(c.stage, c.id, c.name, c.algorithm), hintLevel });
        if (hintLevel === 1) expect(text).toContain(c.recognition);
        if (hintLevel === 2) expect(text).toContain(c.name);
      }
    }
  });

  it('covers the engine cases outside the tables', () => {
    for (const id of ['cross', 'f2l-extract-corner', 'f2l-extract-edge', 'auf-u', "auf-u'", 'auf-u2',
      'yellow-corner-twist-2', 'yellow-corner-twist-4', 'yellow-corners-align']) {
      expect(hasCaseTemplate(id), id).toBe(true);
      for (const hintLevel of HINT_LEVELS) {
        expectGoodTemplate({ ...factsFor('auf', id, CASE_NOTES[id].name, 'U'), hintLevel });
      }
    }
  });

  it('falls back to the plan facts for an unknown stage and case', () => {
    const facts = { ...SAMPLE_FACTS, stage: 'mystery', caseId: 'mystery-1', hintLevel: 1 as const };
    expect(templateText(facts)).toContain(SAMPLE_FACTS.lookFor);
    expect(templateText({ ...facts, hintLevel: 2 })).toContain(SAMPLE_FACTS.why);
  });

  it('describes a repeated unit instead of the long algorithm', () => {
    const text = templateText({
      ...SAMPLE_FACTS,
      hintLevel: 3,
      algorithm: "R' D' R D R' D' R D",
      repeat: { unit: "R' D' R D", times: 2 },
    });
    expect(text).toContain("R' D' R D, 2 times in a row");
  });

  it('leads with the last mistake when there is one', () => {
    const text = templateText({
      ...SAMPLE_FACTS,
      hintLevel: 3,
      attempts: [{ result: 'mismatch' }],
      diagnosis: { likelyMistakes: [{ kind: 'wrong-direction' }] },
    });
    expect(text.startsWith('Last time one turn probably went the wrong way.')).toBe(true);
  });

  it('is deterministic', () => {
    expect(templateText(SAMPLE_FACTS)).toBe(templateText({ ...SAMPLE_FACTS }));
  });
});
