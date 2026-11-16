/**
 * Cubyntra - Typed Worker Client
 * Necookie Labs (c) 2026
 *
 * Sends jobs to solver.worker.ts and resolves with their typed results, so building the
 * Kociemba tables and searching never block the main thread. Falls back to running the same
 * handlers on the main thread when Workers are unavailable (tests, server rendering) or when the
 * worker fails to load; requests in flight at that moment are re-run locally.
 */

import type { CubeState } from '../cube/types';
import type { Grip } from '../cube/grip';
import type { GuidedSolve, MethodId, MethodOptions, StepPlan, TutorProgress } from '../tutor/types';
import type { SolveResult } from './types';
import type { WorkerJobs, WorkerJobType, WorkerRequest, WorkerResponse } from './protocol';

/** The part of `Worker` the client uses, so tests can supply a fake. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerResponse>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  terminate(): void;
}

export interface SolverClientOptions {
  /** Creates the worker; return null to run on the main thread. */
  createWorker?: () => WorkerLike | null;
}

interface Pending {
  request: WorkerRequest;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

function createDefaultWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  } catch {
    return null;
  }
}

export class SolverClient {
  private readonly createWorker: () => WorkerLike | null;
  /** undefined until first use; null once running on the main thread. */
  private worker: WorkerLike | null | undefined;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(options: SolverClientOptions = {}) {
    this.createWorker = options.createWorker ?? createDefaultWorker;
  }

  /** Runs a job and resolves with its result, or rejects with the job's error. */
  public request<K extends WorkerJobType>(type: K, payload: WorkerJobs[K]['payload']): Promise<WorkerJobs[K]['result']> {
    const request = { ...payload, id: this.nextId++, type } as WorkerRequest<K>;
    const worker = this.getWorker();
    if (!worker) return this.runLocally(request) as Promise<WorkerJobs[K]['result']>;
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { request, resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage(request);
    });
  }

  /** True while jobs go to a worker rather than the main thread. */
  public usesWorker(): boolean {
    return Boolean(this.getWorker());
  }

  public terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private getWorker(): WorkerLike | null {
    if (this.worker === undefined) {
      this.worker = this.createWorker();
      if (this.worker) {
        this.worker.addEventListener('message', this.onMessage);
        this.worker.addEventListener('error', this.onFailure);
        this.worker.addEventListener('messageerror', this.onFailure);
      }
    }
    return this.worker;
  }

  private onMessage = (event: MessageEvent<WorkerResponse>): void => {
    const response = event.data;
    const entry = this.pending.get(response.id);
    if (!entry) return;
    this.pending.delete(response.id);
    if (response.ok) entry.resolve(response.result);
    else entry.reject(new Error(response.error));
  };

  /** The worker could not load or crashed: switch to the main thread and re-run what was waiting. */
  private onFailure = (): void => {
    this.worker?.terminate();
    this.worker = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const entry of waiting) this.runLocally(entry.request).then(entry.resolve, entry.reject);
  };

  private async runLocally(request: WorkerRequest): Promise<unknown> {
    const { dispatch } = await import('./handlers');
    const response = await dispatch(request);
    if (!response.ok) throw new Error(response.error);
    return response.result;
  }
}

let shared: SolverClient | null = null;

/** The app-wide client (one worker per page). */
export function getSolverClient(): SolverClient {
  shared ??= new SolverClient();
  return shared;
}

/** Solves `state` off the main thread when possible. */
export function solveInWorker(state: CubeState): Promise<SolveResult> {
  return getSolverClient().request('solve', { state });
}

/** Starts building the solver tables in the background, so the first solve is quick. */
export function warmUpSolver(): void {
  getSolverClient()
    .request('init', {})
    .catch(() => {
      // A failed warm-up only means the first solve builds the tables itself.
    });
}

/**
 * The tutor's next step for `state` held in `grip`, planned off the main thread when possible.
 * Resolves with null when the cube is solved; rejects with the plan error otherwise.
 */
export function planStepInWorker(
  state: CubeState,
  method: MethodId,
  grip?: Grip,
  stepIndex?: number,
  options?: MethodOptions
): Promise<StepPlan | null> {
  return getSolverClient().request('tutor.plan', { state, method, grip, stepIndex, options });
}

/** How far through `method` the cube is, computed off the main thread when possible. */
export function tutorProgressInWorker(
  state: CubeState,
  method: MethodId,
  options?: MethodOptions
): Promise<TutorProgress> {
  return getSolverClient().request('tutor.progress', { state, method, options });
}

/** A whole guided solve (every step), computed off the main thread when possible. */
export function guidedSolveInWorker(
  state: CubeState,
  method: MethodId,
  grip?: Grip,
  options?: MethodOptions
): Promise<GuidedSolve> {
  return getSolverClient().request('tutor.guidedSolve', { state, method, grip, options });
}
