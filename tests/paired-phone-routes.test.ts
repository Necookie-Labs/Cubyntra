/**
 * Cubyntra - A paired phone can use the coach and the student profile
 * Necookie Labs (c) 2026
 *
 * The phone reaches the laptop by its LAN address, so /api/auth/token refuses it. It gets the
 * app token from pairing instead (QR fragment `t`, or the typed-code route), and that token
 * opens /api/coach and /api/student exactly as the laptop's does.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as createSession } from '../src/app/api/session/route';
import { POST as pair } from '../src/app/api/session/pair/route';
import { GET as getToken } from '../src/app/api/auth/token/route';
import { POST as postCoach } from '../src/app/api/coach/route';
import { GET as getStudent, PUT as putStudent } from '../src/app/api/student/route';
import { APP_TOKEN_HEADER, coachRateLimiter, getAppSecret } from '../src/lib/localAuth';
import { parsePairingFragment } from '../src/sync/pairingLink';
import { sessionManager } from '../src/sync/sessionManager';
import { resetSyncLimitersForTests } from '../src/sync/server';
import { resetSpendTrackerForTests } from '../src/coach/spend';
import { defaultStudentProfile } from '../src/lib/studentProfile';
import { SAMPLE_FACTS } from './helpers/coachFacts';
import { useScratchDataDir } from './helpers/scratchData';

const PHONE = { host: '192.168.1.20:3000' };

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
  delete process.env.ANTHROPIC_API_KEY;
  sessionManager.clearAll();
  resetSyncLimitersForTests();
  resetSpendTrackerForTests();
  coachRateLimiter.reset();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionManager.clearAll();
  scratch.cleanup();
});

async function laptopPairing(): Promise<{ code: string; companionUrl: string }> {
  const res = await createSession(
    new Request('https://localhost:3000/api/session', {
      method: 'POST',
      headers: { host: 'localhost:3000', [APP_TOKEN_HEADER]: getAppSecret() },
    })
  );
  expect(res.status).toBe(200);
  return res.json();
}

async function phoneCalls(token: string) {
  const headers = { ...PHONE, [APP_TOKEN_HEADER]: token, 'Content-Type': 'application/json' };
  const student = await getStudent(new Request('https://192.168.1.20:3000/api/student', { headers }));
  const saved = await putStudent(
    new Request('https://192.168.1.20:3000/api/student', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ...defaultStudentProfile(), name: 'Phone' }),
    })
  );
  const coach = await postCoach(
    new Request('https://192.168.1.20:3000/api/coach', {
      method: 'POST',
      headers,
      body: JSON.stringify({ facts: SAMPLE_FACTS }),
    })
  );
  return { student: student.status, saved: saved.status, coach: coach.status };
}

describe('paired phone', () => {
  it('cannot read the token route from the LAN address', async () => {
    const res = await getToken(new Request('https://192.168.1.20:3000/api/auth/token', { headers: PHONE }));
    expect(res.status).toBe(403);
  });

  it('calls /api/student and /api/coach with the token from the QR link', async () => {
    const { companionUrl } = await laptopPairing();
    const creds = parsePairingFragment(new URL(companionUrl).hash)!;
    expect(await phoneCalls(creds.token)).toEqual({ student: 200, saved: 200, coach: 200 });
  });

  it('calls them with the token returned for the typed code', async () => {
    const { code } = await laptopPairing();
    const res = await pair(
      new Request('https://192.168.1.20:3000/api/session/pair', {
        method: 'POST',
        headers: { ...PHONE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
    );
    expect(res.status).toBe(200);
    const { token } = await res.json();
    expect(await phoneCalls(token)).toEqual({ student: 200, saved: 200, coach: 200 });
  });

  it('is refused without a token', async () => {
    const res = await getStudent(new Request('https://192.168.1.20:3000/api/student', { headers: PHONE }));
    expect(res.status).toBe(401);
  });
});
