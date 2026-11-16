/**
 * Cubyntra - Algorithm Playback Controller
 * Necookie Labs (c) 2026
 *
 * Plays an algorithm on the twin: play, pause, step forward and back, seek, half speed and loop.
 * It is pure logic over a small driver interface (the CubeEngine implements it), so it runs and
 * is tested without WebGL.
 *
 * Guarantees:
 * - The logical state is ground truth. Every state along the algorithm is computed up front with
 *   applyMove, and each turn is handed to the driver together with the exact state it must end
 *   in, so the engine's snap-and-repaint keeps the twin drift-free.
 * - Commands run one at a time, in the order they were given. A turn that has started always
 *   finishes (the engine cannot stop a layer halfway); `pause` stops before the next one.
 * - Stepping back plays the inverse of the previous move.
 */

import type { CubeState, Move } from '../cube/types';
import { applyMove, invertMove } from '../cube/transforms';

/** What the controller needs from a twin. `CubeEngine` provides both methods. */
export interface PlaybackDriver {
  /** Animates one move; resolves once it has finished and the twin shows `targetState`. */
  animateMove(move: Move, targetState: CubeState, durationMs?: number): Promise<void>;
  /** Shows `state` without animating (deferred by the engine until turns in flight finish). */
  requestSync(state: CubeState): void;
}

export type PlaybackSpeed = 1 | 0.5;

export interface PlaybackSnapshot {
  readonly moves: readonly Move[];
  /** Moves applied so far: 0 shows the start state, `total` shows the state after the last move. */
  readonly index: number;
  readonly total: number;
  /** The move animating right now (an index into `moves`), or null between turns. */
  readonly activeIndex: number | null;
  /** 'back' while the inverse of `moves[activeIndex]` is animating. */
  readonly direction: 'forward' | 'back' | null;
  readonly playing: boolean;
  readonly speed: PlaybackSpeed;
  readonly loop: boolean;
  /** Logical state at `index`. */
  readonly state: CubeState;
}

export interface PlaybackOptions {
  /** Duration of one quarter turn at 1x. Default 300 ms. */
  turnMs?: number;
  /** Pause between turns while playing at 1x. Default 250 ms. */
  restMs?: number;
  /** Waits between turns; injectable so tests need no timers. */
  sleep?: (ms: number) => Promise<void>;
}

export type PlaybackListener = (snapshot: PlaybackSnapshot) => void;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Every state along `moves`: `states[i]` is `start` after the first `i` moves. */
export function statesAlong(start: CubeState, moves: readonly Move[]): CubeState[] {
  const states = [start];
  for (const move of moves) states.push(applyMove(states[states.length - 1], move));
  return states;
}

export class PlaybackController {
  private readonly driver: PlaybackDriver;
  private readonly turnMs: number;
  private readonly restMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  private moves: readonly Move[] = [];
  private states: CubeState[] = [];
  private index = 0;
  private activeIndex: number | null = null;
  private direction: 'forward' | 'back' | null = null;
  private playing = false;
  private speed: PlaybackSpeed = 1;
  private loop = false;

  private snapshot: PlaybackSnapshot | null = null;
  private listeners = new Set<PlaybackListener>();
  /** Commands run strictly one after another on this chain. */
  private chain: Promise<void> = Promise.resolve();
  /** Bumped by load() and dispose(); queued commands from an older generation do nothing. */
  private generation = 0;
  private disposed = false;

  constructor(driver: PlaybackDriver, options: PlaybackOptions = {}) {
    this.driver = driver;
    this.turnMs = options.turnMs ?? 300;
    this.restMs = options.restMs ?? 250;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /**
   * Loads an algorithm to play from `start`. Stops playback, rewinds to the start and shows the
   * start state once any turn already in flight has finished.
   */
  public load(start: CubeState, moves: readonly Move[]): void {
    if (this.disposed) return;
    this.generation++;
    this.playing = false;
    this.moves = [...moves];
    this.states = statesAlong(start, this.moves);
    this.index = 0;
    this.activeIndex = null;
    this.direction = null;
    this.emit();
    void this.enqueue(async () => this.driver.requestSync(this.states[0]));
  }

  /** Plays from the current move to the end (or around again with loop). From the end, restarts. */
  public play(): Promise<void> {
    if (this.disposed || this.playing || this.moves.length === 0) return this.chain;
    this.playing = true;
    this.emit();
    return this.enqueue((gen) => this.runPlay(gen));
  }

  /** Stops after the turn in flight, if any. */
  public pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.emit();
  }

