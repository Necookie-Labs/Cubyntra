/**
 * Cubyntra - Teaching Twin Controller
 * Necookie Labs (c) 2026
 *
 * Puts one tutor step plan on the 3D twin and keeps the teaching aids in step with playback:
 * - loads `[...setupMoves, ...algorithm]` from `startState` (leading x / y / z regrips play as
 *   whole-cube turns, so the regrip is animated like any other move);
 * - holds the twin in the plan's grip, and in `gripAfter` once a regrip has played;
 * - lights the highlighted pieces wherever they are after each move, and outlines the target
 *   slot between its centers;
 * - shows the "after" preview of `expectedState` on request;
 * - points the move arrow at the move in focus;
 * - reports when the step has been played to the end.
 *
 * Pure logic over the engine's teaching API (`TeachingSurface`, which `CubeEngine` implements),
 * so it runs headlessly in tests. No DOM, React or Three.js imports.
 */

import type { CubeState, Move } from '../cube/types';
import { gripOf, type Grip } from '../cube/grip';
import { invertMove } from '../cube/transforms';
import type { PlaybackController, PlaybackSnapshot } from '../three/playback';
import type { StepPlan } from '../tutor/types';
import { slotPosition, spotlightPositions, type TwinPosition } from './mapping';

/** The parts of `CubeEngine` the teaching twin drives. */
export interface TeachingSurface {
  readonly playback: PlaybackController;
  setGrip(grip: Grip | null): void;
  getGrip(): Grip | null;
  setSpotlight(pieces: readonly { position: TwinPosition }[] | null): void;
  setSlotOutline(position: TwinPosition | null): void;
  setGhostState(state: CubeState | null): void;
  setMoveArrow(move: Move | null): void;
}

export interface TeachingTwinOptions {
  /** Called each time the step's last move finishes playing forward. */
  onStepPlayed?: (plan: StepPlan) => void;
  /** Whether the "after" preview starts shown. */
  showGhost?: boolean;
}

/** Every move the twin plays for a step: regrips and lining-up turns, then the algorithm. */
export function stepMoves(plan: StepPlan): Move[] {
  return [...plan.setupMoves, ...plan.algorithm];
}

/** The move in focus for the arrow: the one turning now (inverted while stepping back), else the next. */
export function focusMove(snapshot: PlaybackSnapshot): Move | null {
  if (snapshot.activeIndex !== null) {
    const move = snapshot.moves[snapshot.activeIndex];
    return snapshot.direction === 'back' ? invertMove(move) : move;
  }
  return snapshot.moves[snapshot.index] ?? null;
}

export class TeachingTwinController {
  private readonly surface: TeachingSurface;
  private onStepPlayed?: (plan: StepPlan) => void;
  private plan: StepPlan | null = null;
  private ghost: boolean;
  /** Bumped by every show(); a transition that lost the race stops quietly. */
  private generation = 0;
  /** True once the current plan is loaded and its aids may follow playback. */
  private live = false;
  private lastIndex = -1;
  /** True while the step's last move is turning forward. */
  private finishing = false;
  private unsubscribe: () => void;
  private disposed = false;

  constructor(surface: TeachingSurface, options: TeachingTwinOptions = {}) {
    this.surface = surface;
    this.onStepPlayed = options.onStepPlayed;
    this.ghost = options.showGhost ?? false;
    this.unsubscribe = surface.playback.subscribe((snapshot) => this.follow(snapshot));
  }

  public setOnStepPlayed(callback: ((plan: StepPlan) => void) | undefined): void {
    this.onStepPlayed = callback;
  }

  public getPlan(): StepPlan | null {
    return this.plan;
  }

  /**
   * Shows a step on the twin. The previous step stops cleanly: playback pauses, the turn in
   * flight finishes and anything queued for the old step is dropped (`load`) before the new
   * start state is shown. Resolves once the new step is ready to play. Null clears the twin's
   * aids and leaves it showing whatever it shows.
   */
  public async show(plan: StepPlan | null): Promise<void> {
    if (this.disposed) return;
    const gen = ++this.generation;
    const { playback } = this.surface;
    this.live = false;
    this.plan = plan;
    playback.pause();

    if (!plan) {
      this.clearAids();
      playback.load(playback.getSnapshot().state, []);
      await playback.whenIdle();
      return;
    }

    playback.load(plan.startState, stepMoves(plan));
    // Drains the queue: the old turn in flight lands and the start state is painted.
    await playback.whenIdle();
    if (gen !== this.generation || this.disposed) return;

    // The grip is resolved against the state the twin now shows.
    this.surface.setGrip(plan.grip);
    this.surface.setGhostState(this.ghost ? plan.expectedState : null);
    this.live = true;
    this.lastIndex = -1;
    this.finishing = false;
    this.follow(playback.getSnapshot());
  }

  /** Shows or hides the faded "after" preview of the step's expected state. */
  public setGhostVisible(visible: boolean): void {
    this.ghost = visible;
    if (this.live && this.plan) this.surface.setGhostState(visible ? this.plan.expectedState : null);
  }

  public isGhostVisible(): boolean {
    return this.ghost;
  }

  /** Stops following playback and clears the aids. The engine itself is not disposed. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.unsubscribe();
    this.surface.playback.pause();
    this.clearAids();
  }

  private clearAids(): void {
    this.surface.setSpotlight(null);
    this.surface.setSlotOutline(null);
    this.surface.setGhostState(null);
    this.surface.setMoveArrow(null);
  }

  /** Keeps the aids on the pieces as they move and the grip in step with regrips. */
  private follow(snapshot: PlaybackSnapshot): void {
    const plan = this.plan;
    if (!this.live || !plan || this.disposed) return;
    this.surface.setMoveArrow(focusMove(snapshot));
    if (snapshot.activeIndex !== null) {
      this.finishing = snapshot.direction === 'forward' && snapshot.activeIndex === snapshot.total - 1;
      return;
    }
    // Played (not seeked) to the end: the last move just finished turning forward.
    const played = this.finishing && snapshot.index === snapshot.total;
    this.finishing = false;
    if (snapshot.index === this.lastIndex) return;
    this.lastIndex = snapshot.index;

    const state = snapshot.state;
    // After a regrip the cube is held differently; the twin's view follows its centers.
    const held = gripOf(state);
    const current = this.surface.getGrip();
    if (!current || current.top !== held.top || current.front !== held.front) this.surface.setGrip(held);
    this.surface.setSpotlight(spotlightPositions(state, plan.highlightPieces));
    this.surface.setSlotOutline(plan.targetSlot ? slotPosition(state, plan.targetSlot) : null);

    if (played) this.onStepPlayed?.(plan);
  }
}
