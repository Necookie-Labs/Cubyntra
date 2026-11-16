/**
 * Cubyntra - Coach Evaluation
 * Necookie Labs (c) 2026
 *
 * Runs about 50 real step situations through the coach and writes a markdown report to
 * data/coach-eval-report.md. The situations are real tutor plans: guided solves of seeded
 * scrambles (`runGuidedSolve`) for both methods, spread over every stage, at all three hint
 * levels, with a mix of attempt histories. A few carry a synthetic diagnosis: one move of the
 * step is turned the wrong way (or skipped), the resulting cube is "scanned" on every face and
 * `diagnoseMistake` ranks the slips, exactly as after a failed checkpoint.
 *
 * Calls the live Claude API only when ANTHROPIC_API_KEY is set (each call is a few hundredths
 * of a cent and counts toward the monthly cap in data/coach-usage.json). Without a key it never
 * calls the API: it runs in mock mode and checks the templates instead. Run with:
 * npm run coach:eval
 */

import { FACES, createSolvedCubeState } from '../src/cube/constants';
import { viewInGrip } from '../src/cube/grip';
import { applyMoves, invertMove, parseAlgorithm } from '../src/cube/transforms';
import { Move } from '../src/cube/types';
import { checkReplyMoves } from '../src/coach/guard';
import { allowedMoves, buildCoachFacts, guardNames } from '../src/coach/facts';
import { coachReply, coachStatus } from '../src/coach/service';
import { getSpendTracker } from '../src/coach/spend';
import { AttemptRecord, CoachFacts, CoachStreamEvent, HINT_LEVELS, HintLevel } from '../src/coach/types';
import { dataPath, writeFileAtomic } from '../src/lib/dataDir';
import { METHODS, runGuidedSolve } from '../src/tutor/api';
import { observationOf } from '../src/tutor/checkpoint';
import { diagnoseMistake } from '../src/tutor/diagnose';
import { Diagnosis, MethodId, StepPlan } from '../src/tutor/types';

const SITUATIONS = 50;
const DIAGNOSED = 6;
const SEED = 2026;
const SCRAMBLES_PER_METHOD = 6;
const TURNS = parseAlgorithm("U U' U2 D D' D2 R R' R2 L L' L2 F F' F2 B B' B2");

/** Deterministic generator (mulberry32), so every run evaluates the same situations. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 25 random outer turns, never the same face twice in a row. */
function scramble(n: number) {
  const random = seededRandom(SEED * 1000 + n);
  const moves: Move[] = [];
  let lastFace = -1;
  while (moves.length < 25) {
    const pick = Math.floor(random() * TURNS.length);
    if (Math.floor(pick / 3) === lastFace) continue;
    lastFace = Math.floor(pick / 3);
    moves.push(TURNS[pick]);
  }
  return applyMoves(createSolvedCubeState(), moves);
}

/** Real steps of one method, round-robin over its stages so every stage is represented. */
function realSteps(method: MethodId, count: number): StepPlan[] {
  const byStage = new Map<string, StepPlan[]>(METHODS[method].stages.map((s) => [s.id, []]));
  const seenCases = new Set<string>();
  for (let n = 1; n <= SCRAMBLES_PER_METHOD; n++) {
    for (const step of runGuidedSolve(scramble(n), method).steps) {
      // Prefer distinct cases; repeats of a case go to the back of the stage's queue.
      const key = `${step.caseId}|${step.setupMoves.length}`;
      const list = byStage.get(step.stage) ?? [];
      if (seenCases.has(key)) list.push(step);
      else list.unshift(step);
      seenCases.add(key);
      byStage.set(step.stage, list);
    }
  }
  const picked: StepPlan[] = [];
  const queues = [...byStage.values()];
  while (picked.length < count && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && picked.length < count) picked.push(q.shift()!);
  }
  return picked;
}

/** A failed checkpoint: the student slipped on one move, every face was scanned and diagnosed. */
function syntheticDiagnosis(plan: StepPlan, slip: 'wrong-direction' | 'skipped-move'): Diagnosis | null {
  const moves = [...plan.setupMoves, ...plan.algorithm];
  const candidates = moves
    .map((m, i) => ({ m, i }))
    .filter(({ m, i }) => i >= plan.setupMoves.length && m.kind !== 'rotation' && m.quarterTurns !== 2);
  if (!candidates.length) return null;
  const { m, i } = candidates[Math.floor(candidates.length / 2)];
  const performed = [...moves.slice(0, i), ...(slip === 'wrong-direction' ? [invertMove(m)] : []), ...moves.slice(i + 1)];
  const seen = viewInGrip(applyMoves(plan.startState, performed), plan.gripAfter).state;
  const diagnosis = diagnoseMistake(plan, FACES.map((face) => observationOf(seen, face)));
  return diagnosis.likelyMistakes.length ? diagnosis : null;
}

function attemptsFor(i: number): AttemptRecord[] {
  if (i % 7 === 5) return [{ result: 'unsure' }];
  if (i % 11 === 9) return [{ result: 'matched' }];
  return [];
}

