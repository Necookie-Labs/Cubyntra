/**
 * Cubyntra - Coach Facts Tests
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { applyMoves, invertAlgorithm, invertMove, parseAlgorithm } from '../src/cube/transforms';
import { FACES, createSolvedCubeState } from '../src/cube/constants';
import { viewInGrip } from '../src/cube/grip';
import { runGuidedSolve } from '../src/tutor/api';
import { observationOf } from '../src/tutor/checkpoint';
import { diagnoseMistake } from '../src/tutor/diagnose';
import { LikelyMistake } from '../src/tutor/types';
import { planNextStepIn } from '../src/tutor/engine';
import { CFOP_METHOD } from '../src/tutor/methods/cfop';
import { allowedMoves, buildCoachFacts, describeMoves, parseCoachFacts, projectDiagnosis, taughtMoves } from '../src/coach/facts';
import { MAX_ATTEMPTS, MAX_MISTAKES, MISTAKE_KINDS, MistakeKind } from '../src/coach/types';
import { SAMPLE_FACTS } from './helpers/coachFacts';
import { scrambledState } from './helpers/scrambles';

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
      likelyMistakes: [mistake({ moveIndex: 2, confidence: 0.8 })],
      confident: true,
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

/** A tutor LikelyMistake with dummy heavy fields (they must never reach the facts). */
function mistake(over: Partial<LikelyMistake> = {}): LikelyMistake {
  return {
    kind: 'wrong-direction',
    confidence: 0.5,
    description: 'You probably turned one side the other way.',
    performedMoves: parseAlgorithm("R U R' U"),
    resultingState: createSolvedCubeState(),
    score: -3.2,
    contradictions: 0,
    ...over,
  };
}

/** A real diagnosis: the student turns one move of a real step the wrong way. */
function realWrongDirection() {
  const plan = runGuidedSolve(scrambledState(77, 4), 'cfop').steps.find((s) => s.stage === 'f2l' && s.algorithm.length >= 5)!;
  const moves = [...plan.setupMoves, ...plan.algorithm];
  const i = moves.findIndex((m, k) => k >= plan.setupMoves.length && m.kind !== 'rotation' && m.quarterTurns !== 2);
  const performed = [...moves.slice(0, i), invertMove(moves[i]), ...moves.slice(i + 1)];
  const seen = viewInGrip(applyMoves(plan.startState, performed), plan.gripAfter).state;
  const observations = FACES.map((face) => observationOf(seen, face));
  return { plan, i, diagnosis: diagnoseMistake(plan, observations) };
}

