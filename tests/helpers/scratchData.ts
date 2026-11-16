/**
 * Cubyntra - Scratch data directory for tests.
 *
 * Tests never write outside the repo: each gets a fresh folder under `data/.test/` (gitignored)
 * and points `CUBYNTRA_DATA_DIR` at it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function useScratchDataDir(): { dir: string; cleanup: () => void } {
  const dir = path.join(process.cwd(), 'data', '.test', randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const previous = process.env.CUBYNTRA_DATA_DIR;
  process.env.CUBYNTRA_DATA_DIR = dir;
  return {
    dir,
    cleanup: () => {
      if (previous === undefined) delete process.env.CUBYNTRA_DATA_DIR;
      else process.env.CUBYNTRA_DATA_DIR = previous;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
