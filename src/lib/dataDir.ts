/**
 * Cubyntra - Local Data Directory (server only)
 * Necookie Labs (c) 2026
 *
 * Everything the app keeps on the laptop lives in `data/` at the project root (gitignored).
 * `CUBYNTRA_DATA_DIR` overrides the location (tests point it at a scratch folder inside `data/`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export function dataDir(): string {
  return process.env.CUBYNTRA_DATA_DIR || path.join(process.cwd(), 'data');
}

/**
 * Absolute path of a file in the data directory. The ignore comment stops the bundler from
 * tracing the whole project into the server output for this runtime-only path.
 */
export function dataPath(name: string): string {
  return path.join(/*turbopackIgnore: true*/ dataDir(), name);
}

/** Waits between rename attempts: a Windows sharing lock usually clears within a few ms. */
export const RENAME_BACKOFF_MS: readonly number[] = [20, 50, 100, 200];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function tempPathFor(file: string): string {
  return `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
}

/**
 * Writes a file (text or bytes) so readers never see a half-written version: write a temporary file next to it,
 * then rename over the target. Creates the directory if needed. On Windows a rename can briefly
 * fail (EPERM, EBUSY) while another handle has the target open, so it is retried after a short,
 * growing wait (`RENAME_BACKOFF_MS`) before giving up.
 */
export async function writeFileAtomic(file: string, contents: string | Uint8Array, mode?: number): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = tempPathFor(file);
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', mode });
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (error) {
      if (attempt >= RENAME_BACKOFF_MS.length) {
        fs.rmSync(tmp, { force: true });
        throw error;
      }
      await sleep(RENAME_BACKOFF_MS[attempt]);
    }
  }
}

/**
 * The same write for the few callers that must stay synchronous (the app secret, created once
 * on first use and read by every guarded route). It waits with `Atomics.wait`, which blocks only
 * this thread and only in the rare case that the rename fails.
 */
export function writeFileAtomicSync(file: string, contents: string, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = tempPathFor(file);
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', mode });
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (error) {
      if (attempt >= RENAME_BACKOFF_MS.length) {
        fs.rmSync(tmp, { force: true });
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_BACKOFF_MS[attempt]);
    }
  }
}
