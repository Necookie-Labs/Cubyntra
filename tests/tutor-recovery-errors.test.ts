/**
 * Cubyntra - A planner error during recovery never leaves the student stuck
 * Necookie Labs (c) 2026
 *
 * `resumeFrom` re-plans from the diagnosed cube when a corrective step would be too long. If the
 * planner throws (`TutorPlanError`, e.g. a misread color gives an impossible cube), recovery asks
 * for a rescan, and the store never throws from a checkpoint click.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FACES } from '../src/cube/constants';
import { observationOf } from '../src/tutor/checkpoint';
import { TutorPlanError, type StepPlan } from '../src/tutor/types';
import { defaultStudentProfile } from '../src/lib/studentProfile';
import { INJECTED_KINDS, injectMistake } from './helpers/mistakes';
import { scrambledState, seededRandom } from './helpers/scrambles';

const failPlanning = vi.hoisted(() => ({ on: false }));
vi.mock('../src/tutor/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/tutor/api')>();
  return {
    ...actual,
    planNextStep: (...args: Parameters<typeof actual.planNextStep>) => {
      if (failPlanning.on) throw new TutorPlanError('no plan for this cube');
      return actual.planNextStep(...args);
    },
  };
});
const adapter = vi.hoisted(() => ({ throwOnCheck: false }));
vi.mock('@/app-shell/checkpointAdapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app-shell/checkpointAdapter')>();
  return {
    ...actual,
    checkCheckpoint: (...args: Parameters<typeof actual.checkCheckpoint>) => {
      if (adapter.throwOnCheck) throw new RangeError('unexpected');
      return actual.checkCheckpoint(...args);
    },
  };
});
vi.mock('@/solver/client', async () => {
  const { planNextStep } = await import('../src/tutor/api');
  return { planStepInWorker: vi.fn(async (s, m, g, i) => planNextStep(s, m, g, i)) };
});

const { runGuidedSolve } = await import('../src/tutor');
const { decideRecovery } = await import('../src/tutor/recovery');
const { diagnoseMistake } = await import('../src/tutor/diagnose');
const { useTutorStore, resetPendingProfileOps } = await import('../src/stores/useTutorStore');

/** A plan and a confidently diagnosed slip on it. */
function confidentSlip(): { plan: StepPlan; state: StepPlan['startState'] } {
  const random = seededRandom(9);
  for (const plan of runGuidedSolve(scrambledState(21, 2), 'cfop').steps) {
    for (const kind of INJECTED_KINDS) {
      const injected = injectMistake(plan, kind, random);
      if (!injected) continue;
      const diagnosis = diagnoseMistake(plan, FACES.map((f) => observationOf(injected.state, f)));
      if (diagnosis.confident) return { plan, state: injected.state };
    }
  }
  throw new Error('no confident slip found');
}

beforeEach(() => {
  failPlanning.on = false;
  adapter.throwOnCheck = false;
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(defaultStudentProfile())));
  resetPendingProfileOps();
  useTutorStore.setState({ token: null, profile: defaultStudentProfile(), profileStatus: 'unsaved' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('decideRecovery', () => {
  it('asks for a rescan when re-planning from the diagnosed cube throws', () => {
    const { plan, state } = confidentSlip();
    const diagnosis = diagnoseMistake(plan, FACES.map((f) => observationOf(state, f)));
    failPlanning.on = true;
    // No corrective step allowed: recovery has to re-plan, and the planner throws.
    const recovery = decideRecovery(plan, diagnosis, { maxCorrectiveTurns: 0 });
    expect(recovery).toEqual({ action: 'needsRescan', reason: 'no-plan' });
  });
});

describe('useTutorStore checkpoint errors', () => {
  const startAndCheck = async () => {
    const { plan, state } = confidentSlip();
    useTutorStore.setState({
      method: 'cfop',
      cube: plan.startState,
      grip: plan.grip,
      stepIndex: plan.stepIndex,
      plan,
      phase: 'step',
      attempts: [],
      observations: [],
      checkpoint: null,
    });
    useTutorStore.getState().beginCheckpoint();
    return { plan, state };
  };

  it('never throws from submitObservation when the planner fails during recovery', async () => {
    const { state } = await startAndCheck();
    failPlanning.on = true;
    expect(() => {
      for (const f of FACES) useTutorStore.getState().submitObservation(observationOf(state, f));
    }).not.toThrow();
    const s = useTutorStore.getState();
    expect(s.phase).not.toBe('checking');
    expect(['mismatch', 'error']).toContain(s.phase);
  });

  it('moves to the error screen with a message on any unexpected error', async () => {
    const { state } = await startAndCheck();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adapter.throwOnCheck = true;
    expect(() => useTutorStore.getState().submitObservation(observationOf(state, 'U'))).not.toThrow();
    const s = useTutorStore.getState();
    expect(s.phase).toBe('error');
    expect(s.errorMessage).toMatch(/checking the cube/);
    // "Try again" re-plans the step and the student is back on it.
    adapter.throwOnCheck = false;
    await useTutorStore.getState().loadPlan();
    expect(useTutorStore.getState().phase).toBe('step');
  });
});
