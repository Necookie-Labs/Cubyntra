/**
 * Cubyntra - Speech queue tests (voice, ADR-016)
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { SpeechQueue, type Speaker, type SpeechItem } from '../src/voice/speechQueue';

/** A speaker whose lines finish only when the test says so (or when they are stopped). */
function fakeSpeaker() {
  const said: string[] = [];
  const stopped: string[] = [];
  const finishers: (() => void)[] = [];
  let stops = 0;
  const speaker: Speaker = {
    speak: (item, signal) =>
      new Promise<void>((resolve) => {
        said.push(item.text);
        signal.addEventListener('abort', () => {
          stopped.push(item.text);
          resolve();
        });
        finishers.push(resolve);
      }),
    stop: () => {
      stops++;
    },
  };
  const finish = async () => {
    finishers.shift()?.();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { speaker, said, stopped, finish, stops: () => stops };
}

const line = (text: string): SpeechItem => ({ text, kind: 'phrase' });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('SpeechQueue', () => {
  it('says lines one after another', async () => {
    const fake = fakeSpeaker();
    const queue = new SpeechQueue(fake.speaker);
    queue.say(line('one'), line('two'));
    await tick();
    expect(fake.said).toEqual(['one']);
    expect(queue.pending).toBe(1);
    await fake.finish();
    expect(fake.said).toEqual(['one', 'two']);
    await fake.finish();
    await queue.idle();
    expect(queue.speaking).toBe(false);
  });

  it('skips empty lines', async () => {
    const fake = fakeSpeaker();
    const queue = new SpeechQueue(fake.speaker);
    queue.say(line('  '));
    await queue.idle();
    expect(fake.said).toEqual([]);
  });

  it('stops and drops everything when the step changes', async () => {
    const fake = fakeSpeaker();
    const queue = new SpeechQueue(fake.speaker);
    queue.setStep('step-1');
    queue.say(line('intro'), line('first move'), line('second move'));
    await tick();
    expect(queue.setStep('step-1')).toBe(false); // the same step goes on
    expect(queue.setStep('step-2')).toBe(true);
    await tick();
    expect(fake.stopped).toEqual(['intro']);
    expect(fake.stops()).toBe(1);
    expect(queue.pending).toBe(0);
    queue.say(line('new step'));
    await tick();
    expect(fake.said).toEqual(['intro', 'new step']);
  });

  it('cuts the last move short when the twin moves on', async () => {
    const fake = fakeSpeaker();
    const queue = new SpeechQueue(fake.speaker);
    queue.say(line('move 1'));
    await tick();
    queue.replace(line('move 2'));
    await tick();
    expect(fake.stopped).toEqual(['move 1']);
    expect(fake.said).toEqual(['move 1', 'move 2']);
  });

  it('keeps going after a line fails', async () => {
    const said: string[] = [];
    const queue = new SpeechQueue({
      speak: async (item) => {
        said.push(item.text);
        if (item.text === 'bad') throw new Error('no audio');
      },
      stop: () => {},
    });
    queue.say(line('bad'), line('good'));
    await queue.idle();
    expect(said).toEqual(['bad', 'good']);
  });

  it('switches speaker, stopping the old one', async () => {
    const a = fakeSpeaker();
    const b = fakeSpeaker();
    const queue = new SpeechQueue(a.speaker);
    queue.say(line('one'));
    await tick();
    queue.setSpeaker(b.speaker);
    queue.say(line('two'));
    await tick();
    expect(a.stopped).toEqual(['one']);
    expect(b.said).toEqual(['two']);
  });
});
