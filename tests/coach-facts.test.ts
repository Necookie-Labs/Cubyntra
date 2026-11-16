/**
 * Cubyntra - Coach Facts Tests
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { applyMoves, invertAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { createSolvedCubeState } from '../src/cube/constants';
import { planNextStepIn } from '../src/tutor/engine';
import { CFOP_METHOD } from '../src/tutor/methods/cfop';
import { allowedMoves, buildCoachFacts, describeMoves, parseCoachFacts, taughtMoves } from '../src/coach/facts';
import { MAX_ATTEMPTS } from '../src/coach/types';
import { SAMPLE_FACTS } from './helpers/coachFacts';

const yellowTop = applyMoves(createSolvedCubeState(), parseAlgorithm('z2'));

function sunePlan() {
  const start = applyMoves(yellowTop, invertAlgorithm(parseAlgorithm("R U R' U R U2 R'")));
  const plan = planNextStepIn(CFOP_METHOD, start);
  if (!plan) throw new Error('expected a plan');
  return plan;
}

describe('buildCoachFacts', () => {
  it('copies the plan into compact notation without any cube state', () => {
    const plan = sunePlan();
    const facts = buildCoachFacts(plan, 1);
    expect(facts).toMatchObject({
      method: 'cfop',
      stage: 'oll-corners',
      caseId: 'oll-corners-sune',
      hintLevel: 1,
      algorithm: "R U R' U R U2 R'",
      goal: plan.facts.goal,
    });
    const json = JSON.stringify(facts);
    expect(json).not.toContain('startState');
    expect(json).not.toContain('expectedState');
    expect(json.length).toBeLessThan(2000);
  });

  it('keeps only the newest attempts and the diagnosis', () => {
    const attempts = Array.from({ length: 8 }, (_, i) => ({ result: i === 7 ? 'mismatch' : 'unsure' }) as const);
    const facts = buildCoachFacts(sunePlan(), 3, attempts, {
      likelyMistakes: [{ kind: 'wrong-direction', moveIndex: 2, confidence: 0.8 }],
    });
    expect(facts.attempts).toHaveLength(MAX_ATTEMPTS);
    expect(facts.attempts.at(-1)!.result).toBe('mismatch');
    expect(facts.diagnosis?.likelyMistakes[0].kind).toBe('wrong-direction');
  });

  it('round-trips through the request validator', () => {
    const facts = buildCoachFacts(sunePlan(), 2, [{ result: 'mismatch', mistakes: ['skipped-move'] }]);
    const parsed = parseCoachFacts(JSON.parse(JSON.stringify(facts)));
    expect(parsed).toEqual({ ok: true, value: facts });
  });
});

describe('plain-language move names', () => {
  it('adds moveWords at hint level 3 only, from the setup and algorithm', () => {
    const plan = sunePlan();
    expect(buildCoachFacts(plan, 1).moveWords).toBeUndefined();
    expect(buildCoachFacts(plan, 2).moveWords).toBeUndefined();
    const facts = buildCoachFacts(plan, 3);
    const taught = [...plan.setupMoves, ...plan.algorithm];
    expect(facts.moveWords).toHaveLength(taught.length);
    expect(facts.moveWords![0]).toMatch(/^\S+ = turn /);
    expect(facts.moveWords).toContain('R = turn the right side up');
    expect(facts.moveWords).toContain("R' = turn the right side down");
    expect(facts.moveWords).toContain('U2 = turn the top twice');
  });

  it('names the repeated unit instead of the long algorithm', () => {
    const words = describeMoves(taughtMoves({ setupMoves: 'y', algorithm: "R' D' R D R' D' R D", repeat: { unit: "R' D' R D", times: 2 } }));
    expect(words).toEqual([
      'y = turn the whole cube to the left',
      "R' = turn the right side down",
      "D' = turn the bottom to the left",
      'R = turn the right side up',
      'D = turn the bottom to the right',
    ]);
  });

  it('is recomputed by the validator, never taken from the request', () => {
    const parsed = parseCoachFacts({ ...SAMPLE_FACTS, hintLevel: 3, moveWords: ['R = jump off a bridge'] });
    expect(parsed.ok && parsed.value.moveWords).toEqual(describeMoves("U R U R' U R U2 R'"));
    const level1 = parseCoachFacts({ ...SAMPLE_FACTS, hintLevel: 1, moveWords: ['R = spin'] });
    expect(level1.ok && 'moveWords' in level1.value).toBe(false);
  });
});

describe('allowedMoves', () => {
  it('lists setup, algorithm and repeated-unit moves in canonical notation', () => {
    const set = allowedMoves({ setupMoves: "y Rw'", algorithm: "R U R'", repeat: { unit: "R' D'", times: 2 } });
    expect([...set].sort()).toEqual(["D'", 'R', "R'", 'U', "r'", 'y'].sort());
  });
});

describe('parseCoachFacts', () => {
  it('accepts well-formed facts', () => {
    expect(parseCoachFacts(SAMPLE_FACTS).ok).toBe(true);
  });

  it.each([
    ['not an object', 'nope'],
    ['bad method', { ...SAMPLE_FACTS, method: 'roux' }],
    ['bad hint level', { ...SAMPLE_FACTS, hintLevel: 4 }],
    ['bad move notation', { ...SAMPLE_FACTS, algorithm: 'R Q' }],
    ['empty algorithm', { ...SAMPLE_FACTS, algorithm: '' }],
    ['bad grip', { ...SAMPLE_FACTS, grip: { top: 'pink', front: 'green' } }],
    ['long text', { ...SAMPLE_FACTS, why: 'x'.repeat(401) }],
    ['bad case id', { ...SAMPLE_FACTS, caseId: '<script>' }],
    ['too many attempts', { ...SAMPLE_FACTS, attempts: Array(6).fill({ result: 'unsure' }) }],
    ['bad mistake kind', { ...SAMPLE_FACTS, diagnosis: { likelyMistakes: [{ kind: 'sneeze' }] } }],
    ['bad confidence', { ...SAMPLE_FACTS, diagnosis: { likelyMistakes: [{ kind: 'other', confidence: 2 }] } }],
    ['bad repeat', { ...SAMPLE_FACTS, repeat: { unit: "R' D'", times: 40 } }],
  ])('rejects %s', (_label, input) => {
    expect(parseCoachFacts(input).ok).toBe(false);
  });

  it('drops unknown fields', () => {
    const parsed = parseCoachFacts({ ...SAMPLE_FACTS, startState: { U: [] }, image: 'data:...' });
    expect(parsed.ok && Object.keys(parsed.value)).not.toContain('image');
    expect(parsed.ok && Object.keys(parsed.value)).not.toContain('startState');
  });
});
