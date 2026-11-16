/**
 * Cubyntra - Tutor store: profile saves are merged operations, queued until the profile loads
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultStudentProfile, type StudentProfile } from '../src/lib/studentProfile';
import { sampleProfile } from './helpers/studentProfile';
import { fakeStudentServer, type FakeStudentServer } from './helpers/fakeStudentServer';

vi.mock('@/solver/client', () => ({ planStepInWorker: vi.fn() }));

const { useTutorStore, flushTutorSaves, pendingProfileOps, resetPendingProfileOps } = await import('../src/stores/useTutorStore');

const store = () => useTutorStore.getState();
const solveAt = (ms: number) => ({ ms, penalty: 'none' as const, at: '2026-11-17T10:00:00.000Z', scramble: "R U R'" });

/** What another device already saved on the laptop. */
function laptopProfile(): StudentProfile {
  const p = sampleProfile();
  return {
    ...p,
    timer: { history: [{ id: 'laptop-1', ...solveAt(20_000) }, { id: 'laptop-2', ...solveAt(22_000) }] },
    trainer: { turn: 3, cards: { sune: { box: 3, due: 9, seen: 3, missed: 0 } }, set: 'oll' },
    stats: { ...p.stats, stepsCompleted: 40, activeDays: ['2026-11-16'] },
  };
}

let server: FakeStudentServer;
const patches = () => server.fetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');

beforeEach(() => {
  server = fakeStudentServer(laptopProfile());
  vi.stubGlobal('fetch', server.fetch);
  resetPendingProfileOps();
  useTutorStore.setState({ token: null, profile: defaultStudentProfile(), profileStatus: 'idle', phase: 'idle', plan: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('profile saves', () => {
  it('sends only what changed, so the server keeps what another device saved', async () => {
    useTutorStore.setState({ token: 'secret' });
    await store().loadProfile();
    // This device's copy is then stale: another device adds a solve meanwhile.
    server.setProfile({
      ...server.profile(),
      timer: { history: [...server.profile().timer.history, { id: 'phone-1', ...solveAt(30_000) }] },
    });
    store().addTimerSolve(solveAt(25_000));
    store().answerTrainerCase('antisune', true);
    await flushTutorSaves();

    const body = JSON.parse(String((patches()[0][1] as RequestInit).body));
    expect(Object.keys(body)).toEqual(['ops', 'batchId']);
    const saved = server.profile();
    expect(saved.timer.history.map((s) => s.id).slice(0, 3)).toEqual(['laptop-1', 'laptop-2', 'phone-1']);
    expect(saved.timer.history).toHaveLength(4);
    expect(saved.trainer.cards).toHaveProperty('sune');
    expect(saved.trainer.cards).toHaveProperty('antisune');
    expect(saved.trainer.turn).toBe(4);
    expect(saved.stats.stepsCompleted).toBe(40);
    expect(store().profileStatus).toBe('ready');
    expect(pendingProfileOps()).toEqual([]);
  });

  it('re-scores and deletes timer solves by id', async () => {
    useTutorStore.setState({ token: 'secret' });
    await store().loadProfile();
    store().addTimerSolve(solveAt(25_000));
    store().setLastTimerPenalty('DNF');
    await flushTutorSaves();
    const mine = store().profile.timer.history.at(-1)!;
    expect(server.profile().timer.history.find((s) => s.id === mine.id)?.penalty).toBe('DNF');
    store().deleteLastTimerSolve();
    await flushTutorSaves();
    expect(server.profile().timer.history.map((s) => s.id)).toEqual(['laptop-1', 'laptop-2']);
  });

  it('queues changes made while the profile loads and applies them on top of it', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const realFetch = server.fetch.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    server.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (!init?.method) await gate;
      return realFetch(url, init);
    });

    useTutorStore.setState({ token: 'secret' });
    const loading = store().loadProfile();
    expect(store().profileStatus).toBe('loading');
    store().updateSettings({ stickerLetters: true });
    store().addTimerSolve(solveAt(19_000));
    await flushTutorSaves();
    // Nothing is sent while loading: a default profile never goes out over the real one.
    expect(patches()).toHaveLength(0);
    expect(store().profileStatus).toBe('loading');

    release();
    await loading;
    await flushTutorSaves();
    expect(patches()).toHaveLength(1);
    const local = store().profile;
    expect(local.name).toBe('Sam');
    expect(local.settings.stickerLetters).toBe(true);
    expect(local.timer.history).toHaveLength(3);
    expect(server.profile()).toEqual(local);
  });

  it('merges an unpaired phone’s changes once it gets a token', async () => {
    store().addTimerSolve(solveAt(31_000));
    store().answerTrainerCase('h-perm', false);
    store().updateSettings({ plainLanguage: false });
    expect(store().profileStatus).toBe('unsaved');
    expect(server.fetch).not.toHaveBeenCalled();
    expect(pendingProfileOps()).toHaveLength(4);

    store().setToken('secret');
    await store().loadProfile();
    await flushTutorSaves();
    const saved = server.profile();
    expect(saved.timer.history).toHaveLength(3);
    expect(Object.keys(saved.trainer.cards).sort()).toEqual(['h-perm', 'sune']);
    expect(saved.settings.plainLanguage).toBe(false);
    expect(saved.name).toBe('Sam');
    expect(saved.currentSolve).toEqual(sampleProfile().currentSolve);
    expect(store().profile).toEqual(saved);
    expect(pendingProfileOps()).toEqual([]);
  });

  it('keeps a batch for later when the server cannot be reached', async () => {
    useTutorStore.setState({ token: 'secret' });
    await store().loadProfile();
    server.fetch.mockImplementationOnce(async () => {
      throw new TypeError('offline');
    });
    store().addTimerSolve(solveAt(25_000));
    await flushTutorSaves();
    expect(store().profileStatus).toBe('unsaved');
    expect(pendingProfileOps()).toHaveLength(1);
    store().updateSettings({ theme: 'dark' });
    await flushTutorSaves();
    expect(pendingProfileOps()).toEqual([]);
    expect(server.profile().timer.history).toHaveLength(3);
    expect(server.profile().settings.theme).toBe('dark');
  });
});
