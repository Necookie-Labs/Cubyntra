/**
 * Cubyntra - Student Profile File (server only)
 * Necookie Labs (c) 2026
 *
 * Reads and writes `data/student.json`. Writes are atomic (temporary file, then rename), so an
 * interrupted save never leaves half a profile. A missing file reads as the default profile; a
 * damaged one is moved aside to `student.json.bad` rather than silently overwritten.
 *
 * `updateStudentProfile` is the read-change-write used by `PATCH /api/student`. Updates are
 * serialized per process (a promise-chain mutex), so two requests arriving together are applied
 * one after the other to the latest profile and neither is lost.
 */

import fs from 'node:fs';
import { dataPath, writeFileAtomic } from './dataDir';
import {
  MAX_STUDENT_BYTES,
  defaultStudentProfile,
  parseStudentProfile,
  type StudentProfile,
} from './studentProfile';

export const STUDENT_FILE = 'student.json';

export class ProfileTooLargeError extends Error {
  constructor() {
    super(`The profile is larger than ${MAX_STUDENT_BYTES} bytes`);
    this.name = 'ProfileTooLargeError';
  }
}

export function studentFilePath(): string {
  return dataPath(STUDENT_FILE);
}

/** The saved profile, or the default one when none is saved yet or the file is damaged. */
export function readStudentProfile(): StudentProfile {
  const file = studentFilePath();
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
    console.warn(`[Cubyntra] ${STUDENT_FILE} could not be read (${(error as Error).message}); starting fresh.`);
    try {
      fs.renameSync(file, `${file}.bad`);
    } catch {
      // Keeping the damaged copy is a courtesy; the fresh profile still works.
    }
    return defaultStudentProfile();
  }
}

let profileLock: Promise<unknown> = Promise.resolve();

/** Runs `task` once every update queued before it has finished (rejections included). */
function withProfileLock<T>(task: () => Promise<T>): Promise<T> {
  const run = profileLock.then(task, task);
  profileLock = run.catch(() => {});
  return run;
}

/**
 * Reads the profile, passes it to `change` and saves what it returns, under the profile lock.
 * Resolves to the saved profile. `change` may throw to cancel the update (nothing is written).
 */
export function updateStudentProfile(change: (profile: StudentProfile) => StudentProfile): Promise<StudentProfile> {
  return withProfileLock(async () => {
    const next = change(readStudentProfile());
    await writeStudentProfile(next);
    return next;
  });
}

/** Saves a validated profile atomically. Rejects with `ProfileTooLargeError` over the size cap. */
export async function writeStudentProfile(profile: StudentProfile): Promise<void> {
  const text = `${JSON.stringify(profile, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_STUDENT_BYTES) throw new ProfileTooLargeError();
  await writeFileAtomic(studentFilePath(), text, 0o600);
}
