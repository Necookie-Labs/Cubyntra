/**
 * Cubyntra - Coach Template Coverage Tests
 * Necookie Labs (c) 2026
 *
 * Every stage the tutor defines has template text at every hint level, templates are built from
 * the plan's own facts (so real plans from guided solves are the test data), and template text
 * always passes the move guardrail.
 */

import { describe, expect, it } from 'vitest';
import { formatAlgorithm } from '../src/cube/transforms';
import { moveName } from '../src/cube/moveNames';
import { METHODS, runGuidedSolve } from '../src/tutor/api';
import { MethodId, StepPlan } from '../src/tutor/types';
import { COACH_STAGES, STAGE_TIPS, stageNote } from '../src/coach/stages';
import { hasStageTemplate, templateText } from '../src/coach/templates';
import { checkReplyMoves } from '../src/coach/guard';
import { allowedMoves, buildCoachFacts, guardNames } from '../src/coach/facts';
import { CoachFacts, HINT_LEVELS } from '../src/coach/types';
import { SAMPLE_FACTS } from './helpers/coachFacts';
import { scrambledState } from './helpers/scrambles';

const METHOD_IDS = Object.keys(METHODS) as MethodId[];

function expectGoodTemplate(facts: CoachFacts) {
  const text = templateText(facts);
  expect(text.trim().length).toBeGreaterThan(20);
  const guard = checkReplyMoves(text, allowedMoves(facts), guardNames(facts));
  expect(guard.offending, text).toEqual([]);
  if (facts.hintLevel !== 3) expect(guard.tokens, text).toEqual([]);
  return text;
}

/** Every step of guided solves from a few seeded scrambles, both methods. */
const REAL_PLANS: StepPlan[] = METHOD_IDS.flatMap((method) =>
  [1, 2, 3].flatMap((n) => runGuidedSolve(scrambledState(404, n), method).steps)
);