  /** Pauses, then animates the next move. Does nothing at the end. */
  public stepForward(): Promise<void> {
    this.pause();
    return this.enqueue((gen) => this.forwardOnce(gen));
  }

  /** Pauses, then animates the inverse of the previous move. Does nothing at the start. */
  public stepBack(): Promise<void> {
    this.pause();
    return this.enqueue((gen) => this.backOnce(gen));
  }

  /** Pauses and jumps to the state after `index` moves, without animating. */
  public seek(index: number): Promise<void> {
    this.pause();
    return this.enqueue(async () => {
      this.index = Math.max(0, Math.min(this.moves.length, Math.trunc(index)));
      this.driver.requestSync(this.states[this.index]);
      this.emit();
    });
  }

  /** Back to the start state. */
  public reset(): Promise<void> {
    return this.seek(0);
  }

  /** 0.5 makes every turn and rest twice as long; applies from the next turn. */
  public setSpeed(speed: PlaybackSpeed): void {
    if (speed !== 1 && speed !== 0.5) throw new Error(`Unsupported playback speed: ${speed}`);
    if (speed === this.speed) return;
    this.speed = speed;
    this.emit();
  }

  /** With loop on, play wraps from the end back to the start state instead of stopping. */
  public setLoop(loop: boolean): void {
    if (loop === this.loop) return;
    this.loop = loop;
    this.emit();
  }

  public getSnapshot(): PlaybackSnapshot {
    if (!this.snapshot) {
      this.snapshot = {
        moves: this.moves,
        index: this.index,
        total: this.moves.length,
        activeIndex: this.activeIndex,
        direction: this.direction,
        playing: this.playing,
        speed: this.speed,
        loop: this.loop,
        state: this.states[this.index] ?? this.states[0],
      };
    }
    return this.snapshot;
  }

  /** Calls `listener` on every change (index, active move, playing, speed, loop). */
  public subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Resolves once every command given so far has finished. */
  public whenIdle(): Promise<void> {
    return this.chain;
  }

  public dispose(): void {
    this.disposed = true;
    this.generation++;
    this.playing = false;
    this.listeners.clear();
  }

  private emit(): void {
    this.snapshot = null;
    const snapshot = this.getSnapshot();
    for (const listener of [...this.listeners]) listener(snapshot);
  }

  private enqueue(op: (gen: number) => Promise<void>): Promise<void> {
    const gen = this.generation;
    const run = this.chain.then(() => (gen === this.generation && !this.disposed ? op(gen) : undefined));
    this.chain = run.catch(() => {});
    return run;
  }

  private current(gen: number): boolean {
    return gen === this.generation && !this.disposed;
  }

  private async turn(gen: number, moveIndex: number, direction: 'forward' | 'back'): Promise<void> {
    this.activeIndex = moveIndex;
    this.direction = direction;
    this.emit();
    const move = direction === 'forward' ? this.moves[moveIndex] : invertMove(this.moves[moveIndex]);
    const target = this.states[direction === 'forward' ? moveIndex + 1 : moveIndex];
    // The engine itself gives half turns 1.5x the quarter-turn duration.
    await this.driver.animateMove(move, target, this.turnMs / this.speed);
    if (!this.current(gen)) return;
    this.index = direction === 'forward' ? moveIndex + 1 : moveIndex;
    this.activeIndex = null;
    this.direction = null;
    this.emit();
  }

  private async forwardOnce(gen: number): Promise<void> {
    if (this.index < this.moves.length) await this.turn(gen, this.index, 'forward');
  }

  private async backOnce(gen: number): Promise<void> {
    if (this.index > 0) await this.turn(gen, this.index - 1, 'back');
  }

  private async runPlay(gen: number): Promise<void> {
    const rest = () => this.sleep(this.restMs / this.speed);

    // Play from the end means "play it again".
    if (this.index >= this.moves.length) {
      this.index = 0;
      this.driver.requestSync(this.states[0]);
      this.emit();
      await rest();
    }

    while (this.playing && this.current(gen)) {
      if (this.index >= this.moves.length) {
        if (!this.loop) {
          this.playing = false;
          this.emit();
          return;
        }
        // Hold the finished state a moment, then wrap to the start.
        await this.sleep((this.restMs * 3) / this.speed);
        if (!this.playing || !this.current(gen)) return;
        this.index = 0;
        this.driver.requestSync(this.states[0]);
        this.emit();
        await rest();
        continue;
      }
      await this.forwardOnce(gen);
      if (this.playing && this.current(gen) && (this.index < this.moves.length || this.loop)) await rest();
    }
  }
}
