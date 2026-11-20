'use client';

/**
 * Cubyntra - Settings: Talk to the coach (ADR-014, ADR-016)
 * Necookie Labs (c) 2026
 *
 * Off by default. On, "Ask the coach" shows a mic button (where the browser has speech
 * recognition) so the student can say a question instead of typing it. A one-line notice says
 * who turns speech into text: the browser's own speech service; Cubyntra never records or keeps
 * audio. "Send when I stop talking" (on by default) sends the question as soon as speech ends.
 */

import React, { useSyncExternalStore } from 'react';
import { Panel, Switch } from '@/components/ui';
import { useTutorStore } from '@/stores/useTutorStore';
import { isSpeechInputAvailable } from '@/voice/speechInput';

const noSubscribe = () => () => {};

export const TALK_NOTICE =
  'Your browser’s own speech service turns what you say into text. Cubyntra never records or stores audio; only the words are sent to the coach.';

export function TalkSettings() {
  const settings = useTutorStore((s) => s.profile.settings);
  const updateSettings = useTutorStore((s) => s.updateSettings);
  const available = useSyncExternalStore(noSubscribe, isSpeechInputAvailable, () => true);
  return (
    <Panel className="flex flex-col gap-6">
      <Switch
        label="Talk to the coach"
        hint={TALK_NOTICE}
        checked={settings.talkToCoach}
        onChange={(talkToCoach) => updateSettings({ talkToCoach })}
      />
      {settings.talkToCoach && !available && (
        <p className="text-xs text-ink">This browser cannot turn speech into text, so the mic button is hidden here. Typing still works.</p>
      )}
      <Switch
        label="Send when I stop talking"
        hint="Off: the words wait in the box so you can check them, then press Send."
        checked={settings.chatAutoSend}
        disabled={!settings.talkToCoach}
        onChange={(chatAutoSend) => updateSettings({ chatAutoSend })}
      />
    </Panel>
  );
}
