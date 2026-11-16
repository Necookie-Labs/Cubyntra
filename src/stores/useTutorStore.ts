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
 * The profile (settings, palette, current solve, stats, trainer, timer) is saved to
 * `data/student.json` through `PATCH /api/student` whenever it changes, so an interrupted solve
 * resumes. Every change is an operation (`src/lib/profileOps.ts`) applied to the local copy at
 * once and queued for the server, which merges it into the profile it has: a paired phone or a
 * second tab adds to what the laptop saved instead of overwriting it.
 *
 * Operations wait in the queue until the profile has loaded (so a change made while it loads is
 * applied on top of the loaded profile, never over it) and while there is no app token (an
 * unpaired phone): everything still works for this visit, and once a token arrives and the
 * profile loads, the queued changes are merged into it and sent.
 */

import { create } from 'zustand';
import type { CubeState, Face } from '@/cube/types';
import { gripOf, viewInGrip, type Grip } from '@/cube/grip';
import type { AttemptRecord } from '@/coach/types';
import { planStepInWorker } from '@/solver/client';
import { applyTileEdits, type TileEdit } from '@/tutor/checkpoint';
import type { FaceObservation, MethodId, MethodOptions, StepPlan } from '@/tutor/types';
import type { StudentPalette } from '@/vision/palette';
import { completedStage, localDay, stageKey } from '@/learn/mastery';
import { type HintUse, type Penalty, type TimerSolve, type TrainerSetId } from '@/learn/types';
import { applyProfileOps, type ProfileOp } from '@/lib/profileOps';
import {
  MAX_SAVED_ATTEMPTS,
  defaultStudentProfile,
  parseStudentProfile,
  type CurrentSolve,
  type StudentProfile,
  type StudentSettings,
} from '@/lib/studentProfile';
import {
  checkCheckpoint,
  checkWithEdits,
  confirmCheckpointByHand,
  faceToShowNext,
  replanAfterRescan,
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
  /** The highest coach hint asked for on the stage in progress (recorded for mastery). */
  stageHint: HintUse;

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
  /** Follows a confident diagnosis: a corrective step, or a fresh plan from the cube as it is. */
  continueFromDiagnosis: () => void;
  /** Back to the camera, keeping what was shown, to show the face the diagnosis asks for. */
  showNextFace: () => void;
  /** A full rescan taken during this solve: plan again from the scanned cube. */
  replanFromRescan: (scanned: CubeState) => void;
  /** The student holds the cube differently (e.g. relayed from the paired device): re-plan. */
  setGrip: (grip: Grip) => Promise<void>;
  /** A checkpoint verdict reached on the paired device for the current step. */
  applyRemoteCheckpoint: (remote: RemoteCheckpoint) => void;
  /**
   * Joins the step the paired device is showing, when no solve is open here: the same cube,
   * grip and step number plan the very same step (the tutor is deterministic).
   */
  followRemoteStep: (remote: RemoteStep) => Promise<void>;
  abandonSolve: () => void;
  /** The coach was asked for a hint at `level` on the current step. */
  noteHint: (level: HintUse) => void;

  /** Trainer: a case was answered (got it or missed it). */
  answerTrainerCase: (caseId: string, correct: boolean) => void;
  setTrainerSet: (set: TrainerSetId) => void;

  /** Timer: a finished solve, the penalty of the newest solve, or dropping it. */
  addTimerSolve: (solve: TimerSolve) => void;
  setLastTimerPenalty: (penalty: Penalty) => void;
  deleteLastTimerSolve: () => void;
}

export interface RemoteStep {
  /** The cube at the start of the step, as held (its centers give the grip). */
  state: CubeState;
  method: MethodId;
  stepIndex: number;
}

export interface RemoteCheckpoint {
  stepIndex: number;
  result: 'matched' | 'mismatch' | 'unsure';
  mistakes?: AttemptRecord['mistakes'];
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
  stageHint: 0 as HintUse,
};

/** The learner settings that pick a method's variant (only CFOP's last layer so far). */
export function methodOptionsFor(method: MethodId, settings: Pick<StudentSettings, 'lastLayer'>): MethodOptions | undefined {
  return method === 'cfop' && settings.lastLayer === 'full' ? { lastLayer: 'full' } : undefined;
}

/** Plans off the main thread; if the worker itself fails, plans once on the main thread. */
async function planStep(
  state: CubeState,
  method: MethodId,
  grip: Grip,
  stepIndex: number,
  options?: MethodOptions
): Promise<StepPlan | null> {
  try {
    return options
      ? await planStepInWorker(state, method, grip, stepIndex, options)
      : await planStepInWorker(state, method, grip, stepIndex);
  } catch (error) {
    if (error instanceof Error && error.name === 'TutorPlanError') throw error;
    const { planNextStep } = await import('@/tutor');
    return planNextStep(state, method, grip, stepIndex, options);
  }
}

const today = () => localDay(new Date());

/** A queue this long means the server has been out of reach for a long time; the oldest go. */
const MAX_PENDING_OPS = 2000;

