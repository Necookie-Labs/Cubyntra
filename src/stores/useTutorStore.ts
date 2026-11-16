/**
 * Cubyntra - Tutor Session Store
 * Necookie Labs (c) 2026
 *
 * The guided solve in progress and the student's profile. Separate from `useCubyntraStore`,
 * which owns the scan. Flow of one step:
 *
 *   loading -> step -> (I did it) checking -> celebrate -> loading (next step) ... -> solved
 *                                      |-> checking (uncertain or wrong face: show again)
 *                                      '-> mismatch -> replay step | continue | rescan | it matches
 *
 * The profile (settings, palette, current solve, stats) is saved to `data/student.json`
 * through `/api/student` whenever it changes, so an interrupted solve resumes. Without an app
 * token (an unpaired phone) everything still works for this visit; it just is not saved.
 */

import { create } from 'zustand';
import type { CubeState, Face } from '@/cube/types';
import { gripOf, type Grip } from '@/cube/grip';
import type { AttemptRecord } from '@/coach/types';
import { planStepInWorker } from '@/solver/client';
import { applyTileEdits, type TileEdit } from '@/tutor/checkpoint';
import type { FaceObservation, MethodId, StepPlan } from '@/tutor/types';
import type { StudentPalette } from '@/vision/palette';
import {
  MAX_SAVED_ATTEMPTS,
  defaultStudentProfile,
  parseStudentProfile,
  type StudentProfile,
  type StudentSettings,
} from '@/lib/studentProfile';
import {
  checkCheckpoint,
  checkWithEdits,
  confirmCheckpointByHand,
  type CheckpointOutcome,
} from '@/app-shell/checkpointAdapter';
import { APP_TOKEN_HEADER } from '@/app-shell/appToken';

export type SolvePhase = 'idle' | 'loading' | 'step' | 'checking' | 'celebrate' | 'mismatch' | 'solved' | 'error';
export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'unsaved';

export interface TutorStore {
  token: string | null;
  profile: StudentProfile;
  profileStatus: ProfileStatus;

  method: MethodId | null;
  /** The cube as the student holds it before the current step. */
  cube: CubeState | null;
  grip: Grip | null;
  stepIndex: number;
  plan: StepPlan | null;
  phase: SolvePhase;
  attempts: AttemptRecord[];
  /** Faces shown so far for this checkpoint (a face shown again replaces its old reading). */
  observations: FaceObservation[];
  checkpoint: CheckpointOutcome | null;
  errorMessage: string | null;

  setToken: (token: string | null) => void;
  loadProfile: () => Promise<void>;
  updateSettings: (patch: Partial<StudentSettings>) => void;
  setName: (name: string) => void;
  savePalette: (palette: StudentPalette) => void;

  startSolve: (state: CubeState, method: MethodId) => Promise<void>;
  /** Picks up the saved solve; resolves false when there is none. */
  resumeSolve: () => Promise<boolean>;
  loadPlan: () => Promise<void>;
  beginCheckpoint: () => void;
  cancelCheckpoint: () => void;
  submitObservation: (observation: FaceObservation) => void;
  editTiles: (face: Face, edits: readonly TileEdit[]) => void;
  confirmByHand: () => void;
  advance: () => Promise<void>;
  replayStep: () => void;
  continueFromDiagnosis: () => Promise<void>;
  abandonSolve: () => void;
}

const now = () => new Date().toISOString();

const SESSION_RESET = {
  method: null,
  cube: null,
  grip: null,
  stepIndex: 0,
  plan: null,
  phase: 'idle' as SolvePhase,
  attempts: [],
  observations: [],
  checkpoint: null,
  errorMessage: null,
};

/** Plans off the main thread; if the worker itself fails, plans once on the main thread. */
async function planStep(state: CubeState, method: MethodId, grip: Grip, stepIndex: number): Promise<StepPlan | null> {
  try {
    return await planStepInWorker(state, method, grip, stepIndex);
  } catch (error) {
    if (error instanceof Error && error.name === 'TutorPlanError') throw error;
    const { planNextStep } = await import('@/tutor');
    return planNextStep(state, method, grip, stepIndex);
  }
}

// Saves are chained so they reach the server in order.
let saveChain: Promise<unknown> = Promise.resolve();

