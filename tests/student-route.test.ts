/**
 * Cubyntra - /api/student route
 * Necookie Labs (c) 2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as route from '../src/app/api/student/route';
import { APP_TOKEN_HEADER, getAppSecret } from '../src/lib/localAuth';
import type { ProfileOp } from '../src/lib/profileOps';
import { MAX_STUDENT_BYTES, STUDENT_PROFILE_VERSION, defaultStudentProfile, type CurrentSolve, type StudentProfile } from '../src/lib/studentProfile';
import { useScratchDataDir } from './helpers/scratchData';
import { sampleProfile } from './helpers/studentProfile';

const { GET, PATCH } = route;

let scratch: ReturnType<typeof useScratchDataDir>;
let token: string;

beforeEach(() => {
  scratch = useScratchDataDir();
  token = getAppSecret();
});
afterEach(() => {
  vi.restoreAllMocks();
  scratch.cleanup();
});

const URL_ = 'http://localhost:3000/api/student';
const get = (headers: Record<string, string> = { [APP_TOKEN_HEADER]: token }) => GET(new Request(URL_, { headers }));
const patchRaw = (body: string, headers: Record<string, string> = { [APP_TOKEN_HEADER]: token }) =>
  PATCH(new Request(URL_, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body }));
const patch = (ops: ProfileOp[], batchId?: string) => patchRaw(JSON.stringify({ ops, ...(batchId ? { batchId } : {}) }));
const read = async (): Promise<StudentProfile> => (await get()).json();
const studentFile = () => path.join(scratch.dir, 'student.json');
const writeFile = (profile: unknown) => fs.writeFileSync(studentFile(), JSON.stringify(profile));

const solve = (over: Partial<CurrentSolve> = {}): CurrentSolve => ({ ...sampleProfile().currentSolve!, ...over });
const timerSolve = (id: string, ms = 10_000) => ({ id, ms, penalty: 'none' as const, at: '2026-11-17T10:00:00.000Z', scramble: "R U R'" });

describe('/api/student', () => {
  it('needs the app token for reads and writes', async () => {
    expect((await get({})).status).toBe(401);
    expect((await get({ [APP_TOKEN_HEADER]: 'nope' })).status).toBe(401);
    expect((await patchRaw(JSON.stringify({ ops: [] }), {})).status).toBe(401);
    expect(fs.existsSync(studentFile())).toBe(false);
  });

  it('has no whole-profile PUT any more', () => {
    expect('PUT' in route).toBe(false);
  });

  it('reads the default profile before anything is saved', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(defaultStudentProfile());
  });

  it('applies operations and reads the merged profile back', async () => {
    const res = await patch([
      { op: 'setName', name: 'Sam' },
      { op: 'setSettings', settings: { theme: 'dark' } },
      { op: 'setCurrentSolve', solve: solve() },
    ]);
    expect(res.status).toBe(200);
    const saved = (await res.json()) as StudentProfile;
    expect(saved.name).toBe('Sam');
    expect(saved.settings).toEqual({ ...defaultStudentProfile().settings, theme: 'dark' });
    expect(saved.currentSolve).toEqual(solve());
    expect(JSON.parse(fs.readFileSync(studentFile(), 'utf8'))).toEqual(saved);
    expect(await read()).toEqual(saved);
  });

  it('rejects malformed JSON, bad operations and invalid results without touching the file', async () => {
    await patch([{ op: 'setName', name: 'Sam' }]);
    const before = fs.readFileSync(studentFile(), 'utf8');
    expect((await patchRaw('{not json')).status).toBe(400);
    expect((await patchRaw(JSON.stringify({ name: 'whole profile' }))).status).toBe(400);
    expect((await patchRaw(JSON.stringify({ ops: [{ op: 'dropTables' }] }))).status).toBe(400);
    const bad = await patch([{ op: 'setSettings', settings: { theme: 'neon' as 'dark' } }]);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/theme/);
    expect((await patch([{ op: 'setName', name: 'x'.repeat(41) }])).status).toBe(400);
    expect(fs.readFileSync(studentFile(), 'utf8')).toBe(before);
  });

  it('refuses bodies over the size cap', async () => {
    expect((await patch([{ op: 'setName', name: 'x'.repeat(MAX_STUDENT_BYTES) }])).status).toBe(413);
    expect(fs.existsSync(studentFile())).toBe(false);
  });

  it('writes atomically: a temporary file renamed over the target, none left behind', async () => {
    const rename = vi.spyOn(fs, 'renameSync');
    await patch([{ op: 'setName', name: 'Sam' }]);
    expect(rename).toHaveBeenCalledTimes(1);
    const [from, to] = rename.mock.calls[0] as [string, string];
    expect(to).toBe(studentFile());
    expect(from).toMatch(/student\.json\..+\.tmp$/);
    expect(fs.readdirSync(scratch.dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('keeps the old profile when a write fails part-way', async () => {
    await patch([{ op: 'setName', name: 'Sam' }]);
    const before = fs.readFileSync(studentFile(), 'utf8');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('disk busy');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await patch([{ op: 'setName', name: 'Changed' }]);
    expect(res.status).toBe(500);
    expect(fs.readFileSync(studentFile(), 'utf8')).toBe(before);
    expect(fs.readdirSync(scratch.dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('reads a damaged file as the default profile and keeps the damaged copy', async () => {
    fs.writeFileSync(studentFile(), '{"version": 1, "name": 5}');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await (await get()).json()).toEqual(defaultStudentProfile());
    expect(fs.existsSync(`${studentFile()}.bad`)).toBe(true);
  });

  it('migrates a version 1 file on the first update and keeps its data', async () => {
    const v2: Partial<StudentProfile> = sampleProfile();
    delete v2.trainer;
    delete v2.timer;
    const v1 = {
      ...v2,
      version: 1,
      settings: { methodDefault: 'cfop', plainLanguage: true, stickerLetters: false, reducedMotion: false, theme: 'system' },
      stats: { solvesCompleted: 4, stepsCompleted: 30, checkpointsPassed: 28, lastSolveAt: null },
    };
    writeFile(v1);
    const res = await patch([{ op: 'addTimerSolve', solve: timerSolve('a1') }]);
    expect(res.status).toBe(200);
    const saved = JSON.parse(fs.readFileSync(studentFile(), 'utf8')) as StudentProfile;
    expect(saved.version).toBe(STUDENT_PROFILE_VERSION);
    expect(saved.name).toBe('Sam');
    expect(saved.settings).toMatchObject({ lastLayer: '2-look', voiceMode: 'off', voiceMoves: 'words' });
    expect(saved.stats).toMatchObject({ solvesCompleted: 4, stepsCompleted: 30, stages: {}, activeDays: [] });
    expect(saved.currentSolve).toEqual(sampleProfile().currentSolve);
    expect(saved.timer.history.map((s) => s.id)).toEqual(['a1']);
  });

  it('applies a retried batch only once', async () => {
    await patch([{ op: 'incrementStats', stepsCompleted: 1 }], 'batch-0001');
    await patch([{ op: 'incrementStats', stepsCompleted: 1 }], 'batch-0001');
    expect((await read()).stats.stepsCompleted).toBe(1);
  });
});

describe('/api/student merging two devices', () => {
  it('loses nothing when two clients interleave their changes', async () => {
    // The laptop and the phone each start from the same profile and save only what they change.
    const laptop: ProfileOp[][] = [
      [{ op: 'addTimerSolve', solve: timerSolve('laptop-1', 21_000) }],
      [{ op: 'answerTrainerCase', caseId: 'sune', correct: true }, { op: 'addActiveDay', day: '2026-11-17' }],
      [{ op: 'incrementStats', stepsCompleted: 1, checkpointsPassed: 1 }, { op: 'recordStage', key: 'cfop/cross', hint: 1 }],
      [{ op: 'setTimerPenalty', id: 'laptop-1', penalty: '+2' }],
    ];
    const phone: ProfileOp[][] = [
      [{ op: 'addTimerSolve', solve: timerSolve('phone-1', 25_000) }],
      [{ op: 'answerTrainerCase', caseId: 'antisune', correct: false }, { op: 'addActiveDay', day: '2026-11-18' }],
      [{ op: 'incrementStats', stepsCompleted: 1, checkpointsPassed: 1 }, { op: 'recordStage', key: 'cfop/cross', hint: 0 }],
      [{ op: 'setSettings', settings: { stickerLetters: true } }],
    ];
    // Interleaved, and fired together so the server sees them race.
    const results = await Promise.all(laptop.flatMap((ops, i) => [patch(ops), patch(phone[i])]));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));

    const saved = await read();
    expect(saved.timer.history.map((s) => [s.id, s.penalty])).toEqual(
      expect.arrayContaining([
        ['laptop-1', '+2'],
        ['phone-1', 'none'],
      ])
    );
    expect(saved.timer.history).toHaveLength(2);
    expect(Object.keys(saved.trainer.cards).sort()).toEqual(['antisune', 'sune']);
    expect(saved.trainer.turn).toBe(2);
    expect(saved.stats).toMatchObject({ stepsCompleted: 2, checkpointsPassed: 2, activeDays: ['2026-11-17', '2026-11-18'] });
    expect(saved.stats.stages['cfop/cross']).toHaveLength(2);
    expect(saved.settings.stickerLetters).toBe(true);
  });

  it('does not let a stale current solve overwrite a newer one', async () => {
    const started = '2026-11-17T10:00:00.000Z';
    const at3 = solve({ startedAt: started, stepIndex: 3, updatedAt: '2026-11-17T10:05:00.000Z' });
    const at5 = solve({ startedAt: started, stepIndex: 5, updatedAt: '2026-11-17T10:09:00.000Z' });
    await patch([{ op: 'setCurrentSolve', solve: at5 }]);
    // The phone's older copy (step 3), even saved later and with a later clock, is ignored.
    await patch([{ op: 'setCurrentSolve', solve: { ...at3, updatedAt: '2026-11-17T11:00:00.000Z' } }]);
    expect((await read()).currentSolve?.stepIndex).toBe(5);
    // Same step, saved later: kept (an attempt was recorded).
    const later = { ...at5, attempts: [{ result: 'mismatch' as const }], updatedAt: '2026-11-17T10:10:00.000Z' };
    await patch([{ op: 'setCurrentSolve', solve: later }]);
    expect((await read()).currentSolve?.attempts).toEqual([{ result: 'mismatch' }]);
    // Same step, an older save: ignored.
    await patch([{ op: 'setCurrentSolve', solve: at5 }]);
    expect((await read()).currentSolve?.attempts).toEqual([{ result: 'mismatch' }]);
  });

  it('keeps a finished solve finished when a late save of it arrives', async () => {
    const started = '2026-11-17T10:00:00.000Z';
    await patch([{ op: 'setCurrentSolve', solve: solve({ startedAt: started, stepIndex: 9 }) }]);
    await patch([{ op: 'clearCurrentSolve', startedAt: started }, { op: 'incrementStats', solvesCompleted: 1 }]);
    await patch([{ op: 'setCurrentSolve', solve: solve({ startedAt: started, stepIndex: 8, updatedAt: '2026-11-17T12:00:00.000Z' }) }]);
    const saved = await read();
    expect(saved.currentSolve).toBeNull();
    expect(saved.stats.solvesCompleted).toBe(1);
    // A new solve still saves.
    const next = solve({ startedAt: '2026-11-17T13:00:00.000Z', stepIndex: 0, updatedAt: '2026-11-17T13:00:00.000Z' });
    await patch([{ op: 'setCurrentSolve', solve: next }]);
    expect((await read()).currentSolve).toEqual(next);
  });

  it('does not let clearing an old solve remove a newer one', async () => {
    const newer = solve({ startedAt: '2026-11-17T13:00:00.000Z', updatedAt: '2026-11-17T13:00:00.000Z' });
    await patch([{ op: 'setCurrentSolve', solve: newer }]);
    await patch([{ op: 'clearCurrentSolve', startedAt: '2026-11-17T10:00:00.000Z' }]);
    expect((await read()).currentSolve).toEqual(newer);
  });

  it('adds a timer solve once, whichever device sends it twice', async () => {
    await patch([{ op: 'addTimerSolve', solve: timerSolve('t-1') }]);
    await patch([{ op: 'addTimerSolve', solve: timerSolve('t-1') }]);
    await patch([{ op: 'deleteTimerSolve', id: 'missing' }]);
    expect((await read()).timer.history.map((s) => s.id)).toEqual(['t-1']);
  });
});
