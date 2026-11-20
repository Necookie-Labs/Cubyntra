/**
 * Cubyntra - Chat and speech privacy (ADR-014, ADR-015, ADR-016)
 * Necookie Labs (c) 2026
 *
 * "Ask the coach" sends words only: the step facts, the typed or transcribed question and the
 * earlier turns. No route accepts audio or images, the browser never records audio (speech to
 * text is the browser's own service), and nothing in the chat or speech code posts anything but
 * JSON text.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postChat } from '../src/app/api/coach/chat/route';
import { POST as postVoice } from '../src/app/api/voice/route';
import { parseChatRequest } from '../src/coach/chat';
import { resetSpendTrackerForTests } from '../src/coach/spend';
import { APP_TOKEN_HEADER, chatRateLimiter, getAppSecret, voiceRateLimiter } from '../src/lib/localAuth';
import { SAMPLE_FACTS } from './helpers/coachFacts';
import { useScratchDataDir } from './helpers/scratchData';

const IMAGE = `data:image/jpeg;base64,/9j/${'A'.repeat(600)}`;
const AUDIO = `data:audio/webm;base64,GkXfo${'B'.repeat(600)}`;
const BLOB = 'UklGR'.padEnd(400, 'Q');

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
  delete process.env.ANTHROPIC_API_KEY;
  resetSpendTrackerForTests();
  chatRateLimiter.reset();
  voiceRateLimiter.reset();
});
afterEach(() => {
  scratch.cleanup();
  vi.restoreAllMocks();
});

const request = (url: string, body: unknown) =>
  new Request(`http://localhost:3000${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', [APP_TOKEN_HEADER]: getAppSecret() },
  });

const base = { facts: SAMPLE_FACTS, question: 'Why does this work?', history: [] };

describe('/api/coach/chat takes words only', () => {
  it.each([
    ['an audio field', { ...base, audio: AUDIO }],
    ['a recording field', { ...base, recording: [1, 2, 3] }],
    ['an image field', { ...base, image: IMAGE }],
    ['a cube state', { ...base, state: { U: ['white'] } }],
    ['audio as the question', { ...base, question: AUDIO }],
    ['an image as the question', { ...base, question: IMAGE.slice(0, 390) }],
    ['an encoded blob as the question', { ...base, question: BLOB }],
    ['audio in a turn', { ...base, history: [{ role: 'student', text: AUDIO }] }],
    ['an image in a turn', { ...base, history: [{ role: 'coach', text: IMAGE }] }],
    ['audio next to a turn', { ...base, history: [{ role: 'student', text: 'Hi', audio: AUDIO }] }],
    ['an image in the facts', { ...base, facts: { ...SAMPLE_FACTS, goal: IMAGE } }],
  ])('refuses %s', async (_name, body) => {
    expect(parseChatRequest(body).ok).toBe(false);
    expect((await postChat(request('/api/coach/chat', body))).status).toBeGreaterThanOrEqual(400);
  });

  it('keeps only facts, question and turns of role and text', () => {
    const parsed = parseChatRequest({ ...base, history: [{ role: 'student', text: 'Hi' }] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.value).sort()).toEqual(['facts', 'history', 'question']);
    expect(Object.keys(parsed.value.facts)).not.toContain('image');
    expect(parsed.value.history).toEqual([{ role: 'student', text: 'Hi' }]);
  });

  it('/api/voice still refuses audio sent the other way', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await postVoice(request('/api/voice', { text: 'Hi', audio: AUDIO }))).status).toBe(400);
    expect((await postVoice(request('/api/voice', { text: AUDIO }))).status).toBe(400);
  });
});

function sources(...dirs: string[]): { file: string; text: string }[] {
  return dirs.flatMap((dir) => {
    const full = path.join(process.cwd(), dir);
    if (fs.statSync(full).isFile()) return [{ file: dir, text: fs.readFileSync(full, 'utf8') }];
    return fs
      .readdirSync(full, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
      .map((e) => {
        const file = path.join(e.parentPath, e.name);
        return { file: path.relative(process.cwd(), file), text: fs.readFileSync(file, 'utf8') };
      });
  });
}

describe('the browser never records or sends audio', () => {
  const all = sources('src');

  it('no source records audio or asks for the microphone itself', () => {
    for (const { file, text } of all) {
      expect(text, file).not.toMatch(/MediaRecorder|AudioWorklet|createMediaStreamSource|getUserMedia\(\s*\{[^}]*audio\s*:\s*true/);
    }
  });

  it('the chat and speech code posts JSON text only', () => {
    const chat = sources('src/coach', 'src/components/coach', 'src/voice/speechInput.ts');
    // Every request body in code (not comments): `body: <expression>,` on its own line.
    const bodies = chat.flatMap(({ text }) => [...text.matchAll(/^\s+body:\s*(.+?),?$/gm)].map((m) => m[1].trim()));
    expect(bodies.sort()).toEqual(['JSON.stringify({ facts })', 'JSON.stringify({ facts: stepFacts, question, history })'].sort());
    for (const { file, text } of chat) {
      expect(text, file).not.toMatch(/FormData|toDataURL|getImageData|new Blob|<video|canvas/);
    }
  });

  it('speech input only reads transcripts', () => {
    const [{ text }] = sources('src/voice/speechInput.ts');
    expect(text).toMatch(/transcript/);
    expect(text).not.toMatch(/fetch\(|audioBuffer|blob/i);
  });
});