/** The evaluated situations, in order. Deterministic: the same on every run. */
export function situations(): CoachFacts[] {
  const methods = Object.keys(METHODS) as MethodId[];
  const plain = SITUATIONS - DIAGNOSED;
  const steps = methods.flatMap((method, k) =>
    realSteps(method, Math.floor(plain / methods.length) + (k < plain % methods.length ? 1 : 0))
  );
  const out = steps.map((plan, i) => buildCoachFacts(plan, HINT_LEVELS[i % 3], attemptsFor(i)));

  // Diagnosed situations: the longer steps of both methods, at every hint level.
  const long = steps.filter((p) => p.algorithm.length >= 4);
  for (let k = 0, j = 0; k < DIAGNOSED && j < long.length * 2; j++) {
    const plan = long[(j * 7) % long.length];
    const slip = k % 2 === 0 ? 'wrong-direction' : 'skipped-move';
    const diagnosis = syntheticDiagnosis(plan, slip);
    if (!diagnosis) continue;
    const level = ((k % 3) + 1) as HintLevel;
    out.push(buildCoachFacts(plan, level, [{ result: 'mismatch', mistakes: [diagnosis.likelyMistakes[0].kind] }], diagnosis));
    k++;
  }
  return out;
}

interface Row {
  facts: CoachFacts;
  text: string;
  done: Extract<CoachStreamEvent, { type: 'done' }> | null;
  guardOk: boolean;
  offending: string[];
  ms: number;
}

async function run(facts: CoachFacts): Promise<Row> {
  const started = Date.now();
  let text = '';
  let done: Row['done'] = null;
  for await (const event of coachReply(facts)) {
    if (event.type === 'delta') text += event.text;
    else if (event.type === 'replace') text = event.text;
    else done = event;
  }
  const guard = checkReplyMoves(text, allowedMoves(facts), guardNames(facts));
  return {
    facts,
    text,
    done,
    guardOk: guard.ok,
    offending: guard.offending.map((t) => t.raw),
    ms: Date.now() - started,
  };
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');

async function main(): Promise<void> {
  const tracker = getSpendTracker();
  const spendBefore = tracker.monthSpendUsd();
  const status = coachStatus(tracker);
  console.log(`Coach eval: mode ${status.mode}, month spend so far $${status.monthSpendUsd.toFixed(4)} of $${status.capUsd}`);
  if (status.mode === 'mock') console.log('No ANTHROPIC_API_KEY: checking the templates only (no API calls).');

  const rows: Row[] = [];
  for (const facts of situations()) {
    const row = await run(facts);
    rows.push(row);
    console.log(`${row.facts.method}/${row.facts.stage}/${row.facts.caseId} L${row.facts.hintLevel}${row.facts.diagnosis ? ' (diagnosed)' : ''}: ${row.done?.source ?? '?'}${row.done?.reason ? ` (${row.done.reason})` : ''}`);
  }

  const live = rows.filter((r) => r.done?.source === 'live').length;
  const reasons = new Map<string, number>();
  for (const r of rows) if (r.done?.reason) reasons.set(r.done.reason, (reasons.get(r.done.reason) ?? 0) + 1);
  const spent = tracker.monthSpendUsd() - spendBefore;
  const usage = tracker.monthUsage();

  const lines = [
    '# Coach evaluation report',
    '',
    `- Mode: **${status.mode}**`,
    `- Situations: ${rows.length}`,
    `- Live replies kept: ${live}`,
    `- Template fallbacks: ${[...reasons].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
    `- Replies failing the guardrail as shown (must be 0): ${rows.filter((r) => !r.guardOk).length}`,
    `- Cost of this run: $${spent.toFixed(5)}; month so far: $${tracker.monthSpendUsd().toFixed(5)}`,
    `- Month cache reads / writes (tokens): ${usage.cacheReadTokens} / ${usage.cacheWriteTokens}`,
    `- Average time per reply: ${Math.round(rows.reduce((a, r) => a + r.ms, 0) / Math.max(1, rows.length))} ms`,
    '',
    '| # | Method | Stage | Case | Level | Diagnosis | Source | Reason | Guard | Reply |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r, i) =>
        `| ${i + 1} | ${r.facts.method} | ${cell(r.facts.stage)} | ${cell(r.facts.caseId)} | ${r.facts.hintLevel} | ` +
        `${cell(r.facts.diagnosis?.likelyMistakes[0]?.kind ?? '')} | ${r.done?.source ?? '?'} | ${r.done?.reason ?? ''} | ` +
        `${r.guardOk ? 'ok' : `FAIL ${cell(r.offending.join(' '))}`} | ${cell(r.text)} |`
    ),
    '',
  ];
  const file = dataPath('coach-eval-report.md');
  await writeFileAtomic(file, lines.join('\n'));
  console.log(`Report written to ${file}`);
}

// Run only when started as a script (npm run coach:eval), not when a test imports `situations`.
if (/coach-eval\.[cm]?[jt]s$/.test(process.argv[1] ?? '')) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
