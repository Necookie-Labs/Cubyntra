/**
 * Cubyntra - /api/student route
 * Necookie Labs (c) 2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PUT } from '../src/app/api/student/route';
import { APP_TOKEN_HEADER, getAppSecret } from '../src/lib/localAuth';
import { MAX_STUDENT_BYTES, defaultStudentProfile } from '../src/lib/studentProfile';
import { useScratchDataDir } from './helpers/scratchData';
import { sampleProfile } from './helpers/studentProfile';

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
const put = (body: string, headers: Record<string, string> = { [APP_TOKEN_HEADER]: token }) =>
  PUT(new Request(URL_, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body }));
const studentFile = () => path.join(scratch.dir, 'student.json');

describe('/api/student', () => {
  it('needs the app token for reads and writes', async () => {
    expect((await get({})).status).toBe(401);
    expect((await get({ [APP_TOKEN_HEADER]: 'nope' })).status).toBe(401);
    expect((await put(JSON.stringify(defaultStudentProfile()), {})).status).toBe(401);
    expect(fs.existsSync(studentFile())).toBe(false);
  });

  it('reads the default profile before anything is saved', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(defaultStudentProfile());
  });

  it('saves a valid profile and reads it back', async () => {
    const profile = sampleProfile();
    const res = await put(JSON.stringify(profile));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(profile);
    expect(JSON.parse(fs.readFileSync(studentFile(), 'utf8'))).toEqual(profile);
    expect(await (await get()).json()).toEqual(profile);
  });

  it('rejects malformed JSON and invalid profiles without touching the file', async () => {
    await put(JSON.stringify(sampleProfile()));
    const before = fs.readFileSync(studentFile(), 'utf8');
    expect((await put('{not json')).status).toBe(400);
    const bad = await put(JSON.stringify({ ...sampleProfile(), version: 99 }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/version/);
    expect(fs.readFileSync(studentFile(), 'utf8')).toBe(before);
  });

  it('refuses bodies over the size cap', async () => {
    const huge = JSON.stringify({ ...defaultStudentProfile(), name: 'x'.repeat(MAX_STUDENT_BYTES) });
    expect((await put(huge)).status).toBe(413);
    expect(fs.existsSync(studentFile())).toBe(false);
  });

  it('writes atomically: a temporary file renamed over the target, none left behind', async () => {
    const rename = vi.spyOn(fs, 'renameSync');
    await put(JSON.stringify(sampleProfile()));
    expect(rename).toHaveBeenCalledTimes(1);
    const [from, to] = rename.mock.calls[0] as [string, string];
    expect(to).toBe(studentFile());
    expect(from).toMatch(/student\.json\..+\.tmp$/);
    expect(fs.readdirSync(scratch.dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('keeps the old profile when a write fails part-way', async () => {
    await put(JSON.stringify(sampleProfile()));
    const before = fs.readFileSync(studentFile(), 'utf8');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('disk busy');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await put(JSON.stringify({ ...sampleProfile(), name: 'Changed' }));
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
});
