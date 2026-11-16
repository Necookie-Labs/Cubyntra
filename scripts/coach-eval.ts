/**
 * Cubyntra - Coach Evaluation
 * Necookie Labs (c) 2026
 *
 * Runs about 50 recorded step situations through the coach and writes a markdown report to
 * data/coach-eval-report.md. The situations come from the tutor case tables (F2L, 2-look OLL
 * and PLL) with a mix of hint levels, setups, attempt histories and diagnoses.
 *
 * Calls the live Claude API only when ANTHROPIC_API_KEY is set (each call is a few hundredths
 * of a cent and counts toward the monthly cap in data/coach-usage.json). Without a key it runs
 * in mock mode and checks the templates instead. Run with: npm run coach:eval
 */

import { checkReplyMoves } from '../src/coach/guard';
import { allowedMoves, guardNames } from '../src/coach/facts';
import { coachReply, coachStatus } from '../src/coach/service';
import { getSpendTracker } from '../src/coach/spend';
import { stageNote } from '../src/coach/stages';
import { CoachFacts, CoachStreamEvent, HintLevel, MistakeKind } from '../src/coach/types';
import { dataPath, writeFileAtomic } from '../src/lib/dataDir';
import { F2L_CASES } from '../src/tutor/cases/f2l';
import { OLL_CORNER_CASES, OLL_EDGE_CASES } from '../src/tutor/cases/oll2look';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from '../src/tutor/cases/pll2look';

const GOALS: Record<string, string> = {
  f2l: 'Pair the corner with its edge and put them into the front-right slot.',
  'oll-edges': 'Make a yellow cross on top.',
  'oll-corners': 'Turn every top corner so the whole top is yellow.',
  'pll-corners': 'Put the four top corners in the right order.',
  'pll-edges': 'Put the four top edges in the right order.',
};

const SETUPS = ['', 'U', "U'", 'U2', 'y'];
const MISTAKES: MistakeKind[] = ['wrong-direction', 'skipped-move', 'doubled-move', 'wrong-face', 'wrong-grip'];

function situations(): CoachFacts[] {
  const lastLayer = [
    ...OLL_EDGE_CASES.map((c) => ({ c, stage: 'oll-edges' })),
    ...OLL_CORNER_CASES.map((c) => ({ c, stage: 'oll-corners' })),
    ...PLL_CORNER_CASES.map((c) => ({ c, stage: 'pll-corners' })),
    ...PLL_EDGE_CASES.map((c) => ({ c, stage: 'pll-edges' })),
  ];
  const f2l = F2L_CASES.slice(0, 50 - lastLayer.length).map((c) => ({ c, stage: 'f2l' }));
  return [...lastLayer, ...f2l].map(({ c, stage }, i) => {
    const note = stageNote('cfop', stage);
    const facts: CoachFacts = {
      method: 'cfop',
      stage,
      stageName: note?.name ?? stage,
      caseId: c.id,
      caseName: c.name,
      hintLevel: ((i % 3) + 1) as HintLevel,
      grip: { top: 'yellow', front: (['green', 'red', 'blue', 'orange'] as const)[i % 4] },
      setupMoves: SETUPS[i % SETUPS.length],
      algorithm: c.algorithm,
      goal: GOALS[stage],
      lookFor: c.recognition,
      why: note?.whyTip ?? '',
      attempts: [],
    };
    if (i % 4 === 3) {
      const kind = MISTAKES[i % MISTAKES.length];
      facts.attempts = [{ result: 'mismatch', mistakes: [kind] }];
      facts.diagnosis = { likelyMistakes: [{ kind, moveIndex: 1, confidence: 0.7 }], confident: false };
    } else if (i % 7 === 5) {
      facts.attempts = [{ result: 'unsure' }];
    }
    return facts;
  });
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
    console.log(`${row.facts.caseId} L${row.facts.hintLevel}: ${row.done?.source ?? '?'}${row.done?.reason ? ` (${row.done.reason})` : ''}`);
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
    '| # | Case | Level | Source | Reason | Guard | Reply |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(
      (r, i) =>
        `| ${i + 1} | ${cell(r.facts.caseId)} | ${r.facts.hintLevel} | ${r.done?.source ?? '?'} | ${r.done?.reason ?? ''} | ` +
        `${r.guardOk ? 'ok' : `FAIL ${cell(r.offending.join(' '))}`} | ${cell(r.text)} |`
    ),
    '',
  ];
  const file = dataPath('coach-eval-report.md');
  writeFileAtomic(file, lines.join('\n'));
  console.log(`Report written to ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
