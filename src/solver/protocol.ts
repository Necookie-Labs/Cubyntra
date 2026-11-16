/**
 * Cubyntra - Worker Message Protocol
 * Necookie Labs (c) 2026
 *
 * Heavy, pure work (Kociemba tables and search, the tutor engine) runs in one Web
 * Worker. Every message carries a `type` discriminator and an `id` that ties the reply to its
 * request. To add a job, add an entry to `WorkerJobs` and a handler in handlers.ts: the client,
 * the worker and the main-thread fallback all pick it up from these types.
 *
 * Everything crossing the boundary is structured-cloneable plain data (states, moves, results).
 */

import type { CubeState } from '../cube/types';
import type { Grip } from '../cube/grip';
import type { GuidedSolve, MethodId, MethodOptions, StepPlan, TutorProgress } from '../tutor/types';
import type { SolveResult } from './types';

/** Each job: what the request carries and what a successful reply returns. */
export interface WorkerJobs {
  /** Builds the Kociemba move and pruning tables (a few seconds, once per worker). */
  init: { payload: Record<never, never>; result: { ready: true } };
  /** Solves a state with the two-phase search (validates it first). */
  solve: { payload: { state: CubeState }; result: SolveResult };
  /**
   * The tutor's next step for a cube held in `grip` (default: as stored), or null when solved.
   * `options` on the tutor jobs are the learner settings (default: none, the method as first taught).
   */
  'tutor.plan': {
    payload: { state: CubeState; method: MethodId; grip?: Grip; stepIndex?: number; options?: MethodOptions };
    result: StepPlan | null;
  };
  /** How far through the method a cube is. */
  'tutor.progress': { payload: { state: CubeState; method: MethodId; options?: MethodOptions }; result: TutorProgress };
  /** Every step of a guided solve, as a student who follows each one would do them. */
  'tutor.guidedSolve': {
    payload: { state: CubeState; method: MethodId; grip?: Grip; options?: MethodOptions };
    result: GuidedSolve;
  };
}

export type WorkerJobType = keyof WorkerJobs;

export type WorkerRequest<K extends WorkerJobType = WorkerJobType> = K extends WorkerJobType
  ? { id: number; type: K } & WorkerJobs[K]['payload']
  : never;

export type WorkerResponse<K extends WorkerJobType = WorkerJobType> = K extends WorkerJobType
  ? { id: number; type: K; ok: true; result: WorkerJobs[K]['result'] } | { id: number; type: K; ok: false; error: string }
  : never;
