/**
 * Cubyntra - A fake `/api/student` for store tests (no network).
 *
 * Keeps a server-side profile and applies each PATCH's operations to it exactly as the route
 * does (`applyProfileOps`, then the whole-profile check), so tests can look at what the server
 * would hold after the store's saves.
 */

import { vi } from 'vitest';
import { applyProfileOps, type ProfileOp } from '../../src/lib/profileOps';
import { defaultStudentProfile, parseStudentProfile, type StudentProfile } from '../../src/lib/studentProfile';

export interface FakeStudentServer {
  fetch: ReturnType<typeof vi.fn>;
  /** The profile after each successful PATCH, oldest first. */
  saved: StudentProfile[];
  /** Every PATCH body's operations, oldest first. */
  batches: ProfileOp[][];
  profile: () => StudentProfile;
  setProfile: (profile: StudentProfile) => void;
}

export function fakeStudentServer(initial: StudentProfile = defaultStudentProfile()): FakeStudentServer {
  let profile = initial;
  const saved: StudentProfile[] = [];
  const batches: ProfileOp[][] = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const { ops } = JSON.parse(String(init.body)) as { ops: ProfileOp[] };
      batches.push(ops);
      const next = parseStudentProfile(applyProfileOps(profile, ops));
      if (!next.ok) return Response.json({ error: next.error }, { status: 400 });
      profile = next.profile;
      saved.push(profile);
      return Response.json(profile);
    }
    return Response.json(profile);
  });
  return {
    fetch,
    saved,
    batches,
    profile: () => profile,
    setProfile: (p) => {
      profile = p;
    },
  };
}
