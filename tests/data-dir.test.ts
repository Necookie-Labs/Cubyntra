/**
 * Cubyntra - Atomic writes in the data directory
 * Necookie Labs (c) 2026
 *
 * A rename that fails on Windows (EPERM while another handle has the target open) is retried
 * after a short, growing wait instead of straight away.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RENAME_BACKOFF_MS, writeFileAtomic, writeFileAtomicSync } from '../src/lib/dataDir';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  scratch.cleanup();
});

const eperm = () => Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });

/** Makes the first `failures` renames throw EPERM, then lets them through. */
function flakyRename(failures: number) {
  const real = fs.renameSync;
  let left = failures;
  return vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (left-- > 0) throw eperm();
    real(from, to);
  });
}

const tmpFiles = () => fs.readdirSync(scratch.dir).filter((f) => f.endsWith('.tmp'));

describe('writeFileAtomic', () => {
  it('uses a growing wait between attempts', () => {
    expect(RENAME_BACKOFF_MS.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < RENAME_BACKOFF_MS.length; i++) expect(RENAME_BACKOFF_MS[i]).toBeGreaterThan(RENAME_BACKOFF_MS[i - 1]);
  });

  it('waits before retrying a rename that threw EPERM twice, then succeeds', async () => {
    vi.useFakeTimers();
    const rename = flakyRename(2);
    const file = path.join(scratch.dir, 'a.json');
    let done = false;
    const write = writeFileAtomic(file, 'hello').then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(rename).toHaveBeenCalledTimes(1); // no retry without waiting
    await vi.advanceTimersByTimeAsync(RENAME_BACKOFF_MS[0] - 1);
    expect(rename).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(rename).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RENAME_BACKOFF_MS[1] - 1);
    expect(rename).toHaveBeenCalledTimes(2);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await write;
    expect(rename).toHaveBeenCalledTimes(3);
    expect(fs.readFileSync(file, 'utf8')).toBe('hello');
    expect(tmpFiles()).toEqual([]);
  });

  it('gives up after the last wait, removing the temporary file', async () => {
    flakyRename(Infinity);
    const file = path.join(scratch.dir, 'b.json');
    await expect(writeFileAtomic(file, 'x')).rejects.toThrow(/EPERM/);
    expect(fs.renameSync).toHaveBeenCalledTimes(RENAME_BACKOFF_MS.length + 1);
    expect(fs.existsSync(file)).toBe(false);
    expect(tmpFiles()).toEqual([]);
  });

  it('has a blocking variant for synchronous callers that also waits', () => {
    flakyRename(2);
    const file = path.join(scratch.dir, 'c.json');
    const started = performance.now();
    writeFileAtomicSync(file, 'sync');
    expect(performance.now() - started).toBeGreaterThanOrEqual(RENAME_BACKOFF_MS[0] + RENAME_BACKOFF_MS[1] - 5);
    expect(fs.readFileSync(file, 'utf8')).toBe('sync');
  });
});
