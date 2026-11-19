/**
 * Cubyntra - Student Profile File (server only)
 * Necookie Labs (c) 2026
 *
 * Reads and writes `data/student.json` (local mode), or `data/students/<slug>.json` for one
 * person in the hosted modes (ADR-017; the slug comes from `userSlug` and is re-checked here, so
 * no path can escape the folder). Every function takes that optional slug. Writes are atomic (temporary file, then rename), so an
 * interrupted save never leaves half a profile. A missing file reads as the default profile; a
 * damaged one is moved aside to `student.json.bad` rather than silently overwritten.
 *
 * `updateStudentProfile` is the read-change-write used by `PATCH /api/student`. Updates are
 * serialized per file (a promise-chain mutex per profile), so two requests arriving together are applied
 * one after the other to the latest profile and neither is lost.
 */

import fs from 'node:fs';
import path from 'node:path';
import { dataPath, writeFileAtomic } from './dataDir';
import {
  MAX_STUDENT_BYTES,
  defaultStudentProfile,
  parseStudentProfile,
  type StudentProfile,
} from './studentProfile';

export const STUDENT_FILE = 'student.json';
/** Hosted modes: one profile per person in this folder. */
export const STUDENTS_DIR = 'students';
/** A per-person file slug (`userSlug` in `requestUser.ts`): letters, digits and dashes only. */
export const USER_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}-[0-9a-f]{8}$/;

export class ProfileTooLargeError extends Error {
  constructor() {
    super(`The profile is larger than ${MAX_STUDENT_BYTES} bytes`);
    this.name = 'ProfileTooLargeError';
  }
}

/** The profile file: `student.json` without a slug, `students/<slug>.json` with one. */
export function studentFilePath(slug?: string): string {
  if (slug === undefined) return dataPath(STUDENT_FILE);
  if (!USER_SLUG_PATTERN.test(slug)) throw new Error('Invalid profile slug');
  return dataPath(path.join(STUDENTS_DIR, `${slug}.json`));
}

/** The saved profile, or the default one when none is saved yet or the file is damaged. */
export function readStudentProfile(slug?: string): StudentProfile {
  const file = studentFilePath(slug);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return defaultStudentProfile();
  }
  try {
    if (Buffer.byteLength(text) > MAX_STUDENT_BYTES) throw new ProfileTooLargeError();
    const parsed = parseStudentProfile(JSON.parse(text));
    if (parsed.ok) return parsed.profile;
    throw new Error(parsed.error);
  } catch (error) {
    console.warn(`[Cubyntra] ${path.basename(file)} could not be read (${(error as Error).message}); starting fresh.`);
    try {
      fs.renameSync(file, `${file}.bad`);
    } catch {
      // Keeping the damaged copy is a courtesy; the fresh profile still works.
    }
    return defaultStudentProfile();
  }
}

const profileLocks = new Map<string, Promise<unknown>>();

/**
 * Runs `task` once every update queued before it on the same file has finished (rejections
 * included). Different people's files do not wait for each other.
 */
function withProfileLock<T>(file: string, task: () => Promise<T>): Promise<T> {
  const run = (profileLocks.get(file) ?? Promise.resolve()).then(task, task);
  const tail = run.catch(() => {});
  profileLocks.set(file, tail);
  void tail.then(() => {
    if (profileLocks.get(file) === tail) profileLocks.delete(file);
  });
  return run;
}

/**
 * Reads the profile, passes it to `change` and saves what it returns, under the profile lock.
 * Resolves to the saved profile. `change` may throw to cancel the update (nothing is written).
 */
export function updateStudentProfile(
  change: (profile: StudentProfile) => StudentProfile,
  slug?: string
): Promise<StudentProfile> {
  return withProfileLock(studentFilePath(slug), async () => {
    const next = change(readStudentProfile(slug));
    await writeStudentProfile(next, slug);
    return next;
  });
}

/** Saves a validated profile atomically. Rejects with `ProfileTooLargeError` over the size cap. */
export async function writeStudentProfile(profile: StudentProfile, slug?: string): Promise<void> {
  const text = `${JSON.stringify(profile, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_STUDENT_BYTES) throw new ProfileTooLargeError();
  await writeFileAtomic(studentFilePath(slug), text, 0o600);
}
