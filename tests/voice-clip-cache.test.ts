/**
 * Cubyntra - Voice clip cache tests
 * Necookie Labs (c) 2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clipHash, clipPath, hasClip, readClip, writeClip } from '../src/voice/clipCache';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
});
afterEach(() => scratch.cleanup());

describe('clip cache', () => {
  it('keys clips by model, voice and text', () => {
    const a = clipHash('eleven_flash_v2_5', 'voice1', 'Nice work!');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(clipHash('eleven_flash_v2_5', 'voice1', 'Nice work!')).toBe(a);
    expect(clipHash('eleven_flash_v2_5', 'voice2', 'Nice work!')).not.toBe(a);
    expect(clipHash('eleven_multilingual_v2', 'voice1', 'Nice work!')).not.toBe(a);
    expect(clipHash('eleven_flash_v2_5', 'voice1', 'You got it!')).not.toBe(a);
    // The new models and voices, and the speed, each make their own clip.
    const alice = clipHash('eleven_v4', 'Xb7hH8MSUJpSbSDYk0k2', 'Nice work!');
    expect(clipHash('eleven_v4_turbo', 'Xb7hH8MSUJpSbSDYk0k2', 'Nice work!')).not.toBe(alice);
    expect(clipHash('eleven_v4', 'JBFqnCBsd6RMkjVDRZzb', 'Nice work!')).not.toBe(alice);
    expect(clipHash('eleven_v4', 'Xb7hH8MSUJpSbSDYk0k2', 'Nice work!', 1.2)).not.toBe(alice);
    expect(clipHash('eleven_v4', 'Xb7hH8MSUJpSbSDYk0k2', 'Nice work!', 1)).toBe(alice);
  });

  it('stores clips as data/voice/<hash>.mp3 and reads them back', async () => {
    const hash = clipHash('m', 'v', 'Hello');
    expect(readClip(hash)).toBeNull();
    await writeClip(hash, new Uint8Array([1, 2, 3]));
    expect(clipPath(hash)).toBe(path.join(scratch.dir, 'voice', `${hash}.mp3`));
    expect([...readClip(hash)!]).toEqual([1, 2, 3]);
    expect(hasClip(hash)).toBe(true);
  });

  it('ignores an empty file and refuses a path that is not a hash', () => {
    const hash = clipHash('m', 'v', 'Empty');
    fs.mkdirSync(path.join(scratch.dir, 'voice'), { recursive: true });
    fs.writeFileSync(clipPath(hash), '');
    expect(readClip(hash)).toBeNull();
    expect(() => clipPath('../student')).toThrow();
  });
});
