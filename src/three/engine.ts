/**
 * Cubyntra - Three.js Digital Twin Engine & Layer Animator
 * Necookie Labs (c) 2026
 *
 * Implements:
 * - 27 voxel cubies with flat Lambert colors from the design tokens (ADR-011)
 * - A fixed light rig that gives each face direction its own flat tone
 * - Subtle floating idle animation (off under reduced motion, which also shortens turns)
 * - Drift-free face, wide, slice and whole-cube turns with integer matrix snapping
 * - Dynamic 3D move arrows
 * - Camera controls & reset
 * - Complete memory/geometry disposal
 */

import * as THREE from 'three';
import { CubeMove, CubeState } from '../cube/types';
import { createSolvedCubeState } from '../cube/constants';
import { centerColors } from '../cube/orientation';
import type { Grip } from '../cube/grip';
import { moveLayers } from '../cube/transforms';
import type { Layer } from '../cube/geometry';
import { CubieMesh, paintCubies, VoxelKit } from './cubie';
import { MoveArrow } from './arrows';
import { PlaybackController } from './playback';
import { GripAnimator, gripQuaternion } from './gripCamera';
import { GhostCube } from './ghost';
import { ContextLossGuard } from './contextLoss';
import { isSpotlit, SlotOutline, spotlightKeys, type PiecePosition, type SpotlightPiece } from './spotlight';
import { TWIN_THEME_HEX, type ThemeName } from '../lib/tokens';

interface QueuedMove {
  move: CubeMove;
  targetState: CubeState;
  durationMs: number;
  resolve: () => void;
}

interface ActiveTween {
  axis: THREE.Vector3;
  totalAngle: number;
  elapsedMs: number;
  durationMs: number;
  cubies: CubieMesh[];
  targetState: CubeState;
  resolve: () => void;
}

// A backgrounded tab or a long GC pause must not fast-forward a turn in one frame.
const MAX_FRAME_DELTA_S = 0.1;
/** Longest a quarter turn may take under reduced motion: short enough to read as a snap. */
export const REDUCED_MOTION_TURN_MS = 80;

// Exponential damping rate for orbit/zoom, chosen to match the original fixed
// 0.12-per-frame smoothing at 60 Hz while behaving identically at any refresh rate.
const ORBIT_DAMPING_PER_S = -60 * Math.log(1 - 0.12);

/**
 * Radius of the sphere around a 3x3x3 cube of unit cubies (1.5 * sqrt 3). Every tile lies
 * inside it in any orientation, including mid-turn, so fitting it in view never clips.
 */
const CUBE_BOUNDING_RADIUS = 1.5 * Math.sqrt(3);

/** Extra camera distance while the "after" preview is shown, leaving room in the corner. */
const GHOST_ROOM = 1.3;

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];


/** Rounds a direction to the nearest signed coordinate axis. */
function nearestAxis(v: THREE.Vector3): THREE.Vector3 {
  let best = 0;
  if (Math.abs(v.y) > Math.abs(v.getComponent(best))) best = 1;
  if (Math.abs(v.z) > Math.abs(v.getComponent(best))) best = 2;
  return AXES[best].clone().multiplyScalar(Math.sign(v.getComponent(best)) || 1);
}

/**
 * Snaps a rotation to the nearest of the 24 cube orientations by rounding its basis
 * vectors, with the third derived by cross product so the result is always a proper
 * right-handed rotation. Unlike rounding Euler angles per component, this is exact
 * everywhere, including near gimbal lock.
 */
