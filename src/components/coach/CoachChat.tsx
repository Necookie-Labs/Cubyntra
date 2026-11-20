'use client';

/**
 * Cubyntra - Ask the coach (chat about the current case)
 * Necookie Labs (c) 2026
 *
 * A short conversation about the step on screen: student and coach bubbles (flat tokens, no
 * rounding), the answer streaming in, suggested questions (the notation one names a move of
 * the step), a text field (Enter sends, Shift+Enter is a new line), Send, Stop while an answer
 * streams, and Clear. Finished answers are announced through a polite live region.
 *
 * The conversation belongs to one step: a new step clears it and says "New step, new
 * conversation". With "Talk to the coach" on in Settings, and where the browser has speech
 * recognition, a mic button fills the field from speech (hold to talk, or tap to start and tap
 * to stop); with auto-send on, the question goes as soon as the student stops talking. With
 * `voice`, a finished, guard-approved answer is read aloud (ElevenLabs in ElevenLabs mode, else
 * the device voice), and a new question stops the reading.
 */

import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronUp, Eraser, Mic, MicOff, Send, Square } from 'lucide-react';
import type { Diagnosis, StepPlan } from '@/tutor/types';
import type { AttemptRecord } from '@/coach/types';
import { MAX_CHAT_QUESTION, checkChatAnswer, suggestedQuestions } from '@/coach/chat';
import { useCoachChat } from '@/coach/useCoachChat';
import { BlockButton, IconButton, cx } from '@/components/ui';
import { useTutorStore } from '@/stores/useTutorStore';
import { chatSpeech, type MoveSpeech } from '@/voice/speechText';
import type { SpeechItem } from '@/voice/speechQueue';
import { createSpeechInput, speechRecognitionCtor, type RecognitionCtor, type SpeechInput } from '@/voice/speechInput';

/** What the chat needs from a screen's voice to read answers aloud. */
export interface ChatVoiceControls {
  /** The voice is on and this device is the one speaking. */
  on: boolean;
  /** ElevenLabs mode: answers are read with ElevenLabs (falling back to the device voice). */
  elevenlabs: boolean;
  moves: MoveSpeech;
  replace: (item: SpeechItem) => void;
  interrupt: () => void;
}

export interface CoachChatProps {
  plan: StepPlan;
  token: string | null;
  attempts?: readonly AttemptRecord[];
  diagnosis?: Diagnosis;
  voice?: ChatVoiceControls | null;
  /** Show a header button that opens and closes the chat. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Tests pass a fake speech recognition (null: none). Default: the browser's. */
  recognition?: RecognitionCtor | null;
  className?: string;
}

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};
const isOnline = () => navigator.onLine !== false;
const noSubscribe = () => () => {};

/** Holding the mic this long (ms) means push-to-talk: letting go stops listening. */
const HOLD_MS = 350;

