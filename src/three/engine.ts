/**
 * Cubyntra - Three.js Digital Twin Engine & Layer Animator
 * Necookie Labs (c) 2026
 *
 * Implements:
 * - 27 voxel cubies with flat Lambert colors from the design tokens (ADR-011)
 * - A fixed light rig that gives each face direction its own flat tone
 * - Subtle floating idle animation (off under reduced motion)
 * - Drift-free face, wide, slice and whole-cube turns with integer matrix snapping
 * - Dynamic 3D move arrows
 * - Camera controls & reset
 * - Complete memory/geometry disposal
 */

import * as THREE from 'three';
import { CubeMove, CubeState } from '../cube/types';
import { moveLayers } from '../cube/transforms';
import type { Layer } from '../cube/geometry';
import { CubieMesh, VoxelKit } from './cubie';
import { MoveArrow } from './arrows';
import { PlaybackController } from './playback';
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

// Exponential damping rate for orbit/zoom, chosen to match the original fixed
// 0.12-per-frame smoothing at 60 Hz while behaving identically at any refresh rate.
const ORBIT_DAMPING_PER_S = -60 * Math.log(1 - 0.12);

/**
 * Radius of the sphere around a 3x3x3 cube of unit cubies (1.5 * sqrt 3). Every tile lies
 * inside it in any orientation, including mid-turn, so fitting it in view never clips.
 */
const CUBE_BOUNDING_RADIUS = 1.5 * Math.sqrt(3);

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

const FACE_DIRECTION = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
} as const;

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
  // Teaching aids: lit positions (null = all lit) and the target-slot outline.
  private spotlight: ReadonlySet<string> | null = null;
  private slotOutline: SlotOutline;

  private timer = new THREE.Timer();
  private elapsedS = 0;
  private prefersReducedMotion = false;
  private isDisposed = false;
  private animationFrameId: number | null = null;

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

    // 7. Algorithm playback, driving this engine's turn queue
    this.playback = new PlaybackController(this);

    // 8. Event Listeners
    this.attachEventListeners();

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
    for (const cubie of this.cubies) {
      const pos = cubie.group.position;
      const x = Math.round(pos.x);
      const y = Math.round(pos.y);
      const z = Math.round(pos.z);

      // Tiles are painted by the direction they face now, since turns rotate cubies.
      // U Face (+Y, y = 1)
      if (y === 1) {
        const col = x + 1;
        const row = z + 1;
        cubie.setColorFacing(FACE_DIRECTION.U, state.U[row * 3 + col]);
      }
      // D Face (-Y, y = -1)
      if (y === -1) {
        const col = x + 1;
        const row = 1 - z;
        cubie.setColorFacing(FACE_DIRECTION.D, state.D[row * 3 + col]);
      }
      // F Face (+Z, z = 1)
      if (z === 1) {
        const col = x + 1;
        const row = 1 - y;
        cubie.setColorFacing(FACE_DIRECTION.F, state.F[row * 3 + col]);
      }
      // B Face (-Z, z = -1)
      if (z === -1) {
        const col = 1 - x;
        const row = 1 - y;
        cubie.setColorFacing(FACE_DIRECTION.B, state.B[row * 3 + col]);
      }
      // R Face (+X, x = 1)
      if (x === 1) {
        const col = 1 - z;
        const row = 1 - y;
        cubie.setColorFacing(FACE_DIRECTION.R, state.R[row * 3 + col]);
      }
      // L Face (-X, x = -1)
      if (x === -1) {
        const col = z + 1;
        const row = 1 - y;
        cubie.setColorFacing(FACE_DIRECTION.L, state.L[row * 3 + col]);
      }
    }
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
      durationMs: quarterTurns === 2 ? next.durationMs * 1.5 : next.durationMs,
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
    return CUBE_BOUNDING_RADIUS / Math.sin(Math.min(halfV, halfH));
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

  private renderLoop(timestamp?: number): void {
    if (this.isDisposed) return;

    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), MAX_FRAME_DELTA_S);
    this.elapsedS += dt;

    this.advanceTween(dt * 1000);

    // Smooth damping for orbit and zoom, independent of display refresh rate
    const k = 1 - Math.exp(-ORBIT_DAMPING_PER_S * dt);
    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * k;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * k;
    this.currentDistance += (this.targetDistance - this.currentDistance) * k;

    this.rootCubeGroup.rotation.copy(this.currentRotation);

    // Subtle floating bob
    if (!this.prefersReducedMotion) {
      this.rootCubeGroup.position.y = Math.sin(this.elapsedS * 1.2) * 0.06;
    }

    this.camera.position.set(0, 0, this.currentDistance);
    this.camera.lookAt(0, 0, 0);

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
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

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
    this.cubies.forEach((c) => c.dispose());
    this.cubies = [];
    this.kit.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
