/**
 * Cubyntra - Voice fallback chain tests: ElevenLabs -> device voice -> off
 * Necookie Labs (c) 2026
 */

import { describe, expect, it, vi } from 'vitest';
import {
  VoiceUnavailableError,
  createElevenLabsSpeaker,
  createVoiceSpeaker,
  voiceRequestBody,
  type AudioLike,
} from '../src/voice/elevenLabsSpeaker';
import type { Speaker, SpeechItem } from '../src/voice/speechQueue';

const phrase: SpeechItem = { text: 'Nice work!', kind: 'phrase' };
const reply: SpeechItem = { text: 'Look for the white edge.', kind: 'reply' };
const signal = () => new AbortController().signal;

function recorder(fail?: () => Error): Speaker & { said: string[] } {
  const said: string[] = [];
  return {
    said,
    speak: async (item) => {
      said.push(item.text);
      if (fail) throw fail();
    },
    stop: vi.fn(),
  };
}

class FakeAudio implements AudioLike {
  src = '';
  playbackRate = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static played: FakeAudio[] = [];
  static blocked = false;
  play() {
    FakeAudio.played.push(this);
    if (FakeAudio.blocked) return Promise.reject(new Error('NotAllowedError'));
    queueMicrotask(() => this.onended?.());
    return Promise.resolve();
  }
  pause = vi.fn();
}

function elevenSpeaker(fetchImpl: typeof fetch, token: string | null = 'tok') {
  FakeAudio.played = [];
  FakeAudio.blocked = false;
  return createElevenLabsSpeaker({
    token,
    rate: 1.25,
    fetchImpl,
    createAudio: () => new FakeAudio(),
    createUrl: () => 'blob:clip',
    revokeUrl: () => {},
  });
}

const audioResponse = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } });

describe('createVoiceSpeaker (the chain)', () => {
  it('says nothing when voice is off', async () => {
    const device = recorder();
    const eleven = recorder();
    await createVoiceSpeaker({ mode: 'off', device, elevenlabs: eleven }).speak(phrase, signal());
    expect(device.said).toEqual([]);
    expect(eleven.said).toEqual([]);
  });

  it('uses only the device voice in device mode', async () => {
    const device = recorder();
    const eleven = recorder();
    const chain = createVoiceSpeaker({ mode: 'device', device, elevenlabs: eleven });
    await chain.speak(phrase, signal());
    await chain.speak({ ...reply, premium: true }, signal());
    expect(device.said).toEqual([phrase.text, reply.text]);
    expect(eleven.said).toEqual([]);
  });

  it('in ElevenLabs mode sends phrases and premium replies to ElevenLabs, other replies to the device', async () => {
    const device = recorder();
    const eleven = recorder();
    const chain = createVoiceSpeaker({ mode: 'elevenlabs', device, elevenlabs: eleven });
    await chain.speak(phrase, signal());
    await chain.speak(reply, signal());
    await chain.speak({ ...reply, premium: true }, signal());
    expect(eleven.said).toEqual([phrase.text, reply.text]);
    expect(device.said).toEqual([reply.text]);
  });

  it('falls back to the device voice when ElevenLabs fails, and stops asking after the cap', async () => {
    const device = recorder();
    const eleven = recorder(() => new VoiceUnavailableError('capped'));
    const onFallback = vi.fn();
    const chain = createVoiceSpeaker({ mode: 'elevenlabs', device, elevenlabs: eleven, onFallback });
    await chain.speak(phrase, signal());
    await chain.speak(phrase, signal());
    expect(device.said).toEqual([phrase.text, phrase.text]);
    expect(eleven.said).toEqual([phrase.text]);
    expect(onFallback).toHaveBeenCalledWith('capped');
  });

  it('keeps trying ElevenLabs after a passing upstream failure', async () => {
    const device = recorder();
    const eleven = recorder(() => new VoiceUnavailableError('upstream'));
    const chain = createVoiceSpeaker({ mode: 'elevenlabs', device, elevenlabs: eleven });
    await chain.speak(phrase, signal());
    await chain.speak(phrase, signal());
    expect(eleven.said).toHaveLength(2);
    expect(device.said).toHaveLength(2);
  });

  it('does not fall back when the line was interrupted', async () => {
    const device = recorder();
    const controller = new AbortController();
    const eleven: Speaker = {
      speak: async () => {
        controller.abort();
        throw new VoiceUnavailableError('network');
      },
      stop: () => {},
    };
    await createVoiceSpeaker({ mode: 'elevenlabs', device, elevenlabs: eleven }).speak(phrase, controller.signal);
    expect(device.said).toEqual([]);
  });
});

describe('createElevenLabsSpeaker', () => {
  it('sends only { text, kind } with the token and plays the clip at the chosen speed', async () => {
    const fetchImpl = vi.fn(async () => audioResponse());
    await elevenSpeaker(fetchImpl as unknown as typeof fetch).speak(phrase, signal());
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/voice');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Nice work!', kind: 'phrase' });
    expect((init.headers as Record<string, string>)['x-cubyntra-token']).toBe('tok');
    expect(FakeAudio.played).toHaveLength(1);
    expect(FakeAudio.played[0].playbackRate).toBe(1.25);
  });

  it('keeps phrase clips in memory, not replies', async () => {
    const fetchImpl = vi.fn(async () => audioResponse());
    const speaker = elevenSpeaker(fetchImpl as unknown as typeof fetch);
    await speaker.speak(phrase, signal());
    await speaker.speak(phrase, signal());
    await speaker.speak(reply, signal());
    await speaker.speak(reply, signal());
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('turns a fallback answer into an error carrying its reason', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: 'x', fallback: 'device', reason: 'capped' }, { status: 503 }));
    await expect(elevenSpeaker(fetchImpl as unknown as typeof fetch).speak(phrase, signal())).rejects.toMatchObject({ reason: 'capped' });
  });

  it('fails without a token, without the network, or when playback is blocked', async () => {
    const never = vi.fn();
    await expect(elevenSpeaker(never as unknown as typeof fetch, null).speak(phrase, signal())).rejects.toMatchObject({ reason: 'no-key' });
    expect(never).not.toHaveBeenCalled();
    const offline = vi.fn(async () => {
      throw new TypeError('offline');
    });
    await expect(elevenSpeaker(offline as unknown as typeof fetch).speak(phrase, signal())).rejects.toMatchObject({ reason: 'network' });
    const speaker = elevenSpeaker(vi.fn(async () => audioResponse()) as unknown as typeof fetch);
    FakeAudio.blocked = true;
    await expect(speaker.speak(phrase, signal())).rejects.toMatchObject({ reason: 'playback' });
  });

  it('builds request bodies from the text and kind only', () => {
    expect(voiceRequestBody({ text: 'Hi', kind: 'reply', premium: true })).toEqual({ text: 'Hi', kind: 'reply' });
  });
});
