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

/** Absolute path of a file in the data directory. */
export function dataPath(name: string): string {
  return path.join(dataDir(), name);
}

/**
 * Writes a file so readers never see a half-written version: write a temporary file next to it,
 * then rename over the target. Creates the directory if needed.
 */
export function writeFileAtomic(file: string, contents: string, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', mode });
  // On Windows a rename can briefly fail while another handle has the target open.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (error) {
      if (attempt >= 4) {
        fs.rmSync(tmp, { force: true });
        throw error;
      }
    }
  }
}