describe('diagnosis projection', () => {
  it("sends a compact projection of the tutor's real diagnosis, never its move lists or states", () => {
    const { plan, i, diagnosis } = realWrongDirection();
    expect(diagnosis.likelyMistakes.length).toBeGreaterThan(0);
    const facts = buildCoachFacts(plan, 1, [{ result: 'mismatch', mistakes: ['wrong-direction'] }], diagnosis);
    const top = facts.diagnosis!.likelyMistakes[0];
    expect(top).toMatchObject({ kind: 'wrong-direction', moveIndex: i });
    expect(top.description).toBe(diagnosis.likelyMistakes[0].description);
    expect(facts.diagnosis!.confident).toBe(diagnosis.confident);
    for (const m of facts.diagnosis!.likelyMistakes) {
      expect(Object.keys(m).sort()).toEqual(expect.arrayContaining(['confidence', 'kind']));
      for (const key of ['performedMoves', 'resultingState', 'score', 'contradictions']) expect(m).not.toHaveProperty(key);
    }
    const json = JSON.stringify(facts);
    expect(json).not.toMatch(/performedMoves|resultingState|"score"|contradictions/);
    expect(json.length).toBeLessThan(2500);
    expect(parseCoachFacts(JSON.parse(json))).toEqual({ ok: true, value: facts });
  });

  it('keeps at most MAX_MISTAKES, rounds confidence and names showNext in words', () => {
    const many = Array.from({ length: 6 }, (_, k) => mistake({ confidence: 0.123456 + k / 100 }));
    const d = projectDiagnosis({ likelyMistakes: many, confident: false, showNext: 'R' }, SAMPLE_FACTS)!;
    expect(d.likelyMistakes).toHaveLength(MAX_MISTAKES);
    expect(d.likelyMistakes[0].confidence).toBe(0.12);
    expect(d.showNext).toBe('the right side');
    expect(projectDiagnosis({ likelyMistakes: [], confident: false }, SAMPLE_FACTS)).toBeUndefined();
  });

  it('keeps detail and moveIndex when the tutor sets them', () => {
    const d = projectDiagnosis(
      { likelyMistakes: [mistake({ kind: 'other', detail: 'stopped-early', moveIndex: 4 })], confident: true },
      SAMPLE_FACTS
    )!;
    expect(d.likelyMistakes[0]).toEqual({
      kind: 'other',
      detail: 'stopped-early',
      moveIndex: 4,
      confidence: 0.5,
      description: 'You probably turned one side the other way.',
    });
  });

  // Guardrail decision: the top description may name step moves or moves the student likely
  // did (its performedMoves); lower-ranked descriptions only step moves. Otherwise the
  // description is dropped and only the kind is sent.
  it.each<[string, number, string, boolean]>([
    ['top, step moves only', 0, "You did R U R' with the wrong grip.", true],
    ["top, a performed move outside the step (U')", 0, "You probably did U' at the end.", true],
    ['top, a move in neither list', 0, 'You probably did F2 at the end.', false],
    ['second, step moves only', 1, 'Maybe R U went wrong.', true],
    ["second, a performed move outside the step (U')", 1, "Maybe you did U' at the end.", false],
    ['no notation at all', 1, 'Move 3 is "turn the top to the left". You probably turned it the other way.', true],
  ])('%s: description kept = %s', (_label, rank, description, kept) => {
    const list = [mistake({ performedMoves: parseAlgorithm("U R U R' U'") }), mistake({ performedMoves: parseAlgorithm("U'") })];
    list[rank] = { ...list[rank], description };
    const d = projectDiagnosis({ likelyMistakes: list, confident: true }, SAMPLE_FACTS)!;
    expect(d.likelyMistakes[rank].description).toBe(kept ? description : undefined);
  });

  it('lets the reply repeat a move the kept top description names, and nothing more', () => {
    const facts = buildCoachFacts(sunePlan(), 1, [], {
      likelyMistakes: [mistake({ description: "You probably did U' at the end.", performedMoves: parseAlgorithm("U R U R' U'") })],
      confident: true,
    });
    const allowed = allowedMoves(facts);
    expect(allowed.has("U'")).toBe(true);
    expect(allowed.has('F')).toBe(false);
    expect(allowedMoves({ ...facts, diagnosis: undefined }).has("U'")).toBe(false);
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
    ['bad mistake kind', { ...SAMPLE_FACTS, diagnosis: { likelyMistakes: [{ kind: 'sneeze', confidence: 0.5 }], confident: true } }],
    ['bad confidence', { ...SAMPLE_FACTS, diagnosis: { likelyMistakes: [{ kind: 'other', confidence: 2 }], confident: true } }],
    ['missing confidence', { ...SAMPLE_FACTS, diagnosis: { likelyMistakes: [{ kind: 'other' }], confident: true } }],
    ['bad detail', { ...SAMPLE_FACTS, diagnosis: { likelyMistakes: [{ kind: 'other', confidence: 0.5, detail: 'oops' }], confident: true } }],
    ['missing confident', { ...SAMPLE_FACTS, diagnosis: { likelyMistakes: [{ kind: 'other', confidence: 0.5 }] } }],
    ['showNext as a letter', { ...SAMPLE_FACTS, diagnosis: { likelyMistakes: [{ kind: 'other', confidence: 0.5 }], confident: false, showNext: 'F' } }],
    ['too many mistakes', { ...SAMPLE_FACTS, diagnosis: { likelyMistakes: Array(4).fill({ kind: 'other', confidence: 0.2 }), confident: false } }],
    ['long description', { ...SAMPLE_FACTS, diagnosis: { likelyMistakes: [{ kind: 'other', confidence: 0.5, description: 'x'.repeat(401) }], confident: true } }],
    [
      'a lower description naming a move outside the step',
      {
        ...SAMPLE_FACTS,
        diagnosis: {
          likelyMistakes: [
            { kind: 'other', confidence: 0.5 },
            { kind: 'wrong-face', confidence: 0.3, description: 'Maybe you did F2 there.' },
          ],
          confident: false,
        },
      },
    ],
    ['bad repeat', { ...SAMPLE_FACTS, repeat: { unit: "R' D'", times: 40 } }],
  ])('rejects %s', (_label, input) => {
    expect(parseCoachFacts(input).ok).toBe(false);
  });

  it('accepts a top description that names a move outside the step (checked when the facts were built)', () => {
    const parsed = parseCoachFacts({
      ...SAMPLE_FACTS,
      diagnosis: { likelyMistakes: [{ kind: 'wrong-direction', confidence: 0.7, description: "You did U' there." }], confident: true },
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && allowedMoves(parsed.value).has("U'")).toBe(true);
  });

  it('drops unknown fields, including the tutor fields that must stay in the browser', () => {
    const parsed = parseCoachFacts({
      ...SAMPLE_FACTS,
      diagnosis: {
        likelyMistakes: [{ kind: 'other', confidence: 0.5, performedMoves: [{ notation: 'R' }], resultingState: {}, score: 1 }],
        confident: true,
      },
    });
    expect(parsed.ok && parsed.value.diagnosis?.likelyMistakes[0]).toEqual({ kind: 'other', confidence: 0.5 });
  });

  it('drops unknown fields', () => {
    const parsed = parseCoachFacts({ ...SAMPLE_FACTS, startState: { U: [] }, image: 'data:...' });
    expect(parsed.ok && Object.keys(parsed.value)).not.toContain('image');
    expect(parsed.ok && Object.keys(parsed.value)).not.toContain('startState');
  });
});

describe('mistake kinds', () => {
  it("lists every kind of the tutor's MistakeKind", () => {
    // Fails to compile if the tutor adds a kind the coach does not list.
    type Missing = Exclude<MistakeKind, (typeof MISTAKE_KINDS)[number]>;
    const complete: [Missing] extends [never] ? true : false = true;
    expect(complete).toBe(true);
    expect(new Set(MISTAKE_KINDS).size).toBe(6);
  });
});