export function CoachChat({
  plan,
  token,
  attempts,
  diagnosis,
  voice,
  collapsible = false,
  defaultOpen = false,
  recognition,
  className,
}: CoachChatProps) {
  const chat = useCoachChat({ plan, token, attempts, diagnosis });
  const talkToCoach = useTutorStore((s) => s.profile.settings.talkToCoach);
  const autoSend = useTutorStore((s) => s.profile.settings.chatAutoSend);
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const browserRecognition = useSyncExternalStore(noSubscribe, () => speechRecognitionCtor(), () => null);
  const ctor = recognition === undefined ? browserRecognition : recognition;
  const micShown = talkToCoach && ctor !== null;

  const [open, setOpen] = useState(defaultOpen || !collapsible);
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const id = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const facts = chat.facts;
  const chips = facts ? suggestedQuestions(facts) : [];
  const last = chat.messages.at(-1);
  const lastAnswer = [...chat.messages].reverse().find((m) => m.role === 'coach' && m.status === 'done');

  const send = (text: string) => {
    const question = text.trim();
    if (!question || !online) return;
    voice?.interrupt();
    chat.ask(question);
    setDraft('');
  };

  // Read each finished answer once, only if it passes the chat guardrail again.
  const spokenId = useRef<number | null>(null);
  const replace = voice?.replace;
  const voiceOn = voice?.on ?? false;
  const premium = voice?.elevenlabs ?? false;
  const style = voice?.moves ?? 'words';
  useEffect(() => {
    if (!replace || !voiceOn || !lastAnswer || !facts || spokenId.current === lastAnswer.id) return;
    spokenId.current = lastAnswer.id;
    const text = chatSpeech({ text: lastAnswer.text, status: 'done' }, (t) => checkChatAnswer(t, facts).ok, style);
    if (text) replace({ text, kind: 'reply', premium });
  }, [replace, voiceOn, premium, style, lastAnswer, facts]);

  // The microphone: one recognition session at a time.
  const inputRef = useRef<SpeechInput | null>(null);
  const handlers = useRef({ autoSend, send });
  useEffect(() => {
    handlers.current = { autoSend, send };
  });
  useEffect(() => {
    if (!micShown) return;
    const input = createSpeechInput(ctor, {
      onTranscript: (text) => setDraft(text.slice(0, MAX_CHAT_QUESTION)),
      onEnd: (text) => {
        setListening(false);
        if (text && handlers.current.autoSend) handlers.current.send(text);
        else fieldRef.current?.focus();
      },
      onError: (message) => {
        setListening(false);
        setMicError(message);
      },
    });
    inputRef.current = input;
    return () => {
      input.abort();
      inputRef.current = null;
    };
  }, [micShown, ctor]);

  const startListening = () => {
    setMicError(null);
    voice?.interrupt();
    if (inputRef.current?.start()) setListening(true);
  };
  const stopListening = () => inputRef.current?.stop();
  const pressedAt = useRef(0);
  const wasListening = useRef(false);

  const panelId = `${id}-chat`;
  const header = (
    <span className="flex items-center gap-2">
      Ask the coach
    </span>
  );

  return (
    <section aria-labelledby={`${id}-title`} className={cx('flex flex-col gap-3', className)}>
      {collapsible ? (
        <h3 id={`${id}-title`} className="text-base leading-tight text-ink">
          <BlockButton
            size="sm"
            variant="ghost"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            icon={open ? <ChevronUp aria-hidden className="h-4 w-4" /> : <ChevronDown aria-hidden className="h-4 w-4" />}
            className="w-full justify-start"
          >
            {header}
          </BlockButton>
        </h3>
      ) : (
        <h3 id={`${id}-title`} className="text-base leading-tight text-ink">
          {header}
        </h3>
      )}

      <div id={panelId} hidden={!open} className="flex flex-col gap-3">
        {chat.stepChanged && (
          <p role="status" className="text-xs font-bold text-muted">
            New step, new conversation.
          </p>
        )}

        {chat.messages.length > 0 && (
          <ol aria-label="Conversation with the coach" className="flex flex-col gap-2">
            {chat.messages.map((m) =>
              m.role === 'student' ? (
                <li key={m.id} className="ml-8 self-end border-2 border-line bg-well px-3 py-2 text-sm text-ink">
                  <span className="sr-only">You asked: </span>
                  {m.text}
                </li>
              ) : (
                <li
                  key={m.id}
                  aria-busy={m.status === 'streaming'}
                  className="mr-8 self-start border-2 border-line-soft bg-panel px-3 py-2 text-sm leading-relaxed text-ink"
                >
                  <span className="sr-only">Coach: </span>
                  {m.text ? <span className="whitespace-pre-line">{m.text}</span> : null}
                  {m.status === 'streaming' && !m.text && (
                    <span className="flex items-center gap-3">
                      <span aria-hidden className="vx-loader">
                        <span />
                        <span />
                        <span />
                      </span>
                      <span className="text-muted">The coach is thinking…</span>
                    </span>
                  )}
                  {m.status === 'stopped' && <span className="block pt-1 text-xs text-muted">Stopped.</span>}
                  {m.status === 'error' && !m.text && <span className="text-muted">No answer this time.</span>}
                  {m.status === 'done' && m.notice && <span className="block pt-1 text-xs text-muted">{m.notice}</span>}
                </li>
              )
            )}
          </ol>
        )}

        {/* Finished answers, announced once; the streaming bubble above is not a live region. */}
        <p aria-live="polite" className="sr-only">
          {lastAnswer && last === lastAnswer ? lastAnswer.text : ''}
        </p>

        {chat.error && <p className="text-sm text-ink">{chat.error}</p>}
        {!online && <p className="text-sm text-ink">You are offline. The step notes still work; ask again when you are back online.</p>}

        {chips.length > 0 && (
          <div role="group" aria-label="Suggested questions" className="flex flex-wrap gap-2">
            {chips.map((q) => (
              <BlockButton key={q} size="sm" disabled={!online} onClick={() => send(q)}>
                {q}
              </BlockButton>
            ))}
          </div>
        )}

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <label htmlFor={`${id}-question`} className="text-sm font-bold text-ink">
            Your question
          </label>
          <textarea
            id={`${id}-question`}
            ref={fieldRef}
            value={draft}
            rows={2}
            maxLength={MAX_CHAT_QUESTION}
            placeholder={listening ? 'Listening…' : 'Ask about this step'}
            aria-describedby={`${id}-hint`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
            className="min-h-24 w-full resize-y border-2 border-line bg-well px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
          <p id={`${id}-hint`} className="text-xs text-muted">
            Enter sends, Shift+Enter starts a new line.
            {micShown && ' Hold the mic to talk, or tap it to start and stop.'}
          </p>
          {micError && <p className="text-sm text-ink">{micError}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {chat.busy ? (
              <BlockButton type="button" variant="primary" onClick={chat.stop} icon={<Square aria-hidden className="h-4 w-4" />}>
                Stop
              </BlockButton>
            ) : (
              <BlockButton type="submit" variant="primary" disabled={!draft.trim() || !online} icon={<Send aria-hidden className="h-4 w-4" />}>
                Send
              </BlockButton>
            )}
            {micShown && (
              <IconButton
                type="button"
                label={listening ? 'Stop listening' : 'Talk to the coach'}
                aria-pressed={listening}
                size="md"
                onPointerDown={() => {
                  pressedAt.current = Date.now();
                  wasListening.current = listening;
                  if (!listening) startListening();
                }}
                onPointerUp={() => {
                  // Tap while listening stops; holding then letting go stops (push-to-talk).
                  if (wasListening.current || Date.now() - pressedAt.current >= HOLD_MS) stopListening();
                }}
                onClick={(e) => {
                  // Keyboard (Enter or Space) toggles; pointer taps are handled above.
                  if (e.detail !== 0) return;
                  if (listening) stopListening();
                  else startListening();
                }}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </IconButton>
            )}
            <BlockButton
              type="button"
              variant="ghost"
              disabled={chat.messages.length === 0}
              onClick={() => {
                voice?.interrupt();
                chat.clear();
              }}
              icon={<Eraser aria-hidden className="h-4 w-4" />}
            >
              Clear
            </BlockButton>
          </div>
        </form>
      </div>
    </section>
  );
}