export function snapQuaternionToCubeGroup(q: THREE.Quaternion): THREE.Quaternion {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const bx = new THREE.Vector3();
  const by = new THREE.Vector3();
  const bz = new THREE.Vector3();
  m.extractBasis(bx, by, bz);

  const x = nearestAxis(bx);
  let y = nearestAxis(by);
  // If rounding collapsed both vectors onto one axis, fall back to the next-best axis for y.
  if (Math.abs(x.dot(y)) > 0.5) y = nearestAxis(by.clone().sub(x.clone().multiplyScalar(by.dot(x))));
  const z = new THREE.Vector3().crossVectors(x, y);

  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CubeEngine {
  public container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private cubies: CubieMesh[] = [];
  private rootCubeGroup: THREE.Group;
  private pivotGroup: THREE.Group;
  private moveArrow: MoveArrow;
  /** Plays an algorithm on this twin (see src/three/playback.ts). */
  public readonly playback: PlaybackController;

  // Geometries and materials shared by all 27 cubies (disposed with the engine).
  private kit: VoxelKit;
  private theme: ThemeName = 'light';
  // Color-blind letters on every sticker.
  private stickerLetters = false;
  // Logical state the twin is showing (or will show once queued turns finish).
  private shownState: CubeState = createSolvedCubeState();
  // How the student holds the cube; the cube group is turned to match before the orbit view.
  private grip: Grip | null = null;
  private gripAnimator: GripAnimator;
  private orbitQuaternion = new THREE.Quaternion();
  // Teaching aids: lit positions (null = all lit) and the target-slot outline.
  private spotlight: ReadonlySet<string> | null = null;
  private slotOutline: SlotOutline;
  // Small faded "after" preview in the corner of the view.
  private ghost: GhostCube;

  private timer = new THREE.Timer();
  private elapsedS = 0;
  private prefersReducedMotion = false;
  private isDisposed = false;
  private animationFrameId: number | null = null;
  // Pauses the loop while the WebGL context is gone and rebuilds when it returns.
  private contextGuard: ContextLossGuard | null = null;

  // Layer turns are serialized through a queue and advanced by the single render loop.
  private moveQueue: QueuedMove[] = [];
  private activeTween: ActiveTween | null = null;
  // Latest externally requested state, applied once queued turns have drained so
  // stickers never repaint to a post-move state while a layer is still turning.
  private pendingSync: CubeState | null = null;

  // Interaction & camera rotation state
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  private targetRotation = new THREE.Euler(0.45, -0.65, 0, 'YXZ');
  private currentRotation = new THREE.Euler(0.45, -0.65, 0, 'YXZ');
  private targetDistance = 6.2;
  private currentDistance = 6.2;
  // Until the user scroll-zooms, the camera distance tracks the container's shape.
  private userZoomed = false;



  constructor(container: HTMLElement) {
    this.container = container;

    if (typeof window !== 'undefined' && window.matchMedia) {
      this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    this.gripAnimator = new GripAnimator(this.prefersReducedMotion);

    // 1. Scene & Root Groups
    this.scene = new THREE.Scene();
    this.rootCubeGroup = new THREE.Group();
    this.pivotGroup = new THREE.Group();
    this.scene.add(this.rootCubeGroup);
    // The pivot lives inside the cube group so a turning layer shares the cube's
    // orbit rotation and idle bob. Parented to the scene, the layer would detach
    // mid-turn and rotate about a world axis instead of the cube's own axis.
    this.rootCubeGroup.add(this.pivotGroup);

    // 2. Camera
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.currentDistance = this.targetDistance = this.fitDistance();
    this.camera.position.set(0, 0, this.currentDistance);
    this.camera.lookAt(0, 0, 0);

    // 3. Renderer: no shadows and no tone mapping, so token colors reach the screen unchanged.
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(this.renderer.domElement);

    // 4. Fixed light rig
    this.setupLighting();

    // 5. Build 27 voxel cubies
    this.kit = new VoxelKit();
    this.buildCubies();

    // 6. Directional Move Arrow and target-slot outline
    this.moveArrow = new MoveArrow();
    this.rootCubeGroup.add(this.moveArrow.group);
    this.slotOutline = new SlotOutline(TWIN_THEME_HEX[this.theme].focus);
    this.rootCubeGroup.add(this.slotOutline.group);
    this.ghost = new GhostCube();
    this.scene.add(this.ghost.group);

    // 7. Algorithm playback, driving this engine's turn queue
    this.playback = new PlaybackController(this);

    // 8. Event Listeners
    this.attachEventListeners();
    this.contextGuard = new ContextLossGuard(this.renderer.domElement, {
      onLost: () => this.handleContextLost(),
      onRestored: () => this.handleContextRestored(),
    });

    // 9. Start Render Loop. The timer is deliberately not connected to the Page Visibility
    // API: it would report zero elapsed time whenever document.hidden is true, which freezes
    // queued turns in contexts that keep rendering while hidden. Clamping each frame's delta
    // (MAX_FRAME_DELTA_S) already stops a returning tab from fast-forwarding a turn.
    this.renderLoop = this.renderLoop.bind(this);
    this.renderLoop();
  }

  /**
   * Flat-tone light rig. Lambert materials have no specular term, and a box face is planar, so
   * a directional light gives every face one uniform tone set by the angle it makes with the
   * light. The light rides on the camera (the camera never orbits; the cube group does), so
   * tones stay put on screen: faces pointing up read lightest, faces toward the viewer a step
   * darker, side faces darker again. Intensities are in units of pi because Lambert divides by
   * pi: ambient + key on a face facing the light is about 1.0, the token color itself.
   */
  private setupLighting(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.62));
    const key = new THREE.DirectionalLight(0xffffff, Math.PI * 0.45);
    key.position.set(0.35, 1, 0.6);
    key.target.position.set(0, 0, 0);
    this.camera.add(key);
    this.camera.add(key.target);
    this.scene.add(this.camera);
  }

  private buildCubies(): void {
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const cubie = new CubieMesh(
            { x: x as -1 | 0 | 1, y: y as -1 | 0 | 1, z: z as -1 | 0 | 1 },
            this.kit
          );
          this.cubies.push(cubie);
          this.rootCubeGroup.add(cubie.group);
        }
      }
    }
  }

  /**
   * Synchronizes visual sticker colors with a logical CubeState.
   */
  public syncWithCubeState(state: CubeState): void {
    this.shownState = state;
    paintCubies(this.cubies, state);
  }

  /**
   * Repaints to the given state now, or after in-flight turns finish if any are queued.
   */
  public requestSync(state: CubeState): void {
    if (this.isBusy()) {
      this.pendingSync = state;
    } else {
      this.pendingSync = null;
      this.syncWithCubeState(state);
    }
  }

  /**
   * Matches the twin's guidance colors to the page theme. Sticker colors are the same in both
   * themes; the arrows use the theme's ink so they contrast with the page behind them.
   */
  public setTheme(theme: ThemeName): void {
    this.theme = theme;
    this.moveArrow.setColor(TWIN_THEME_HEX[theme].ink);
    this.slotOutline.setColor(TWIN_THEME_HEX[theme].focus);
  }

  /**
   * Draws a letter (W Y R O B G) on every sticker, or removes them. Letters follow repaints
   * and turns, so they always name the sticker's current color.
   */
  /**
   * Reduced motion (the OS setting or the student's own): no idle bob, instant regrips and
   * turns cut to REDUCED_MOTION_TURN_MS. The twin follows changes while it is on screen.
   */
  public setReducedMotion(reduced: boolean): void {
    this.prefersReducedMotion = reduced;
    this.gripAnimator.setReducedMotion(reduced);
    if (reduced) this.rootCubeGroup.position.y = 0;
  }

  public isMotionReduced(): boolean {
    return this.prefersReducedMotion;
  }

  public setStickerLetters(visible: boolean): void {
    this.stickerLetters = visible;
    for (const cubie of this.cubies) cubie.setLettersVisible(visible);
  }

  public hasStickerLetters(): boolean {
    return this.stickerLetters;
  }

  /**
   * Turns the twin so it is seen the way the student holds the cube: `grip.top` color up,
   * `grip.front` color toward the viewer, then the usual three-quarter view so U, F and R are
   * visible. Changing the grip animates the regrip (instant under reduced motion). The grip is
   * resolved against the state the twin is showing, or will show once queued turns finish.
   * Null returns to the plain view.
   */
  public setGrip(grip: Grip | null): void {
    this.grip = grip;
    this.gripAnimator.setTarget(grip ? gripQuaternion(centerColors(this.latestState()), grip) : new THREE.Quaternion());
  }

  public getGrip(): Grip | null {
    return this.grip;
  }

  /** The state after every queued turn and pending repaint. */
  private latestState(): CubeState {
    if (this.moveQueue.length > 0) return this.moveQueue[this.moveQueue.length - 1].targetState;
    if (this.pendingSync) return this.pendingSync;
    if (this.activeTween) return this.activeTween.targetState;
    return this.shownState;
  }

  /**
   * Shows a small faded preview of `state` (what the twin should look like after the current
   * step) in the top-right corner, or hides it for null. While it is shown the twin's fitted
   * distance grows a little so the two do not overlap.
   */
  public setGhostState(state: CubeState | null): void {
    this.ghost.setState(state);
    if (!this.userZoomed) this.targetDistance = this.fitDistance();
  }

  /**
   * Keeps the cubies at `pieces` at full color and fades every other cubie to 35% opacity (flat,
   * no glow). Positions are in the twin's logical frame (x: L -1 .. R 1, y: D -1 .. U 1,
   * z: B -1 .. F 1) and are re-applied after every turn. Null turns the spotlight off.
   */
  public setSpotlight(pieces: readonly SpotlightPiece[] | null): void {
    this.spotlight = spotlightKeys(pieces);
    this.applySpotlight();
  }

  /** Draws a flat outline box around one cubie position (e.g. the target F2L slot), or hides it. */
  public setSlotOutline(position: PiecePosition | null): void {
    this.slotOutline.setPosition(position);
  }

  private applySpotlight(): void {
    for (const cubie of this.cubies) {
      const p = cubie.group.position;
      cubie.setFaded(!isSpotlit([Math.round(p.x), Math.round(p.y), Math.round(p.z)], this.spotlight));
    }
  }

  /**
   * Sets or updates directional move guidance arrow.
   */
  public setMoveArrow(move: CubeMove | null): void {
    this.moveArrow.updateMove(move);
  }

  /**
   * Queues a layer turn. Resolves once this specific move has finished and been
   * snapped. Moves are never dropped: calls made while a turn is in flight wait
   * their turn instead of being ignored.
   */
  public animateMove(
    move: CubeMove,
    targetState: CubeState,
    durationMs = 280
  ): Promise<void> {
    if (this.isDisposed) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.moveQueue.push({ move, targetState, durationMs, resolve });
    });
  }

  /** True while a turn is animating or waiting in the queue. */
  public isBusy(): boolean {
    return this.activeTween !== null || this.moveQueue.length > 0;
  }

  private beginNextMove(): void {
    const next = this.moveQueue.shift();
    if (!next) return;

    // Face turns, wide turns, slices and whole-cube rotations all reduce to "these layers along
    // this axis, by this many quarter turns" (see moveLayers in src/cube/transforms).
    const { quarterTurns } = next.move;
    const quarterMs = this.prefersReducedMotion ? Math.min(next.durationMs, REDUCED_MOTION_TURN_MS) : next.durationMs;
    const spec = moveLayers(next.move);
    const component = spec.axis === 'x' ? 0 : spec.axis === 'y' ? 1 : 2;
    const cubies = this.cubies.filter((c) =>
      spec.layers.includes(Math.round(c.group.position.getComponent(component)) as Layer)
    );

    // Pivot shares the cube group's frame, so an identity pivot makes attach() lossless.
    this.pivotGroup.quaternion.identity();
    this.pivotGroup.position.set(0, 0, 0);
    this.pivotGroup.updateMatrixWorld(true);
    for (const cubie of cubies) {
      this.pivotGroup.attach(cubie.group);
    }

    // Positive quarters turn counter-clockwise about +axis (right-hand rule).
    const axis = AXES[component].clone();
    const totalAngle = spec.quarters * (Math.PI / 2);

    this.activeTween = {
      axis,
      totalAngle,
      elapsedMs: 0,
      // Half turns travel twice as far; give them proportionally more time.
      durationMs: quarterTurns === 2 ? quarterMs * 1.5 : quarterMs,
      cubies,
      targetState: next.targetState,
      resolve: next.resolve,
    };
  }

  private advanceTween(dtMs: number): void {
    if (!this.activeTween) this.beginNextMove();
    const tween = this.activeTween;
    if (!tween) return;

    tween.elapsedMs += dtMs;
    const progress = Math.min(1, tween.elapsedMs / tween.durationMs);
    this.pivotGroup.setRotationFromAxisAngle(tween.axis, tween.totalAngle * easeInOutCubic(progress));

    if (progress >= 1) this.finishTween(tween);
  }

  private finishTween(tween: ActiveTween): void {
    this.pivotGroup.setRotationFromAxisAngle(tween.axis, tween.totalAngle);
    this.pivotGroup.updateMatrixWorld(true);

    for (const cubie of tween.cubies) {
      this.rootCubeGroup.attach(cubie.group);
      this.snapCubieToGrid(cubie);
    }

    this.pivotGroup.quaternion.identity();
    this.activeTween = null;
    // Cubies changed position: the spotlight marks positions, so re-evaluate it.
    if (this.spotlight) this.applySpotlight();

    // Resynchronize exact sticker colors with the logical state (zero drift).
    this.syncWithCubeState(tween.targetState);
    if (this.moveQueue.length === 0 && this.pendingSync) {
      this.syncWithCubeState(this.pendingSync);
      this.pendingSync = null;
    }
    tween.resolve();
  }

  private snapCubieToGrid(cubie: CubieMesh): void {
    const g = cubie.group;
    g.position.set(Math.round(g.position.x), Math.round(g.position.y), Math.round(g.position.z));

    g.quaternion.copy(snapQuaternionToCubeGroup(g.quaternion));
    g.updateMatrix();
  }

  /**
   * Smoothly restores camera to canonical viewing angle.
   */
  public resetCamera(): void {
    this.targetRotation.set(0.45, -0.65, 0);
    this.userZoomed = false;
    this.targetDistance = this.fitDistance();
  }

  /**
   * Camera distance at which the whole cube fits the view. Three.js fixes the vertical
   * field of view, so in a container taller than it is wide the horizontal angle is the
   * tighter one; a fixed distance would push the cube past the sides.
   */
  private fitDistance(): number {
    const halfV = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
    const fit = CUBE_BOUNDING_RADIUS / Math.sin(Math.min(halfV, halfH));
    // Step back a little while the "after" preview shares the view.
    return this.ghost?.group.visible ? fit * GHOST_ROOM : fit;
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.previousMousePosition = { x: e.clientX, y: e.clientY };
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    const deltaX = e.clientX - this.previousMousePosition.x;
    const deltaY = e.clientY - this.previousMousePosition.y;

    this.targetRotation.y += deltaX * 0.008;
    this.targetRotation.x = Math.max(
      -Math.PI / 2.2,
      Math.min(Math.PI / 2.2, this.targetRotation.x + deltaY * 0.008)
    );

    this.previousMousePosition = { x: e.clientX, y: e.clientY };
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.userZoomed = true;
    this.targetDistance = Math.max(
      3.8,
      Math.min(Math.max(9.5, this.fitDistance() * 1.4), this.targetDistance + e.deltaY * 0.005)
    );
  };

  private touchStartX = 0;
  private touchStartY = 0;

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 1) {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (e.touches.length === 1) {
      const deltaX = e.touches[0].clientX - this.touchStartX;
      const deltaY = e.touches[0].clientY - this.touchStartY;

      this.targetRotation.y += deltaX * 0.01;
      this.targetRotation.x = Math.max(
        -Math.PI / 2.2,
        Math.min(Math.PI / 2.2, this.targetRotation.x + deltaY * 0.01)
      );

      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
    }
  };

  private onWindowResize = (): void => {
    this.resize();
  };

  private attachEventListeners(): void {
    const el = this.renderer.domElement;
    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('touchstart', this.onTouchStart, { passive: true });
    el.addEventListener('touchmove', this.onTouchMove, { passive: true });
    window.addEventListener('resize', this.onWindowResize);
  }

  /**
   * The GPU context is gone: stop rendering, and finish every queued turn at once (snapped,
   * with its logical target state) so nobody awaiting a turn waits for a context that may never
   * return.
   */
  private handleContextLost(): void {
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    if (this.activeTween) this.finishTween(this.activeTween);
    while (this.moveQueue.length > 0) {
      this.beginNextMove();
      if (this.activeTween) this.finishTween(this.activeTween);
    }
  }

  /**
   * The context is back. WebGLRenderer re-creates its own GL state; every material is marked for
   * recompilation so geometry and programs are uploaded again, then the twin is repainted from
   * the logical state and the loop restarts.
   */
  private handleContextRestored(): void {
    if (this.isDisposed) return;
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) m.needsUpdate = true;
      }
    });
    this.kit.invalidate();
    this.ghost.invalidate();
    this.syncWithCubeState(this.pendingSync ?? this.shownState);
    this.pendingSync = null;
    this.applySpotlight();
    this.resize();
    if (this.animationFrameId === null) this.renderLoop();
  }

  private renderLoop(timestamp?: number): void {
    if (this.isDisposed || this.contextGuard?.isLost()) return;

    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), MAX_FRAME_DELTA_S);
    this.elapsedS += dt;

    this.advanceTween(dt * 1000);

    // Smooth damping for orbit and zoom, independent of display refresh rate
    const k = 1 - Math.exp(-ORBIT_DAMPING_PER_S * dt);
    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * k;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * k;
    this.currentDistance += (this.targetDistance - this.currentDistance) * k;

    // Grip first (top color up, front color forward), then the orbit / three-quarter view.
    this.gripAnimator.update(dt);
    this.orbitQuaternion.setFromEuler(this.currentRotation);
    this.rootCubeGroup.quaternion.multiplyQuaternions(this.orbitQuaternion, this.gripAnimator.current);

    // Subtle floating bob
    if (!this.prefersReducedMotion) {
      this.rootCubeGroup.position.y = Math.sin(this.elapsedS * 1.2) * 0.06;
    }

    this.camera.position.set(0, 0, this.currentDistance);
    this.camera.lookAt(0, 0, 0);

    if (this.ghost.group.visible) {
      // Same orientation as the twin, parked in the corner of the visible area at its depth.
      this.ghost.group.quaternion.copy(this.rootCubeGroup.quaternion);
      const halfHeight = this.currentDistance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      this.ghost.placeInCorner(halfHeight * this.camera.aspect, halfHeight);
    }

    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  }

  public resize(): void {
    if (this.isDisposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width && height) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      if (!this.userZoomed) this.targetDistance = this.fitDistance();
      // Moving the window to a monitor with a different DPI changes devicePixelRatio.
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(width, height);
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    this.playback.dispose();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.contextGuard?.dispose();

    // Never leave a caller awaiting a turn that will not render.
    this.activeTween?.resolve();
    this.activeTween = null;
    for (const queued of this.moveQueue) queued.resolve();
    this.moveQueue = [];
    this.timer.dispose();

    // Detach events
    const el = this.renderer.domElement;
    if (el) {
      el.removeEventListener('mousedown', this.onMouseDown);
      el.removeEventListener('wheel', this.onWheel);
      el.removeEventListener('touchstart', this.onTouchStart);
      el.removeEventListener('touchmove', this.onTouchMove);
    }
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('resize', this.onWindowResize);

    this.moveArrow.dispose();
    this.slotOutline.dispose();
    this.ghost.dispose();
    this.cubies.forEach((c) => c.dispose());
    this.cubies = [];
    this.kit.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