// Operations applied locally and not yet acknowledged by the server, oldest first.
let pendingOps: ProfileOp[] = [];
// Sends are chained so they reach the server in order, one batch at a time.
let saveChain: Promise<unknown> = Promise.resolve();
// `updatedAt` must grow even for two saves in the same millisecond.
let lastStamp = 0;
const stamp = () => {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
};

const newId = () =>
  globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

export const useTutorStore = create<TutorStore>((set, get) => {
  /** Sends everything queued, if there is a token and the profile has loaded (or failed to). */
  const flush = () => {
    const { token, profileStatus } = get();
    if (!token || profileStatus === 'idle' || profileStatus === 'loading') return;
    saveChain = saveChain.then(async () => {
      const batch = pendingOps;
      if (!batch.length) return;
      // The token may have changed while earlier batches were in flight.
      const current = get().token;
      if (!current) return;
      pendingOps = [];
      try {
        const res = await fetch('/api/student', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', [APP_TOKEN_HEADER]: current },
          body: JSON.stringify({ ops: batch, batchId: newId() }),
        });
        if (res.ok) {
          set({ profileStatus: 'ready' });
        } else if (res.status === 400 || res.status === 413) {
          // The server will never take this batch: keep the local copy, drop the batch.
          set({ profileStatus: 'unsaved' });
        } else {
          pendingOps = [...batch, ...pendingOps].slice(-MAX_PENDING_OPS);
          set({ profileStatus: 'unsaved' });
        }
      } catch {
        pendingOps = [...batch, ...pendingOps].slice(-MAX_PENDING_OPS);
        set({ profileStatus: 'unsaved' });
      }
    });
  };

  /** Applies operations to the local profile now and queues them for the server. */
  const commit = (...ops: ProfileOp[]) => {
    if (!ops.length) return;
    set((s) => ({ profile: applyProfileOps(s.profile, ops) }));
    pendingOps = [...pendingOps, ...ops].slice(-MAX_PENDING_OPS);
    if (!get().token) {
      if (get().profileStatus !== 'loading') set({ profileStatus: 'unsaved' });
      return;
    }
    flush();
  };

  /** The session's solve as it should be saved. */
  const solveRecord = (): CurrentSolve | null => {
    const { profile, method, cube, grip, stepIndex, attempts, stageHint } = get();
    if (!method || !cube || !grip) return null;
    return {
      method,
      state: cube,
      grip,
      stepIndex,
      attempts: attempts.slice(-MAX_SAVED_ATTEMPTS),
      ...(stageHint > 0 ? { stageHint } : {}),
      startedAt: profile.currentSolve?.startedAt ?? stamp(),
      updatedAt: stamp(),
    };
  };

  /** Writes the session's solve into the profile. */
  const persistSolve = (...alongside: ProfileOp[]) => {
    const solve = solveRecord();
    commit(...alongside, ...(solve ? [{ op: 'setCurrentSolve' as const, solve }] : []));
  };

  /** Clears the saved solve (finished or abandoned), closing it so a late save cannot revive it. */
  const clearSolveOp = (): ProfileOp[] => {
    const startedAt = get().profile.currentSolve?.startedAt;
    return startedAt ? [{ op: 'clearCurrentSolve', startedAt }] : [];
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
      // Batches already on their way land first, so the profile read includes them.
      await saveChain;
      try {
        const res = await fetch('/api/student', { headers: { [APP_TOKEN_HEADER]: token }, cache: 'no-store' });
        const parsed = res.ok ? parseStudentProfile(await res.json()) : null;
        // Changes made before the profile arrived (while loading, or before the token) go on top.
        if (parsed?.ok) set({ profile: applyProfileOps(parsed.profile, pendingOps), profileStatus: 'ready' });
        else set({ profileStatus: 'unsaved' });
      } catch {
        set({ profileStatus: 'unsaved' });
      }
      flush();
    },

    updateSettings: (patch) => commit({ op: 'setSettings', settings: patch }),

    setName: (name) => commit({ op: 'setName', name: name.slice(0, 40) }),

    savePalette: (palette) => commit({ op: 'setPalette', palette }),

    startSolve: async (state, method) => {
      const closing = clearSolveOp();
      set({ ...SESSION_RESET, method, cube: state, grip: gripOf(state), phase: 'loading' });
      commit(...closing);
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
        stageHint: saved.stageHint ?? 0,
        phase: 'loading',
      });
      await get().loadPlan();
      return true;
    },

    loadPlan: async () => {
      const { cube, method, grip, stepIndex, profile: before } = get();
      if (!cube || !method || !grip) return;
      set({ phase: 'loading', plan: null, checkpoint: null, observations: [], errorMessage: null });
      try {
        const plan = await planStep(cube, method, grip, stepIndex, methodOptionsFor(method, before.settings));
        // A newer solve may have started while this one planned.
        if (get().cube !== cube) return;
        if (!plan) {
          commit(
            ...clearSolveOp(),
            { op: 'incrementStats', solvesCompleted: 1 },
            { op: 'setLastSolveAt', at: now() },
            { op: 'addActiveDay', day: today() }
          );
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
      const { plan, stepIndex, stageHint } = get();
      if (!plan) return;
      // A step that finished its stage records the stage with the highest hint it needed.
      const finished = completedStage(plan);
      set({
        cube: plan.expectedState,
        grip: plan.gripAfter,
        stepIndex: stepIndex + 1,
        attempts: [],
        stageHint: finished ? 0 : stageHint,
      });
      persistSolve(
        { op: 'incrementStats', stepsCompleted: 1, checkpointsPassed: 1 },
        ...(finished ? [{ op: 'recordStage' as const, key: stageKey(plan.method, finished), hint: stageHint }] : [])
      );
      await get().loadPlan();
    },

    replayStep: () => set({ phase: 'step', checkpoint: null, observations: [] }),

    continueFromDiagnosis: () => {
      const recovery = get().checkpoint?.recovery;
      if (recovery?.action !== 'resume') return;
      const next = recovery.resume.plan;
      if (!next) {
        // The cube the student has is already solved.
        set({ cube: recovery.mistake.resultingState, plan: null, checkpoint: null, observations: [] });
        void get().loadPlan();
        return;
      }
      set({
        cube: next.startState,
        grip: next.grip,
        plan: next,
        phase: 'step',
        checkpoint: null,
        observations: [],
      });
      persistSolve();
    },

    showNextFace: () => {
      if (!faceToShowNext(get().checkpoint)) return;
      set({ phase: 'checking' });
    },

    replanFromRescan: (scanned) => {
      const { method, plan, grip, stepIndex, profile } = get();
      if (!method) return;
      const replan = replanAfterRescan(
        scanned,
        method,
        plan?.gripAfter ?? grip ?? undefined,
        stepIndex,
        methodOptionsFor(method, profile.settings)
      );
      if (!replan.ok) {
        set({ cube: scanned, plan: null, phase: 'error', errorMessage: replan.reason });
        return;
      }
      set({
        cube: replan.state,
        grip: replan.grip,
        plan: replan.plan,
        phase: replan.plan ? 'step' : 'solved',
        attempts: [],
        checkpoint: null,
        observations: [],
        errorMessage: null,
      });
      persistSolve();
    },

    setGrip: async (next) => {
      const { grip, cube, phase } = get();
      if (!cube || (grip && grip.top === next.top && grip.front === next.front)) return;
      if (phase !== 'step' && phase !== 'loading') return;
      try {
        set({ cube: viewInGrip(cube, next).state, grip: next });
      } catch {
        return; // not a way this cube can be held
      }
      persistSolve();
      await get().loadPlan();
    },

    applyRemoteCheckpoint: (remote) => {
      const { plan, phase } = get();
      if (!plan || remote.stepIndex !== plan.stepIndex) return;
      if (phase === 'celebrate' || phase === 'loading') return;
      if (remote.result === 'matched') {
        set((s) => ({
          checkpoint: confirmCheckpointByHand(plan),
          phase: 'celebrate',
          attempts: [...s.attempts, { result: 'matched' }],
        }));
      } else {
        set((s) => ({
          attempts: [
            ...s.attempts,
            { result: remote.result, ...(remote.mistakes?.length ? { mistakes: remote.mistakes } : {}) },
          ],
        }));
        persistSolve();
      }
    },

    followRemoteStep: async ({ state, method, stepIndex }) => {
      const { phase } = get();
      if (phase !== 'idle' && phase !== 'solved') return;
      set({ ...SESSION_RESET, method, cube: state, grip: gripOf(state), stepIndex, phase: 'loading' });
      persistSolve();
      await get().loadPlan();
    },

    abandonSolve: () => {
      set({ ...SESSION_RESET });
      commit(...clearSolveOp());
    },

    noteHint: (level) => {
      if (level <= get().stageHint) return;
      set({ stageHint: level });
      persistSolve();
    },

    answerTrainerCase: (caseId, correct) =>
      commit({ op: 'answerTrainerCase', caseId, correct }, { op: 'addActiveDay', day: today() }),

    setTrainerSet: (trainerSet) => {
      if (get().profile.trainer.set === trainerSet) return;
      commit({ op: 'setTrainerSet', set: trainerSet });
    },

    addTimerSolve: (solve) => commit({ op: 'addTimerSolve', solve: { ...solve, id: solve.id ?? newId() } }),

    setLastTimerPenalty: (penalty) => {
      const last = get().profile.timer.history.at(-1);
      if (!last?.id) return;
      commit({ op: 'setTimerPenalty', id: last.id, penalty });
    },

    deleteLastTimerSolve: () => {
      const last = get().profile.timer.history.at(-1);
      if (!last?.id) return;
      commit({ op: 'deleteTimerSolve', id: last.id });
    },
  };
});

/** Waits for profile saves already sent (tests). */
export function flushTutorSaves(): Promise<unknown> {
  return saveChain;
}

/** Operations waiting for the server (tests). */
export function pendingProfileOps(): readonly ProfileOp[] {
  return pendingOps;
}

/** Forgets queued operations (tests: a fresh store between cases). */
export function resetPendingProfileOps(): void {
  pendingOps = [];
}
