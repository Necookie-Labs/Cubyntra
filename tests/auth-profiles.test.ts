/**
 * Cubyntra - Per-person profiles in the hosted modes (ADR-017)
 * Necookie Labs (c) 2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PATCH } from '../src/app/api/student/route';
import { GET as voiceStatus } from '../src/app/api/voice/status/route';
import { APP_TOKEN_HEADER } from '../src/lib/localAuth';
import { SESSION_COOKIE, createSessionValue, userFromName } from '../src/lib/passcodeSession';
import { userSlug, userToken } from '../src/lib/requestUser';
import { USER_SLUG_PATTERN, studentFilePath } from '../src/lib/studentFile';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
});
afterEach(() => {
  vi.unstubAllEnvs();
  scratch.cleanup();
});

describe('userSlug', () => {
  const nasty = [
    'owner@example.com',
    'Kiko',
    '../../etc/passwd',
    '..\\..\\windows\\system32',
    'a/b/../c',
    '.',
    '..',
    '',
    '%2e%2e%2f',
    'name\u0000.json',
    'ÉLODIE@exämple.com',
    '日本語@example.com',
    'x'.repeat(500),
    'CON',
  ];

  it('always yields letters, digits and dashes only, never a path', () => {
    for (const id of nasty) {
      const slug = userSlug(id);
      expect(slug).toMatch(USER_SLUG_PATTERN);
      expect(slug).not.toContain('.');
      expect(slug).not.toContain('/');
      expect(slug).not.toContain('\\');
      expect(slug.length).toBeLessThanOrEqual(57);
      const file = studentFilePath(slug);
      expect(path.dirname(file)).toBe(path.join(scratch.dir, 'students'));
    }
  });

  it('is stable and keeps look-alike ids apart', () => {
    expect(userSlug('owner@example.com')).toBe(userSlug('owner@example.com'));
    expect(userSlug('owner@example.com')).toMatch(/^owner-example-com-[0-9a-f]{8}$/);
    expect(userSlug('a.b@example.com')).not.toBe(userSlug('a-b@example.com'));
  });

  it('studentFilePath refuses anything that is not a slug', () => {
    for (const bad of ['../x-12345678', 'a/b-12345678', 'UPPER-12345678', 'x', '', 'x-1234567g']) {
      expect(() => studentFilePath(bad)).toThrow();
    }
    expect(studentFilePath()).toBe(path.join(scratch.dir, 'student.json'));
  });
});

describe('two people never see each other’s profile (passcode mode)', () => {
  beforeEach(() => {
    vi.stubEnv('CUBYNTRA_AUTH_MODE', 'passcode');
    vi.stubEnv('CUBYNTRA_ACCESS_CODE', 'cube-night-2026');
  });

  const as = (name: string) => {
    const user = userFromName(name)!;
    return { cookie: `${SESSION_COOKIE}=${createSessionValue(user)}`, [APP_TOKEN_HEADER]: userToken(user) };
  };
  const url = 'http://localhost:3001/api/student';
  const read = async (name: string) => (await GET(new Request(url, { headers: as(name) }))).json();
  const setName = (name: string, value: string, batchId?: string) =>
    PATCH(
      new Request(url, {
        method: 'PATCH',
        headers: { ...as(name), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: [{ op: 'setName', name: value }], ...(batchId ? { batchId } : {}) }),
      })
    );

  it('keeps separate files and separate data', async () => {
    expect((await setName('Owner', 'The Owner')).status).toBe(200);
    expect((await setName('Kiko', 'Kiko K')).status).toBe(200);
    expect((await read('Owner')).name).toBe('The Owner');
    expect((await read('Kiko')).name).toBe('Kiko K');

    expect(fs.existsSync(path.join(scratch.dir, 'student.json'))).toBe(false);
    const files = fs.readdirSync(path.join(scratch.dir, 'students')).sort();
    expect(files).toEqual([`${userSlug('kiko')}.json`, `${userSlug('owner')}.json`].sort());
  });

  it('one person cannot use another’s token', async () => {
    const owner = userFromName('Owner')!;
    const res = await GET(
      new Request(url, { headers: { cookie: as('Kiko').cookie, [APP_TOKEN_HEADER]: userToken(owner) } })
    );
    expect(res.status).toBe(401);
  });

  it('a batch id used by one person does not suppress another’s batch', async () => {
    expect((await setName('Owner', 'A', 'batch-0001')).status).toBe(200);
    expect((await setName('Kiko', 'B', 'batch-0001')).status).toBe(200);
    expect((await read('Kiko')).name).toBe('B');
  });

  it('voice status reads the requesting person’s settings', async () => {
    const res = await voiceStatus(new Request('http://localhost:3001/api/voice/status', { headers: as('Kiko') }));
    expect(res.status).toBe(200);
  });
});

describe('local mode keeps data/student.json', () => {
  it('writes the single profile file', async () => {
    const { getAppSecret } = await import('../src/lib/localAuth');
    const res = await PATCH(
      new Request('http://localhost:3000/api/student', {
        method: 'PATCH',
        headers: { [APP_TOKEN_HEADER]: getAppSecret(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: [{ op: 'setName', name: 'Solo' }] }),
      })
    );
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(scratch.dir, 'student.json'))).toBe(true);
    expect(fs.existsSync(path.join(scratch.dir, 'students'))).toBe(false);
  });
});
