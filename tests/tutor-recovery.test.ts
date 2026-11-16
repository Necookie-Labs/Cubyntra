import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { FACES } from '../src/cube/constants';
import { ORIENTATIONS } from '../src/cube/geometry';
import { gripOf, viewInGrip } from '../src/cube/grip';
import { normalizeOrientation } from '../src/cube/orientation';
import { applyMoves, formatAlgorithm, invertMove, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import { validateCubeState } from '../src/cube/validator';
import { progress, runGuidedSolve } from '../src/tutor';
import { observationOf, verifyCheckpoint } from '../src/tutor/checkpoint';
import { diagnoseMistake } from '../src/tutor/diagnose';
import { MAX_CORRECTIVE_TURNS, decideRecovery, replanFromScan, resumeFrom } from '../src/tutor/recovery';
import { countTurns } from '../src/tutor/helpers';
import { StepPlan } from '../src/tutor/types';
import { INJECTED_KINDS, injectMistake, stateAfter } from './helpers/mistakes';
import { scrambledState, seededRandom } from './helpers/scrambles';

const METHODS = ['beginner', 'cfop'] as const;
const allFaces = (state: CubeState) => FACES.map((face) => observationOf(state, face));
const moves = (plan: StepPlan) => [...plan.setupMoves, ...plan.algorithm];

describe('resumeFrom', () => {
  it('gives a corrective step that reaches the original expected state, or a fresh plan', () => {
    const random = seededRandom(5);
    const seen = { corrective: 0, replan: 0 };
    for (const method of METHODS) {
      for (const plan of runGuidedSolve(scrambledState(111, 1), method).steps) {
        for (const kind of INJECTED_KINDS) {
          const injected = injectMistake(plan, kind, random);
          if (!injected) continue;
          const diagnosis = diagnoseMistake(plan, allFaces(injected.state));
          const recovery = decideRecovery(plan, diagnosis);
          expect(recovery.action, `${plan.caseId} ${kind}`).toBe('resume');
          if (recovery.action !== 'resume') continue;
          expect(recovery.mistake).toBe(diagnosis.likelyMistakes[0]);
          const resume = recovery.resume;
          seen[resume.kind]++;

          if (resume.kind === 'replan') {
            // Too long to take back: a normal plan from the cube as it is.
            const next = resume.plan!;
            expect(next.startState).toEqual(injected.state);
            expect(next.grip).toEqual(plan.gripAfter);
            expect(next.progressAfter).toBeGreaterThan(next.progressBefore);
            continue;
          }
          const fix = resume.plan;
          expect(fix.startState).toEqual(injected.state);
          expect(fix.grip).toEqual(plan.gripAfter);
          expect(fix.gripAfter).toEqual(plan.gripAfter);
          expect(fix.expectedState).toEqual(plan.expectedState);
          expect(applyMoves(fix.startState, moves(fix))).toEqual(plan.expectedState);
          // The shape of every step: regrips first, then layer turns only.
          expect(fix.setupMoves.every((m) => m.kind === 'rotation')).toBe(true);
          expect(fix.algorithm.some((m) => m.kind === 'rotation')).toBe(false);
          expect(fix.algorithm.length).toBeGreaterThan(0);
          expect(countTurns(fix.algorithm)).toBeLessThanOrEqual(MAX_CORRECTIVE_TURNS);
          expect(fix.facts.repeat).toBeUndefined();
          expect(fix.progressBefore).toBe(progress(injected.state, method).value);
          expect(fix.progressAfter).toBe(plan.progressAfter);
          // Undo then redo is the same path, before simplifying.
          expect(applyMoves(injected.state, [...resume.undoMoves, ...resume.redoMoves])).toEqual(plan.expectedState);

          // Its checkpoint passes once fixed and fails if the student does nothing.
          expect(fix.checkpoint.facesToShow).toEqual(plan.checkpoint.facesToShow);
          for (const ref of plan.checkpoint.stickers) expect(fix.checkpoint.stickers).toContainEqual(ref);
          const show = (state: CubeState) => fix.checkpoint.facesToShow.map((f) => observationOf(state, f));
          expect(verifyCheckpoint(fix, show(plan.expectedState)).status).toBe('match');
          const untouched = show(injected.state);
          const visible = fix.checkpoint.facesToShow.some(
            (f) => injected.state[f].join() !== plan.expectedState[f].join()
          );
          expect(verifyCheckpoint(fix, untouched).status).toBe(visible ? 'mismatch' : 'match');
        }
      }
    }
    expect(seen.corrective).toBeGreaterThan(40);
    expect(seen.replan).toBeGreaterThan(0);
  });

  it('fixes a last move turned the wrong way with one double turn', () => {
    const plan = runGuidedSolve(scrambledState(111, 2), 'cfop').steps.find(
      (s) => s.algorithm[s.algorithm.length - 1].quarterTurns !== 2
    )!;
    const list = moves(plan);
    const last = list[list.length - 1];
    const performedMoves = [...list.slice(0, -1), invertMove(last)];
    const resume = resumeFrom(plan, { performedMoves, resultingState: stateAfter(plan, performedMoves) });
    expect(resume.kind).toBe('corrective');
    expect(formatAlgorithm(moves(resume.plan!))).toBe(`${last.notation[0]}2`);
  });

  it('fixes a skipped move in the middle by going back to it', () => {
    const plan = runGuidedSolve(scrambledState(111, 2), 'cfop').steps.find((s) => s.algorithm.length >= 6)!;
    const list = moves(plan);
    const i = list.length - 3;
    const performedMoves = [...list.slice(0, i), ...list.slice(i + 1)];
    const resume = resumeFrom(plan, { performedMoves, resultingState: stateAfter(plan, performedMoves) });
    expect(resume.kind).toBe('corrective');
    if (resume.kind !== 'corrective') return;
    expect(formatAlgorithm(resume.undoMoves)).toBe(formatAlgorithm(parseAlgorithm(formatAlgorithm(list.slice(i + 1))).reverse().map(invertMove)));
    expect(formatAlgorithm(resume.redoMoves)).toBe(formatAlgorithm(list.slice(i)));
    expect(countTurns(resume.plan.algorithm)).toBeLessThanOrEqual(5);
  });

  it('re-holds the cube first when the slip left it held another way', () => {
    const plan = runGuidedSolve(scrambledState(111, 3), 'cfop').steps.find(
      (s) => s.setupMoves[0]?.kind === 'rotation' && s.setupMoves.length + s.algorithm.length <= 6
    );
    if (!plan) throw new Error('No short step with a regrip in this solve');
    const performedMoves = moves(plan).filter((m) => m.kind !== 'rotation');
    const state = stateAfter(plan, performedMoves);
    const resume = resumeFrom(plan, { performedMoves, resultingState: state }, { maxCorrectiveTurns: 40 });
    expect(resume.kind).toBe('corrective');
    expect(applyMoves(state, moves(resume.plan!))).toEqual(plan.expectedState);
    expect(resume.plan!.algorithm.some((m) => m.kind === 'rotation')).toBe(false);
  });

  it('plans afresh when taking the slip back would be longer than the limit', () => {
    const plan = runGuidedSolve(scrambledState(111, 2), 'cfop').steps.find((s) => s.algorithm.length >= 8)!;
    const list = moves(plan);
    const i = plan.setupMoves.length;
    const performedMoves = [...list.slice(0, i), ...list.slice(i + 1)];
    const state = stateAfter(plan, performedMoves);
    const resume = resumeFrom(plan, { performedMoves, resultingState: state }, { maxCorrectiveTurns: 3 });
    expect(resume.kind).toBe('replan');
    expect(resume.plan!.startState).toEqual(state);
    expect(isCubeSolved(runGuidedSolve(state, plan.method, plan.gripAfter).finalState)).toBe(true);
  });
});

describe('decideRecovery', () => {
  const plan = runGuidedSolve(scrambledState(111, 4), 'beginner').steps[3];

  it('asks for a rescan when nothing fits', () => {
    expect(decideRecovery(plan, { likelyMistakes: [], confident: false })).toEqual({
      action: 'needsRescan',
      reason: 'nothing-fits',
    });
  });

  it('asks for a rescan, offering one more face first, when the diagnosis is not confident', () => {
    const injected = injectMistake(plan, 'skipped-move', seededRandom(1))!;
    const diagnosis = diagnoseMistake(plan, allFaces(injected.state));
    expect(decideRecovery(plan, { ...diagnosis, confident: false })).toEqual({
      action: 'needsRescan',
      reason: 'not-confident',
    });
    expect(decideRecovery(plan, { ...diagnosis, confident: false, showNext: 'B' })).toEqual({
      action: 'needsRescan',
      reason: 'not-confident',
      showNext: 'B',
    });
  });
});

describe('replanFromScan', () => {
  it('plans from a rescan held in any of the 24 orientations and solves from there', () => {
    for (const method of METHODS) {
      const solve = runGuidedSolve(scrambledState(112, 1), method);
      const interrupted = solve.steps[Math.floor(solve.steps.length / 2)];
      // The student botched the step beyond diagnosis: the cube is now some other valid cube.
      const cube = applyMoves(interrupted.startState, parseAlgorithm("R U2 F' L D B2"));

      for (const orientation of ORIENTATIONS) {
        const scanned = applyMoves(cube, parseAlgorithm(orientation.rotation.join(' ')));
        expect(validateCubeState(normalizeOrientation(scanned)!.state).valid).toBe(true);

        // Kept in the grip the student was last told to hold.
        const result = replanFromScan(scanned, method, interrupted.gripAfter, interrupted.stepIndex);
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        expect(result.grip).toEqual(interrupted.gripAfter);
        expect(gripOf(result.state)).toEqual(interrupted.gripAfter);
        expect(result.state).toEqual(viewInGrip(cube, interrupted.gripAfter).state);
        const plan = result.plan!;
        expect(plan.startState).toEqual(result.state);
        expect(plan.stepIndex).toBe(interrupted.stepIndex);
        expect(plan.progressAfter).toBeGreaterThan(plan.progressBefore);
        expect(applyMoves(plan.startState, [...plan.setupMoves, ...plan.algorithm])).toEqual(plan.expectedState);
        expect(isCubeSolved(runGuidedSolve(result.state, method, result.grip).finalState)).toBe(true);

        // With no preferred grip, the cube stays as it was scanned.
        const asScanned = replanFromScan(scanned, method);
        expect(asScanned.ok).toBe(true);
        if (!asScanned.ok) continue;
        expect(asScanned.state).toEqual(scanned);
        expect(asScanned.grip).toEqual(gripOf(scanned));
        expect(asScanned.plan!.startState).toEqual(scanned);
      }
    }
  });

  it('returns no plan for a solved cube', () => {
    const solved = runGuidedSolve(scrambledState(112, 2), 'cfop').finalState;
    const result = replanFromScan(applyMoves(solved, parseAlgorithm("x y'")), 'cfop');
    expect(result).toMatchObject({ ok: true, plan: null });
  });

  it('ignores an impossible preferred grip', () => {
    const scanned = scrambledState(112, 3);
    const result = replanFromScan(scanned, 'beginner', { top: 'white', front: 'yellow' });
    expect(result).toMatchObject({ ok: true, grip: gripOf(scanned) });
  });

  it('refuses a scan whose centers do not form a cube', () => {
    const scanned = scrambledState(112, 3);
    const twoWhite = { ...scanned, D: scanned.D.map((c, i) => (i === 4 ? 'white' : c)) } as CubeState;
    const result = replanFromScan(twoWhite, 'cfop');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Scan all six faces again/);
  });
});
