/**
 * Cubyntra - Device voice tests (speechSynthesis wrapper, ADR-016)
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { createDeviceSpeaker, deviceVoiceEnv, pickVoice, type DeviceVoiceEnv } from '../src/voice/deviceVoice';

const voice = (lang: string, extra: Partial<SpeechSynthesisVoice> = {}) =>
  ({ lang, name: lang, default: false, localService: true, voiceURI: lang, ...extra }) as SpeechSynthesisVoice;

class FakeUtterance {
  rate = 1;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

function fakeEnv(voices: SpeechSynthesisVoice[] = [voice('en-US')]) {
  const spoken: FakeUtterance[] = [];
  let cancels = 0;
  const env = {
    synth: {
      speak: (u: SpeechSynthesisUtterance) => spoken.push(u as unknown as FakeUtterance),
      cancel: () => {
        cancels++;
      },
      getVoices: () => voices,
    },
    Utterance: FakeUtterance as unknown as DeviceVoiceEnv['Utterance'],
  };
  return { env, spoken, cancels: () => cancels };
}

describe('pickVoice', () => {
  it('prefers the default voice when it is English', () => {
    const def = voice('en-AU', { default: true });
    expect(pickVoice([voice('fr-FR', { default: false }), voice('en-US'), def])).toBe(def);
  });

  it('prefers a local en-US voice over other English voices', () => {
    const us = voice('en-US');
    expect(pickVoice([voice('de-DE', { default: true }), voice('en-GB'), us])).toBe(us);
  });

  it('falls back to any English voice, then the default, then the first', () => {
    const remote = voice('en-IN', { localService: false });
    expect(pickVoice([voice('fr-FR'), remote])).toBe(remote);
    const def = voice('fr-FR', { default: true });
    expect(pickVoice([voice('de-DE'), def])).toBe(def);
    expect(pickVoice([])).toBeNull();
  });
});

describe('createDeviceSpeaker', () => {
  it('speaks with the chosen voice and rate, and resolves when the line ends', async () => {
    const fake = fakeEnv([voice('fr-FR'), voice('en-GB')]);
    const speaker = createDeviceSpeaker({ rate: 1.25, env: fake.env });
    const done = speaker.speak({ text: 'Turn the top to the left', kind: 'phrase' }, new AbortController().signal);
    const u = fake.spoken[0];
    expect(u.text).toBe('Turn the top to the left');
    expect(u.rate).toBe(1.25);
    expect(u.voice?.lang).toBe('en-GB');
    u.onend?.();
    await expect(done).resolves.toBeUndefined();
  });

  it('cancels when the line is interrupted', async () => {
    const fake = fakeEnv();
    const speaker = createDeviceSpeaker({ env: fake.env });
    const controller = new AbortController();
    const done = speaker.speak({ text: 'Hello', kind: 'phrase' }, controller.signal);
    controller.abort();
    await done;
    expect(fake.cancels()).toBe(1);
    speaker.stop();
    expect(fake.cancels()).toBe(2);
  });

  it('says nothing without speech support or once aborted', async () => {
    const silent = createDeviceSpeaker({ env: null });
    await expect(silent.speak({ text: 'Hi', kind: 'phrase' }, new AbortController().signal)).resolves.toBeUndefined();
    const fake = fakeEnv();
    const controller = new AbortController();
    controller.abort();
    await createDeviceSpeaker({ env: fake.env }).speak({ text: 'Hi', kind: 'phrase' }, controller.signal);
    expect(fake.spoken).toHaveLength(0);
  });

  it('finds no device voice outside a browser', () => {
    expect(deviceVoiceEnv()).toBeNull();
  });
});
