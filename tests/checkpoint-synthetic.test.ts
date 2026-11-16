/**
 * End-to-end checkpoint checks on synthetic photos.
 *
 * Every scenario goes through the real pipeline: a cube state is rendered to pixels with its
 * own lighting and noise, the tiles are sampled, glare is measured, the stickers are classified
 * with the palette built from that student's full scan, and the readings are verified and
 * diagnosed against the plan. Mistakes are injected by `tests/helpers/mistakes.ts`, which does
 * not use the diagnosis code.
 *
 * Set CHECKPOINT_REPORT=<file> to write the measured rates as JSON (the numbers quoted in
 * docs/tutor/CHECKPOINTS.md).
 */

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CubeState, Face } from '../src/cube/types';
import { FACES } from '../src/cube/constants';
import { invertMove } from '../src/cube/transforms';
import { runGuidedSolve } from '../src/tutor';
import { verifyCheckpoint } from '../src/tutor/checkpoint';
import { diagnoseMistake } from '../src/tutor/diagnose';
import { decideRecovery } from '../src/tutor/recovery';
import { MethodId, StepPlan } from '../src/tutor/types';
import { buildStudentPalette, StudentPalette } from '../src/vision/palette';
import { resolveCubeColors } from '../src/vision/resolveCubeColors';
import {
  INJECTED_KINDS,
  InjectedKind,
  injectMistake,
  photographCheckpoint,
  sameOnFaces,
  stateAfter,
} from './helpers/mistakes';
import { scrambledState, seededRandom } from './helpers/scrambles';
import { FADED_PLASTICS, Lighting, PHOTOGRAPHED_RGB, scanSamples } from './helpers/syntheticCube';

const SEED = 121;
const SCRAMBLES_PER_METHOD = 10;
const METHODS: readonly MethodId[] = ['beginner', 'cfop'];

interface Student {
  method: MethodId;
  steps: StepPlan[];
  palette: StudentPalette;
  plastics: typeof PHOTOGRAPHED_RGB;
}

/** Each scramble is one student: their own cube plastics, one full scan, one guided solve. */
function students(): Student[] {
  const list: Student[] = [];
  for (const method of METHODS) {
    for (let n = 0; n < SCRAMBLES_PER_METHOD; n++) {
      const start = scrambledState(SEED, n);
      const plastics = n % 2 === 0 ? PHOTOGRAPHED_RGB : FADED_PLASTICS;
      const samples = scanSamples(start, { plastics, lighting: { noise: 6, seed: 40 + n } });
      const resolved = resolveCubeColors(samples);
      expect(resolved.state).toEqual(start);
      list.push({
        method,
        steps: runGuidedSolve(start, method).steps,
        palette: buildStudentPalette(samples, resolved),
        plastics,
      });
    }
  }
  return list;
}

/**
 * Checkpoint lighting differs from the scan's: 30% dimmer to 8% brighter, warmer or cooler,
 * noisy. Brighter than that and white tiles clip, which the reader reports as not seen (its
 * own test below), exactly as the capture's glare check does for the full scan.
 */
function checkpointLighting(random: () => number): Lighting {
  const warmth = (random() * 2 - 1) * 0.12;
  return {
    gain: 0.7 + random() * 0.38,
    tint: [1 + warmth, 1, 1 - warmth],
    noise: 4 + random() * 6,
    seed: 1 + Math.floor(random() * 1e6),
  };
}

const differsOnSpec = (plan: StepPlan, state: CubeState) =>
  plan.checkpoint.stickers.some((s) => state[s.face][s.index] !== plan.expectedState[s.face][s.index]);

const rate = (hits: number, total: number) => (total === 0 ? 1 : hits / total);
const percent = (hits: number, total: number) => `${(rate(hits, total) * 100).toFixed(2)}% (${hits}/${total})`;

interface KindTally {
  injected: number;
  /** Changed at least one check-spec sticker, so the checkpoint can see it. */
  visible: number;
  detected: number;
  /** Top diagnosis shows the same stickers as the injected cube on the shown faces. */
  topCorrect: number;
  /** Top diagnosis is exactly the injected cube. */
  topExact: number;
  confident: number;
  confidentButWrong: number;
  /** Left the check-spec stickers as expected: the checkpoint passes by design. */
  hidden: number;
  hiddenButMatched: number;
}

const emptyTally = (): KindTally => ({
  injected: 0,
  visible: 0,
  detected: 0,
  topCorrect: 0,
  topExact: 0,
  confident: 0,
  confidentButWrong: 0,
  hidden: 0,
  hiddenButMatched: 0,
});

