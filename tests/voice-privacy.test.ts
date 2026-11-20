/**
 * Cubyntra - Voice privacy tests (ADR-015, ADR-016: only text goes to ElevenLabs)
 * Necookie Labs (c) 2026
 *
 * `/api/voice` accepts only `{ text, kind?, voiceId?, quality?, rate? }` and refuses images, data
 * URLs and encoded blobs; the browser builds its request from the words and the voice choice
 * only; what reaches ElevenLabs is the text, the model id and the voice settings, nothing else.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postVoice } from '../src/app/api/voice/route';
import { APP_TOKEN_HEADER, getAppSecret, voiceRateLimiter } from '../src/lib/localAuth';
import { resetVoiceUsageTrackerForTests } from '../src/voice/credits';
import { voiceRequestBody } from '../src/voice/elevenLabsSpeaker';
import { resetVoiceServiceForTests } from '../src/voice/service';
import { MAX_VOICE_REQUEST_BYTES } from '../src/voice/types';
import { useScratchDataDir } from './helpers/scratchData';

const IMAGE = `data:image/jpeg;base64,/9j/${'A'.repeat(600)}`;

let scratch: ReturnType<typeof useScratchDataDir>;
let token: string;

beforeEach(() => {
  scratch = useScratchDataDir();
  process.env.ELEVENLABS_API_KEY = 'sk-test';
  resetVoiceUsageTrackerForTests();
  resetVoiceServiceForTests();
  voiceRateLimiter.reset();
  token = getAppSecret();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  scratch.cleanup();
  delete process.env.ELEVENLABS_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const post = (body: unknown) =>
  postVoice(
    new Request('http://localhost:3000/api/voice', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', [APP_TOKEN_HEADER]: token },
    })
  );

function stubElevenLabs() {
  const bodies: unknown[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/v1/user/subscription')) return Response.json({ character_count: 0, character_limit: 100_000 });
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { bodies, fetchMock };
}

describe('/api/voice takes words only', () => {
  it.each([
    ['an image data URL as the text', { text: IMAGE }],
    ['a data URL inside a sentence', { text: `Look at this data:image/png;base64,iVBORw0KGgo= now` }],
    ['an encoded blob', { text: 'Q'.repeat(400) }],
    ['an image field next to the text', { text: 'Hi', image: IMAGE }],
    ['a frame field', { text: 'Hi', frame: [1, 2, 3] }],
    ['a cube state', { text: 'Hi', state: { U: ['white'] } }],
    ['the student profile', { text: 'Hi', student: { name: 'Sam' } }],
  ])('refuses %s, calling no one', async (_name, body) => {
    const { fetchMock } = stubElevenLabs();
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an image-sized body before reading it all', async () => {
    stubElevenLabs();
    const res = await post({ text: 'Hi', pad: 'x'.repeat(MAX_VOICE_REQUEST_BYTES) });
    expect(res.status).toBe(413);
  });

  it('sends ElevenLabs the text, model id and voice settings, nothing else', async () => {
    const { bodies } = stubElevenLabs();
    expect((await post({ text: 'Turn the top to the left', kind: 'phrase' })).status).toBe(200);
    expect((await post({ text: 'Look for the white edge.', quality: 'fast' })).status).toBe(200);
    const settings = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 };
    expect(bodies).toEqual([
      { text: 'Turn the top to the left', model_id: 'eleven_v4', voice_settings: settings },
      { text: 'Look for the white edge.', model_id: 'eleven_v4_turbo', voice_settings: settings },
    ]);
  });

  it('answers with audio only, never echoing data back', async () => {
    stubElevenLabs();
    const res = await post({ text: 'Nice work!', kind: 'phrase' });
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
  });
});

describe('the browser sends only the words and the voice choice', () => {
  it('builds every voice request from the text, kind, voice, quality and speed', () => {
    expect(Object.keys(voiceRequestBody({ text: 'Hi', kind: 'phrase' }))).toEqual(['text', 'kind']);
    expect(Object.keys(voiceRequestBody({ text: 'Hi', kind: 'reply', premium: true }))).toEqual(['text', 'kind']);
    expect(
      Object.keys(voiceRequestBody({ text: 'Hi', kind: 'reply' }, { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', quality: 'fast', rate: 1.25 }))
    ).toEqual(['text', 'kind', 'voiceId', 'quality', 'rate']);
  });

  it('no voice source posts anything but voiceRequestBody', () => {
    const dir = path.join(process.cwd(), 'src', 'voice');
    const sources = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
    const posts = sources.flatMap((s) => [...s.matchAll(/body:\s*JSON\.stringify\(([^)]*)\)/g)].map((m) => m[1]));
    expect(posts.sort()).toEqual(['voiceRequestBody(item, { voiceId, quality, rate }', 'ttsRequestBody(text, model, speed'].sort());
    for (const source of sources) {
      expect(source).not.toMatch(/toDataURL|getImageData|canvas|<video|FormData/);
    }
  });
});