export const useTutorStore = create<TutorStore>((set, get) => {
  const persist = (profile: StudentProfile) => {
    set({ profile });
    const { token } = get();
    if (!token) {
      set({ profileStatus: 'unsaved' });
      return;
    }
    saveChain = saveChain
      .then(() =>
        fetch('/api/student', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', [APP_TOKEN_HEADER]: token },
          body: JSON.stringify(profile),
        })
      )
      .then((res) => set({ profileStatus: res.ok ? 'ready' : 'unsaved' }))
      .catch(() => set({ profileStatus: 'unsaved' }));
  };

  /** Writes the session's solve into the profile. */
  const persistSolve = () => {
    const { profile, method, cube, grip, stepIndex, attempts } = get();
    if (!method || !cube || !grip) return;
    const startedAt = profile.currentSolve?.startedAt ?? now();
    persist({
      ...profile,
      currentSolve: {
        method,
        state: cube,
        grip,
        stepIndex,
        attempts: attempts.slice(-MAX_SAVED_ATTEMPTS),
        startedAt,
        updatedAt: now(),
      },
    });
  };

  const recordOutcome = (outcome: CheckpointOutcome) => {
    const status = outcome.result.status;
    if (status === 'match') {
      set((s) => ({
        checkpoint: outcome,
        phase: 'celebrate',
        attempts: [...s.attempts, { result: 'matched' }],
      }));
    } else if (status === 'mismatch') {
      const mistakes = outcome.diagnosis?.likelyMistakes.slice(0, 3).map((m) => m.kind);
      set((s) => ({
        checkpoint: outcome,
        phase: 'mismatch',
        attempts: [...s.attempts, { result: 'mismatch', ...(mistakes?.length ? { mistakes } : {}) }],
      }));
      persistSolve();
    } else {
      // Uncertain or the wrong face: stay on the camera and say what to show.
      set({ checkpoint: outcome, phase: 'checking' });
    }
  };

  return {
    token: null,
    profile: defaultStudentProfile(),
    profileStatus: 'idle',
    ...SESSION_RESET,

    setToken: (token) => set({ token }),

    loadProfile: async () => {
      const { token } = get();
      if (!token) {
        set({ profileStatus: 'unsaved' });
        return;
      }
      set({ profileStatus: 'loading' });
      try {
        const res = await fetch('/api/student', { headers: { [APP_TOKEN_HEADER]: token }, cache: 'no-store' });
        const parsed = res.ok ? parseStudentProfile(await res.json()) : null;
        if (parsed?.ok) set({ profile: parsed.profile, profileStatus: 'ready' });
        else set({ profileStatus: 'unsaved' });
      } catch {
        set({ profileStatus: 'unsaved' });
      }
    },

    updateSettings: (patch) => {
      const { profile } = get();
      persist({ ...profile, settings: { ...profile.settings, ...patch } });
    },

    setName: (name) => persist({ ...get().profile, name: name.slice(0, 40) }),

    savePalette: (palette) => persist({ ...get().profile, palette }),

    startSolve: async (state, method) => {
      set({ ...SESSION_RESET, method, cube: state, grip: gripOf(state), phase: 'loading' });
      const { profile } = get();
      set({ profile: { ...profile, currentSolve: null } });
      persistSolve();
      await get().loadPlan();
    },

    resumeSolve: async () => {
      const saved = get().profile.currentSolve;
      if (!saved) return false;
      set({
        ...SESSION_RESET,
        method: saved.method,
        cube: saved.state,
        grip: saved.grip,
        stepIndex: saved.stepIndex,
        attempts: saved.attempts,
        phase: 'loading',
      });
      await get().loadPlan();
      return true;
    },

    loadPlan: async () => {
      const { cube, method, grip, stepIndex } = get();
      if (!cube || !method || !grip) return;
      set({ phase: 'loading', plan: null, checkpoint: null, observations: [], errorMessage: null });
      try {
        const plan = await planStep(cube, method, grip, stepIndex);
        // A newer solve may have started while this one planned.
        if (get().cube !== cube) return;
        if (!plan) {
          const { profile } = get();
          persist({
            ...profile,
            currentSolve: null,
            stats: { ...profile.stats, solvesCompleted: profile.stats.solvesCompleted + 1, lastSolveAt: now() },
          });
          set({ phase: 'solved' });
          return;
        }
        set({ plan, phase: 'step' });
      } catch (error) {
        if (get().cube !== cube) return;
        set({
          phase: 'error',
          errorMessage:
            error instanceof Error && error.name === 'TutorPlanError'
              ? 'The tutor could not find a step for this cube. A color was probably misread: scan the cube again.'
              : 'Something went wrong while planning the next step. Try again.',
        });
      }
    },

    beginCheckpoint: () => {
      if (!get().plan) return;
      set({ phase: 'checking', observations: [], checkpoint: null });
    },

    cancelCheckpoint: () => set({ phase: 'step', observations: [], checkpoint: null }),

    submitObservation: (observation) => {
      const { plan, observations, phase } = get();
      // Only while the camera sheet is waiting: a verdict has already been given otherwise.
      if (!plan || phase !== 'checking') return;
      const next = [...observations.filter((o) => o.face !== observation.face), observation];
      set({ observations: next });
      recordOutcome(checkCheckpoint(plan, next));
    },

    editTiles: (face, edits) => {
      const { plan, observations } = get();
      if (!plan) return;
      const outcome = checkWithEdits(plan, observations, face, edits);
      set({ observations: observations.map((o) => (o.face === face ? applyTileEdits(o, edits) : o)) });
      recordOutcome(outcome);
    },

    confirmByHand: () => {
      const { plan } = get();
      if (!plan) return;
      recordOutcome(confirmCheckpointByHand(plan));
    },

    advance: async () => {
      const { plan, profile, stepIndex } = get();
      if (!plan) return;
      set({
        cube: plan.expectedState,
        grip: plan.gripAfter,
        stepIndex: stepIndex + 1,
        attempts: [],
        profile: {
          ...profile,
          stats: {
            ...profile.stats,
            stepsCompleted: profile.stats.stepsCompleted + 1,
            checkpointsPassed: profile.stats.checkpointsPassed + 1,
          },
        },
      });
      persistSolve();
      await get().loadPlan();
    },

    replayStep: () => set({ phase: 'step', checkpoint: null, observations: [] }),

    continueFromDiagnosis: async () => {
      const recovery = get().checkpoint?.recovery;
      if (recovery?.kind !== 'continue') return;
      set({ cube: recovery.state, grip: recovery.grip, attempts: [] });
      persistSolve();
      await get().loadPlan();
    },

    abandonSolve: () => {
      set({ ...SESSION_RESET });
      persist({ ...get().profile, currentSolve: null });
    },
  };
});

/** Waits for profile saves already sent (tests). */
export function flushTutorSaves(): Promise<unknown> {
  return saveChain;
}
