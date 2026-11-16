/**
 * Cubyntra - Solver Web Worker
 * Necookie Labs (c) 2026
 *
 * Runs table building and search off the main thread. Loaded by client.ts with
 * `new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })`, which
 * Turbopack and webpack both bundle as a separate worker chunk.
 */

import { dispatch } from './handlers';
import type { WorkerRequest, WorkerResponse } from './protocol';

// Typed narrowly instead of pulling in the "webworker" lib, whose globals clash with "dom".
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

scope.onmessage = (event) => {
  void dispatch(event.data).then((response) => scope.postMessage(response));
};
