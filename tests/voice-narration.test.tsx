// @vitest-environment jsdom
/**
 * Cubyntra - Narration and the useVoice hook: no sound before a gesture, step changes interrupt
 * Necookie Labs (c) 2026
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseAlgorithm } from '../src/cube/transforms';
import { isAudioUnlocked, resetAudioUnlockForTests, unlockAudio } from '../src/voice/audioUnlock';
import { narratedMove, stageIntro } from '../src/voice/narration';
import type { Speaker } from '../src/voice/speechQueue';
import { useVoice } from '../src/voice/useVoice';

const moves = parseAlgorithm("R U R'");
const snap = (activeIndex: number | null, direction: 'forward' | 'back' | null = 'forward', list = moves) => ({
  moves: list,
  activeIndex,
  direction,
});

describe('narratedMove', () => {
  it('names a move as it starts turning forwards', () => {
    expect(narratedMove(snap(null, null), snap(0), 'words')).toBe('Turn the right side up');
    expect(narratedMove(snap(0), snap(1), 'notation')).toBe('U');
    expect(narratedMove(snap(1), snap(2), 'notation')).toBe('R prime');
  });

  it('says nothing between turns, when stepping back, or twice for one move', () => {
    expect(narratedMove(snap(0), snap(null, null), 'words')).toBeNull();
    expect(narratedMove(snap(null, null), snap(1, 'back'), 'words')).toBeNull();
    expect(narratedMove(snap(0), snap(0), 'words')).toBeNull();
  });

  it('names the first move of a new step even at the same index', () => {
    const next = parseAlgorithm('F');
    expect(narratedMove(snap(0), snap(0, 'forward', next), 'words')).toBe('Turn the front clockwise');
  });
});

describe('stageIntro', () => {
  it('introduces a new stage only', () => {
    expect(stageIntro(null, 'white-cross', 'White cross')).toBe('Next stage: White cross.');
    expect(stageIntro('white-cross', 'white-cross', 'White cross')).toBeNull();
    expect(stageIntro('white-cross', 'white-corners', 'White corners')).toBe('Next stage: White corners.');
  });
});

describe('useVoice', () => {
  function recorder() {
    const said: string[] = [];
    const stopped: string[] = [];
    const speaker: Speaker = {
      speak: (item, signal) =>
        new Promise<void>((resolve) => {
          said.push(item.text);
          signal.addEventListener('abort', () => {
            stopped.push(item.text);
            resolve();
          });
        }),
      stop: () => {},
    };
    return { speaker, said, stopped };
  }

  beforeEach(() => resetAudioUnlockForTests());
  afterEach(() => resetAudioUnlockForTests());

  const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

  it('never speaks before the first user gesture, and the first tap unlocks it', async () => {
    const fake = recorder();
    const { result } = renderHook(() => useVoice({ mode: 'device', rate: 1, token: null, createSpeaker: () => fake.speaker }));
    expect(result.current.active).toBe(false);
    act(() => result.current.say({ text: 'Too early', kind: 'phrase' }));
    await tick();
    expect(fake.said).toEqual([]);

    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    expect(isAudioUnlocked()).toBe(true);
    expect(result.current.active).toBe(true);
    act(() => result.current.say({ text: 'Hello', kind: 'phrase' }));
    await tick();
    expect(fake.said).toEqual(['Hello']);
  });

  it('stays silent when off or when another device is the speaker', async () => {
    unlockAudio();
    const fake = recorder();
    const { result, rerender } = renderHook((props: { mode: 'off' | 'device'; enabled: boolean }) =>
      useVoice({ ...props, rate: 1, token: null, createSpeaker: () => fake.speaker })
    , { initialProps: { mode: 'off', enabled: true } });
    act(() => result.current.say({ text: 'off', kind: 'phrase' }));
    rerender({ mode: 'device', enabled: false });
    act(() => result.current.say({ text: 'not the speaker', kind: 'phrase' }));
    await tick();
    expect(fake.said).toEqual([]);
    rerender({ mode: 'device', enabled: true });
    act(() => result.current.say({ text: 'now', kind: 'phrase' }));
    await tick();
    expect(fake.said).toEqual(['now']);
    // Losing the voice to the other device stops what is being said.
    rerender({ mode: 'device', enabled: false });
    await tick();
    expect(fake.stopped).toEqual(['now']);
  });

  it('interrupts when the step changes, and stops on unmount', async () => {
    unlockAudio();
    const fake = recorder();
    const { result, unmount } = renderHook(() => useVoice({ mode: 'device', rate: 1, token: null, createSpeaker: () => fake.speaker }));
    act(() => {
      result.current.setStep('step-1');
      result.current.say({ text: 'Turn the top to the left', kind: 'phrase' }, { text: 'waiting', kind: 'phrase' });
    });
    await tick();
    act(() => result.current.setStep('step-2'));
    await tick();
    expect(fake.stopped).toEqual(['Turn the top to the left']);
    expect(fake.said).toEqual(['Turn the top to the left']);
    act(() => result.current.say({ text: 'step two', kind: 'phrase' }));
    await tick();
    unmount();
    expect(fake.stopped).toEqual(['Turn the top to the left', 'step two']);
  });
});