describe('checkpoint checks on synthetic photos', { timeout: 90_000 }, () => {
  const all = students();
  const stepCount = all.reduce((n, s) => n + s.steps.length, 0);
  const report: Record<string, unknown> = { seed: SEED, students: all.length, steps: stepCount };

  it('collects plans from both methods', () => {
    expect(stepCount).toBeGreaterThan(250);
    for (const method of METHODS) {
      expect(all.filter((s) => s.method === method)).toHaveLength(SCRAMBLES_PER_METHOD);
    }
  });

  it('matches a correctly done step in at least 99% of checks', () => {
    const random = seededRandom(SEED + 1);
    const counts = { match: 0, uncertain: 0, mismatch: 0, 'wrong-face': 0 };
    for (const student of all) {
      for (const plan of student.steps) {
        const shown = photographCheckpoint(plan, plan.expectedState, student.palette, {
          plastics: student.plastics,
          lighting: checkpointLighting(random),
        });
        counts[verifyCheckpoint(plan, shown).status]++;
      }
    }
    report.correctExecution = { ...counts, matchRate: percent(counts.match, stepCount) };
    expect(counts.mismatch).toBe(0);
    expect(counts['wrong-face']).toBe(0);
    expect(rate(counts.match, stepCount)).toBeGreaterThanOrEqual(0.99);
  });

  it('detects each kind of injected mistake and names it first in at least 95% of cases', () => {
    const random = seededRandom(SEED + 2);
    const tallies = Object.fromEntries(INJECTED_KINDS.map((k) => [k, emptyTally()])) as Record<InjectedKind, KindTally>;

    for (const student of all) {
      for (const plan of student.steps) {
        for (const kind of INJECTED_KINDS) {
          const injected = injectMistake(plan, kind, random);
          if (!injected) continue;
          const tally = tallies[kind];
          tally.injected++;
          const shown = photographCheckpoint(plan, injected.state, student.palette, {
            plastics: student.plastics,
            lighting: checkpointLighting(random),
          });
          const result = verifyCheckpoint(plan, shown);

          if (!differsOnSpec(plan, injected.state)) {
            // The slip left every check-spec sticker as expected: by design this passes.
            tally.hidden++;
            if (result.status === 'match') tally.hiddenButMatched++;
            continue;
          }
          tally.visible++;
          if (result.status !== 'mismatch') continue;
          tally.detected++;

          const diagnosis = diagnoseMistake(plan, shown);
          const top = diagnosis.likelyMistakes[0];
          // Cubes that show the same stickers on the shown faces are ties: the top diagnosis
          // is right when it is the injected cube or one the camera cannot tell from it.
          if (top && sameOnFaces(top.resultingState, injected.state, plan.checkpoint.facesToShow)) tally.topCorrect++;
          const exact = Boolean(top) && sameOnFaces(top.resultingState, injected.state, FACES);
          if (exact) tally.topExact++;
          if (diagnosis.confident) {
            tally.confident++;
            if (!exact) tally.confidentButWrong++;
            expect(decideRecovery(plan, diagnosis).action).toBe('resume');
          } else {
            expect(decideRecovery(plan, diagnosis).action).toBe('needsRescan');
          }
        }
      }
    }

    const total = emptyTally();
    for (const kind of INJECTED_KINDS) {
      for (const key of Object.keys(total) as (keyof KindTally)[]) total[key] += tallies[kind][key];
    }
    const summarize = (t: KindTally) => ({
      ...t,
      detectionRate: percent(t.detected, t.visible),
      topDiagnosisRate: percent(t.topCorrect, t.detected),
      exactCubeRate: percent(t.topExact, t.detected),
      confidentRate: percent(t.confident, t.detected),
    });
    report.injectedMistakes = {
      ...Object.fromEntries(INJECTED_KINDS.map((k) => [k, summarize(tallies[k])])),
      all: summarize(total),
    };

    for (const kind of INJECTED_KINDS) {
      const t = tallies[kind];
      expect(t.visible, kind).toBeGreaterThan(20);
      expect(rate(t.detected, t.visible), `${kind} detection`).toBeGreaterThanOrEqual(0.99);
      expect(rate(t.topCorrect, t.detected), `${kind} top diagnosis`).toBeGreaterThanOrEqual(0.95);
      // A confident diagnosis is acted on without a rescan, so it must name the real cube.
      expect(t.confidentButWrong, `${kind} confident but wrong`).toBe(0);
      expect(t.hiddenButMatched, `${kind} hidden`).toBe(t.hidden);
    }
    expect(rate(total.topCorrect, total.detected)).toBeGreaterThanOrEqual(0.95);
  });

  it('finds two slips in one step', () => {
    const random = seededRandom(SEED + 3);
    let detected = 0;
    let topCorrect = 0;
    for (const student of all) {
      for (const plan of student.steps) {
        const moves = [...plan.setupMoves, ...plan.algorithm];
        const quarter = moves.map((m, i) => (m.kind !== 'rotation' && m.quarterTurns !== 2 ? i : -1)).filter((i) => i >= 0);
        if (quarter.length < 2) continue;
        const a = quarter[Math.floor(random() * quarter.length)];
        const b = quarter[Math.floor(random() * quarter.length)];
        if (a === b) continue;
        // One move turned the other way and another one skipped.
        const performed = moves.flatMap((m, i) => (i === a ? [invertMove(m)] : i === b ? [] : [m]));
        const state = stateAfter(plan, performed);
        const shown = photographCheckpoint(plan, state, student.palette, {
          plastics: student.plastics,
          lighting: checkpointLighting(random),
        });
        if (verifyCheckpoint(plan, shown).status !== 'mismatch') continue;
        detected++;
        const top = diagnoseMistake(plan, shown).likelyMistakes[0];
        if (top && sameOnFaces(top.resultingState, state, plan.checkpoint.facesToShow)) topCorrect++;
      }
    }
    report.twoMistakes = { detected, topDiagnosisRate: percent(topCorrect, detected) };
    expect(detected).toBeGreaterThan(100);
    expect(rate(topCorrect, detected)).toBeGreaterThanOrEqual(0.95);
  });

  it('answers "show me again" when glare hides a check-spec sticker, and only then', () => {
    const random = seededRandom(SEED + 4);
    let onSpec = 0;
    let offSpec = 0;
    for (const student of all) {
      for (const plan of student.steps) {
        const options = { plastics: student.plastics, lighting: checkpointLighting(random) };
        const spec = plan.checkpoint.stickers[Math.floor(random() * plan.checkpoint.stickers.length)];
        const glareOn = (face: Face, index: number) =>
          plan.checkpoint.facesToShow.flatMap((f) =>
            photographCheckpoint(plan, plan.expectedState, student.palette, { ...options, glare: f === face ? [index] : [] }, [f])
          );

        const hidden = verifyCheckpoint(plan, glareOn(spec.face, spec.index));
        expect(hidden.status, `${plan.caseId} ${spec.face}${spec.index}`).toBe('uncertain');
        expect(hidden.message).toContain('again');
        onSpec++;

        const inSpec = new Set(plan.checkpoint.stickers.map((s) => `${s.face}${s.index}`));
        const face = plan.checkpoint.facesToShow[0];
        const free = [0, 1, 2, 3, 5, 6, 7, 8].find((i) => !inSpec.has(`${face}${i}`));
        if (free === undefined) continue;
        expect(verifyCheckpoint(plan, glareOn(face, free)).status, `${plan.caseId} off-spec`).toBe('match');
        offSpec++;
      }
    }
    report.glare = { onCheckSpecSticker: `${onSpec}/${onSpec} uncertain`, elsewhere: `${offSpec}/${offSpec} match` };
    expect(onSpec).toBe(stepCount);
    expect(offSpec).toBeGreaterThan(100);
  });

  it('says which face to show when another face is shown', () => {
    const random = seededRandom(SEED + 5);
    let checked = 0;
    for (const student of all) {
      for (const plan of student.steps) {
        const asked = plan.checkpoint.facesToShow[0];
        const others = FACES.filter((f) => f !== asked);
        const shownFace = others[Math.floor(random() * others.length)];
        const options = { plastics: student.plastics, lighting: checkpointLighting(random) };
        const photo = photographCheckpoint(plan, plan.expectedState, student.palette, options, [shownFace])[0];
        const result = verifyCheckpoint(plan, [{ ...photo, face: asked }]);
        expect(result.status).toBe('wrong-face');
        expect(result.wrongFace).toEqual({
          asked,
          askedCenter: plan.expectedState[asked][4],
          shownCenter: plan.expectedState[shownFace][4],
          shown: shownFace,
        });
        checked++;
      }
    }
    report.wrongFace = `${checked}/${checked} reported with the face to show`;
    expect(checked).toBe(stepCount);
  });

  it('still checks without a stored palette, using the static classifier', () => {
    const random = seededRandom(SEED + 6);
    const counts = { match: 0, uncertain: 0, mismatch: 0, 'wrong-face': 0 };
    let total = 0;
    for (const student of all.filter((s) => s.plastics === PHOTOGRAPHED_RGB)) {
      for (const plan of student.steps) {
        const lighting = { noise: 4 + random() * 4, seed: 1 + Math.floor(random() * 1e6) };
        counts[verifyCheckpoint(plan, photographCheckpoint(plan, plan.expectedState, null, { lighting })).status]++;
        total++;
      }
    }
    report.noPalette = { ...counts, matchRate: percent(counts.match, total) };
    expect(counts.mismatch).toBe(0);
    expect(counts['wrong-face']).toBe(0);
    expect(rate(counts.match, total)).toBeGreaterThanOrEqual(0.99);
  });

  it('writes the report when asked', () => {
    const path = process.env.CHECKPOINT_REPORT;
    if (path) writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
    expect(report.correctExecution).toBeDefined();
    expect(report.injectedMistakes).toBeDefined();
  });
});