describe('coach templates', () => {
  it('has teaching notes and templates at every hint level for every stage the tutor defines', () => {
    for (const method of METHOD_IDS) {
      for (const stage of METHODS[method].stages) {
        expect(hasStageTemplate(method, stage.id), `${method}:${stage.id}`).toBe(true);
        for (const hintLevel of HINT_LEVELS) {
          expectGoodTemplate({ ...SAMPLE_FACTS, method, stage: stage.id, stageName: stage.name, hintLevel });
        }
      }
    }
  });

  it('takes stage ids and names from the tutor, not a copy', () => {
    const tutorStages = METHOD_IDS.flatMap((m) => METHODS[m].stages.map((s) => ({ method: m, id: s.id, name: s.name })));
    expect(COACH_STAGES.map(({ method, id, name }) => ({ method, id, name }))).toEqual(tutorStages);
    for (const key of Object.keys(STAGE_TIPS)) {
      const [method, id] = key.split(':') as [MethodId, string];
      expect(METHODS[method].stages.some((s) => s.id === id), key).toBe(true);
    }
  });

  it('uses family notes for last-layer stages it does not know by id', () => {
    expect(stageNote('cfop', 'oll-full')?.lookTip).toMatch(/yellow/);
    expect(stageNote('cfop', 'pll-full')?.whyTip).toMatch(/top pieces/);
    expect(stageNote('cfop', 'mystery')).toBeUndefined();
  });

  it('builds a generic template from the plan facts for an unknown stage and case', () => {
    const facts: CoachFacts = {
      ...SAMPLE_FACTS,
      stage: 'one-look-zz',
      stageName: 'Zebra stage',
      caseId: 'zz-07',
      caseName: 'Zebra seven',
    };
    expect(hasStageTemplate('cfop', facts.stage)).toBe(false);
    const level1 = expectGoodTemplate({ ...facts, hintLevel: 1 });
    expect(level1).toContain(facts.goal);
    expect(level1).toContain(facts.lookFor);
    const level2 = expectGoodTemplate({ ...facts, hintLevel: 2 });
    expect(level2).toContain('This is Zebra seven, part of Zebra stage.');
    expect(level2).toContain(facts.why);
    expect(expectGoodTemplate({ ...facts, hintLevel: 3 })).toContain(facts.algorithm);
  });

  it('explains every real step of guided solves from the plan facts, at every hint level', () => {
    expect(REAL_PLANS.length).toBeGreaterThan(60);
    const stagesSeen = new Set(REAL_PLANS.map((p) => `${p.method}:${p.stage}`));
    for (const method of METHOD_IDS) {
      for (const stage of METHODS[method].stages) expect(stagesSeen.has(`${method}:${stage.id}`), stage.id).toBe(true);
    }
    for (const plan of REAL_PLANS) {
      const [l1, l2, l3] = HINT_LEVELS.map((level) => expectGoodTemplate(buildCoachFacts(plan, level)));
      expect(l1).toContain(plan.facts.lookFor.trim().replace(/[.!?]$/, ''));
      expect(l1).toContain(plan.facts.goal.trim().replace(/[.!?]$/, ''));
      expect(l2).toContain(plan.facts.why.trim().replace(/[.!?]$/, ''));
      expect(l2).toContain(plan.stageName);
      if (plan.caseName.toLowerCase() !== plan.stageName.toLowerCase()) expect(l2).toContain(plan.caseName);
      expect(l3).toContain(`with ${plan.grip.top} on top and ${plan.grip.front} facing you`);
      if (plan.setupMoves.length) expect(l3).toContain(formatAlgorithm(plan.setupMoves));
      const taught = plan.facts.repeat ? plan.facts.repeat.unit : plan.algorithm;
      expect(l3).toContain(formatAlgorithm(taught));
      if (plan.facts.repeat) expect(l3).toContain(`${plan.facts.repeat.times} times in a row`);
      // Plain-language name for every move taught at level 3.
      for (const m of [...plan.setupMoves, ...taught]) expect(l3.toLowerCase()).toContain(moveName(m).toLowerCase());
    }
  });

  it('describes a repeated unit instead of the long algorithm', () => {
    const text = templateText({
      ...SAMPLE_FACTS,
      hintLevel: 3,
      algorithm: "R' D' R D R' D' R D",
      repeat: { unit: "R' D' R D", times: 2 },
    });
    expect(text).toContain("R' D' R D, 2 times in a row");
    expect(text).toContain("In words: U = turn the top to the left, R' = turn the right side down, D' = ");
  });

  it('leads with the last mistake when there is one', () => {
    const text = templateText({
      ...SAMPLE_FACTS,
      hintLevel: 3,
      attempts: [{ result: 'mismatch' }],
      diagnosis: { likelyMistakes: [{ kind: 'wrong-direction', confidence: 0.6 }], confident: false },
    });
    expect(text.startsWith('Last time one turn probably went the wrong way.')).toBe(true);
  });

  it("uses the tutor's description when the diagnosis is confident, and asks for another side when it is not", () => {
    const description = 'Move 3 is "turn the top to the left". You probably turned it the other way.';
    const mistake = { kind: 'wrong-direction' as const, moveIndex: 2, confidence: 0.92, description };
    const sure = templateText({ ...SAMPLE_FACTS, hintLevel: 1, diagnosis: { likelyMistakes: [mistake], confident: true } });
    expect(sure.startsWith(description)).toBe(true);
    const unsure = templateText({
      ...SAMPLE_FACTS,
      hintLevel: 1,
      diagnosis: { likelyMistakes: [mistake], confident: false, showNext: 'the right side' },
    });
    expect(unsure.startsWith('Last time one turn probably went the wrong way.')).toBe(true);
    expect(unsure).toContain('show the right side to the camera');
  });

  it('is deterministic', () => {
    expect(templateText(SAMPLE_FACTS)).toBe(templateText({ ...SAMPLE_FACTS }));
  });
});
