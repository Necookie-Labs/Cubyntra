/**
 * Cubyntra - Speech queue (ADR-016)
 * Necookie Labs (c) 2026
 *
 * Lines are spoken one after another by a `Speaker` (the device voice, ElevenLabs, or a chain of
 * both). The queue belongs to one step: when the step changes (`setStep`) or the twin moves on
 * to the next move (`replace`), whatever is being said stops and the lines still waiting are
 * dropped, so the voice never talks about a step or a move that is no longer on screen.
 *
 * No DOM imports: the speaker does the talking, so the queue is tested with a fake one.
 */

/** `phrase`: a line of the phrase bank (cached with ElevenLabs). `reply`: a coach reply. */
export type SpeechKind = 'phrase' | 'reply';

export interface SpeechItem {
  text: string;
  kind: SpeechKind;
  /** A coach reply the student asked to hear with ElevenLabs ("Read with ElevenLabs"). */
  premium?: boolean;
}

export interface Speaker {
  /** Says one line; resolves when it has been said, stopped or failed. Must stop on `signal`. */
  speak(item: SpeechItem, signal: AbortSignal): Promise<void>;
  /** Stops anything being said at once. */
  stop(): void;
}

export class SpeechQueue {
  private waiting: SpeechItem[] = [];
  private current: AbortController | null = null;
  private step: string | null = null;
  private running: Promise<void> | null = null;

  constructor(private speaker: Speaker) {}

  /** Lines waiting to be said (not counting the one being said). */
  get pending(): number {
    return this.waiting.length;
  }

  /** True while a line is being said. */
  get speaking(): boolean {
    return this.current !== null;
  }

  /** Uses another speaker from the next line on (the one talking now is stopped). */
  setSpeaker(speaker: Speaker): void {
    if (speaker === this.speaker) return;
    this.interrupt();
    this.speaker = speaker;
  }

  /**
   * The step the lines belong to. A different step interrupts: the current line stops and the
   * waiting ones are dropped. Returns true when it interrupted.
   */
  setStep(step: string | null): boolean {
    if (step === this.step) return false;
    this.step = step;
    this.interrupt();
    return true;
  }

  /** Adds lines to the end of the queue. */
  say(...items: SpeechItem[]): void {
    const lines = items.filter((i) => i.text.trim());
    if (!lines.length) return;
    this.waiting.push(...lines);
    this.running ??= this.drain();
  }

  /** Stops what is being said and says these lines instead (the twin moved on). */
  replace(...items: SpeechItem[]): void {
    this.interrupt();
    this.say(...items);
  }

  /** Stops the current line and drops the waiting ones. */
  interrupt(): void {
    this.waiting = [];
    if (this.current) {
      this.current.abort();
      this.current = null;
      this.speaker.stop();
    }
  }

  /** Resolves once nothing is waiting or being said (tests). */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  private async drain(): Promise<void> {
    try {
      for (let item = this.waiting.shift(); item; item = this.waiting.shift()) {
        const controller = new AbortController();
        this.current = controller;
        try {
          await this.speaker.speak(item, controller.signal);
        } catch {
          // A failed line is skipped; the speaker chain already tried its fallbacks.
        }
        if (this.current === controller) this.current = null;
      }
    } finally {
      this.running = null;
    }
  }
}

/** A speaker that says nothing (voice off). */
export const SILENT_SPEAKER: Speaker = {
  speak: async () => {},
  stop: () => {},
};
