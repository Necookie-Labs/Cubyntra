/**
 * Cubyntra - Worker Job Handlers
 * Necookie Labs (c) 2026
 *
 * The work behind each message type. Runs inside solver.worker.ts, or on the main thread when
 * Workers are unavailable (tests, very old browsers). No DOM access here.
 */

import { ensureSolverInitialized, solveCube } from './solver';
import { planNextStep, progress, runGuidedSolve } from '../tutor/api';
import type { WorkerJobs, WorkerJobType, WorkerRequest, WorkerResponse } from './protocol';

type Handlers = {
  [K in WorkerJobType]: (request: WorkerRequest<K>) => Promise<WorkerJobs[K]['result']>;
};

export const handlers: Handlers = {
  init: async () => {
    ensureSolverInitialized();
    return { ready: true };
  },
  solve: async ({ state }) => solveCube(state),
  'tutor.plan': async ({ state, method, grip, stepIndex, options }) =>
    planNextStep(state, method, grip, stepIndex, options),
  'tutor.progress': async ({ state, method, options }) => progress(state, method, options),
  'tutor.guidedSolve': async ({ state, method, grip, options }) => runGuidedSolve(state, method, grip, options),
};

/** Runs one request and wraps the outcome (or the error) in a reply. Never throws. */
export async function dispatch(request: WorkerRequest): Promise<WorkerResponse> {
  const { id, type } = request;
  const handler = handlers[type] as ((r: WorkerRequest) => Promise<unknown>) | undefined;
  if (!handler) return { id, type, ok: false, error: `Unknown worker job: ${String(type)}` } as WorkerResponse;
  try {
    const result = await handler(request);
    return { id, type, ok: true, result } as WorkerResponse;
  } catch (err) {
    return { id, type, ok: false, error: err instanceof Error ? err.message : String(err) } as WorkerResponse;
  }
}
