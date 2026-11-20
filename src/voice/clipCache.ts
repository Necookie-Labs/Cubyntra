/**
 * Cubyntra - Voice clip cache (server only, ADR-016)
 * Necookie Labs (c) 2026
 *
 * Phrase-bank clips made with ElevenLabs are kept as `data/voice/<hash>.mp3`, where the hash
 * covers the model, the voice, the text and the speed: a clip is made once and then served
 * without spending credits, and changing the voice, model or speed makes new clips instead of
 * reusing the old ones.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { dataPath, writeFileAtomic } from '../lib/dataDir';

export const CLIP_DIR = 'voice';

/**
 * Cache key of a clip: SHA-256 of model, voice, text and speed (hex, 64 characters). At normal
 * speed the speed is left out, so a normal-speed key is the one used before speeds existed.
 */
export function clipHash(model: string, voiceId: string, text: string, speed = 1): string {
  const parts: unknown[] = speed === 1 ? [model, voiceId, text] : [model, voiceId, text, speed];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function clipPath(hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Not a clip hash');
  return path.join(dataPath(CLIP_DIR), `${hash}.mp3`);
}

/** The cached clip, or null when it has not been made yet. */
export function readClip(hash: string): Uint8Array | null {
  try {
    const bytes = fs.readFileSync(clipPath(hash));
    return bytes.byteLength > 0 ? new Uint8Array(bytes) : null;
  } catch {
    return null;
  }
}

export function hasClip(hash: string): boolean {
  return readClip(hash) !== null;
}

/** Saves a clip (atomically, so a half-written clip is never served). */
export async function writeClip(hash: string, audio: Uint8Array): Promise<void> {
  await writeFileAtomic(clipPath(hash), audio);
}
