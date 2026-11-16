/**
 * Solver worker protocol: the job handlers, the worker entry point and the typed client, with a
 * fake worker standing in for a real one.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import { dispatch } from '../src/solver/handlers';
import { SolverClient, type WorkerLike } from '../src/solver/client';
import { ensureSolverInitialized } from '../src/solver/solver';
import type { WorkerRequest, WorkerResponse } from '../src/solver/protocol';

const scrambled = applyMoves(createSolvedCubeState(), parseAlgorithm("R U R' U' F2 D L' B"));

beforeAll(() => ensureSolverInitialized());

/** Answers like the real worker, asynchronously, through dispatch(). */
class FakeWorker implements WorkerLike {
  posted: WorkerRequest[] = [];
  terminated = false;
  private listeners: Record<string, Array<(e: never) => void>> = {};

  addEventListener(type: string, listener: (e: never) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }
  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
    // Structured clone, like a real worker boundary.
    void dispatch(structuredClone(message)).then((data) => this.emit('message', { data }));
  }
  emit(type: string, event: unknown): void {
    for (const l of this.listeners[type] ?? []) l(event as never);
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('dispatch (job handlers)', () => {
  it('solves and tags the reply with the request id and type', async () => {
    const reply = await dispatch({ id: 7, type: 'solve', state: scrambled });
    expect(reply).toMatchObject({ id: 7, type: 'solve', ok: true });
    const result = (reply as Extract<WorkerResponse, { ok: true; type: 'solve' }>).result;
    expect(result.success).toBe(true);
    expect(isCubeSolved(applyMoves(scrambled, result.moves))).toBe(true);
  });

  it('answers init once the tables exist', async () => {
    expect(await dispatch({ id: 1, type: 'init' })).toEqual({ id: 1, type: 'init', ok: true, result: { ready: true } });
  });

  it('turns unknown jobs and handler errors into error replies instead of throwing', async () => {
    const unknown = await dispatch({ id: 2, type: 'nope' } as unknown as WorkerRequest);
    expect(unknown).toMatchObject({ id: 2, ok: false, error: expect.stringMatching(/Unknown worker job/) });
    const bad = await dispatch({ id: 3, type: 'solve', state: null } as unknown as WorkerRequest);
    expect(bad).toMatchObject({ id: 3, type: 'solve', ok: false });
  });
});

describe('solver.worker entry point', () => {
  it('replies to each message through postMessage', async () => {
    const posted: WorkerResponse[] = [];
    const scope: { onmessage: ((e: { data: WorkerRequest }) => void) | null; postMessage: (m: WorkerResponse) => void } = {
      onmessage: null,
      postMessage: (m) => posted.push(m),
    };
    vi.stubGlobal('self', scope);
    try {
      await import('../src/solver/solver.worker');
      scope.onmessage!({ data: { id: 11, type: 'init' } });
      await vi.waitFor(() => expect(posted).toHaveLength(1));
      expect(posted[0]).toMatchObject({ id: 11, type: 'init', ok: true });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('SolverClient', () => {
  it('runs on the main thread when there is no Worker', async () => {
    const client = new SolverClient({ createWorker: () => null });
    expect(client.usesWorker()).toBe(false);
    const result = await client.request('solve', { state: scrambled });
    expect(isCubeSolved(applyMoves(scrambled, result.moves))).toBe(true);
  });

  it('defaults to the main thread where Worker is undefined (tests, server)', async () => {
    expect(typeof Worker).toBe('undefined');
    expect(new SolverClient().usesWorker()).toBe(false);
  });

  it('sends typed jobs to the worker and matches concurrent replies by id', async () => {
    const worker = new FakeWorker();
    const client = new SolverClient({ createWorker: () => worker });
    const [ready, solved, trivial] = await Promise.all([
      client.request('init', {}),
      client.request('solve', { state: scrambled }),
      client.request('solve', { state: createSolvedCubeState() }),
    ]);
    expect(ready).toEqual({ ready: true });
    expect(isCubeSolved(applyMoves(scrambled, solved.moves))).toBe(true);
    expect(trivial.moveCount).toBe(0);
    expect(worker.posted.map((m) => m.type)).toEqual(['init', 'solve', 'solve']);
    expect(new Set(worker.posted.map((m) => m.id)).size).toBe(3);
  });

  it('rejects with the job error', async () => {
    const client = new SolverClient({ createWorker: () => new FakeWorker() });
    await expect(client.request('solve', { state: null as never })).rejects.toThrow();
  });

  it('falls back to the main thread when the worker fails, re-running what was waiting', async () => {
    const worker = new FakeWorker();
    worker.postMessage = function (message) {
      this.posted.push(message); // a broken worker: never answers
    };
    const client = new SolverClient({ createWorker: () => worker });
    const waiting = client.request('solve', { state: scrambled });
    worker.emit('error', new Event('error'));
    const result = await waiting;
    expect(isCubeSolved(applyMoves(scrambled, result.moves))).toBe(true);
    expect(worker.terminated).toBe(true);
    expect(client.usesWorker()).toBe(false);
    await expect(client.request('init', {})).resolves.toEqual({ ready: true });
  });
});
