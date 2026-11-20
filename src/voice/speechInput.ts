/**
 * Cubyntra - Talk to the coach: the browser's speech recognition (ADR-016)
 * Necookie Labs (c) 2026
 *
 * Push-to-talk for "Ask the coach" uses the browser's own `SpeechRecognition` (or the prefixed
 * `webkitSpeechRecognition`), feature-detected: where there is none, the mic button is hidden.
 * The browser's speech service turns speech into text; Cubyntra never records, keeps or sends
 * audio, and only the transcript (text) becomes the question. Language `en-US`.
 *
 * `createSpeechInput` wraps one recognition session at a time with plain callbacks, so it is
 * tested with a fake constructor. No React here (see `usePushToTalk`).
 */

/** The parts of a `SpeechRecognition` the coach uses. */
export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface RecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

export type RecognitionCtor = new () => RecognitionLike;

export const SPEECH_LANG = 'en-US';

/** The browser's speech recognition constructor, or null where there is none. */
export function speechRecognitionCtor(win: unknown = typeof window === 'undefined' ? undefined : window): RecognitionCtor | null {
  if (!win || typeof win !== 'object') return null;
  const w = win as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === 'function' ? (ctor as RecognitionCtor) : null;
}

export function isSpeechInputAvailable(): boolean {
  return speechRecognitionCtor() !== null;
}

/** Why listening stopped early, in words for the student (null: nothing to say). */
export function speechErrorMessage(error: string): string | null {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is blocked. Allow it in the browser’s site settings, or type your question.';
    case 'no-speech':
      return 'I did not hear anything. Hold the mic button and try again.';
    case 'audio-capture':
      return 'No microphone was found. Type your question instead.';
    case 'network':
      return 'The browser’s speech service could not be reached. Type your question instead.';
    case 'aborted':
      return null;
    default:
      return 'Listening stopped. Try again, or type your question.';
  }
}

export interface SpeechInputHandlers {
  /** The words heard so far (interim and final together). */
  onTranscript: (text: string) => void;
  /** Listening ended; `text` is everything heard (may be empty). */
  onEnd: (text: string) => void;
  onError: (message: string) => void;
}

export interface SpeechInput {
  start(): boolean;
  stop(): void;
  abort(): void;
  readonly listening: boolean;
}

/** One push-to-talk microphone. `start` returns false when it cannot listen. */
export function createSpeechInput(ctor: RecognitionCtor | null, handlers: SpeechInputHandlers): SpeechInput {
  let current: RecognitionLike | null = null;
  let heard = '';
  return {
    get listening() {
      return current !== null;
    },
    start() {
      if (!ctor || current) return false;
      let recognition: RecognitionLike;
      try {
        recognition = new ctor();
      } catch {
        handlers.onError('Listening is not available in this browser. Type your question instead.');
        return false;
      }
      recognition.lang = SPEECH_LANG;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      heard = '';
      recognition.onresult = (event) => {
        let text = '';
        for (let i = 0; i < event.results.length; i++) text += event.results[i][0]?.transcript ?? '';
        heard = text.replace(/\s+/g, ' ').trim();
        handlers.onTranscript(heard);
      };
      recognition.onerror = (event) => {
        const message = speechErrorMessage(event.error);
        if (message) handlers.onError(message);
      };
      recognition.onend = () => {
        if (current !== recognition) return;
        current = null;
        handlers.onEnd(heard);
      };
      current = recognition;
      try {
        recognition.start();
      } catch {
        current = null;
        handlers.onError('Listening could not start. Try again, or type your question.');
        return false;
      }
      return true;
    },
    stop() {
      current?.stop();
    },
    abort() {
      const r = current;
      current = null;
      r?.abort();
    },
  };
}
