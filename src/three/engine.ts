/**
 * Cubyntra - Three.js Digital Twin Engine & Layer Animator
 * Necookie Labs (c) 2026
 *
 * Implements:
 * - 27-cubie speedcube construction with PBR physical materials
 * - Studio environment reflection mapping via PMREMGenerator
 * - Soft contact radial shadow projection
 * - Subtle organic floating idle animation
 * - Drift-free layer rotations with integer matrix snapping
 * - Dynamic 3D move arrows
 * - Camera controls & reset
 * - Complete memory/geometry disposal
 */

import * as THREE from 'three';
import { CubeMove, CubeState } from '../cube/types';
import { CubieMesh } from './cubie';
import { MoveArrow } from './arrows';

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

  // Studio environment and contact shadow
  private pmremGenerator: THREE.PMREMGenerator | null = null;
  private envTexture: THREE.Texture | null = null;
  private shadowMesh: THREE.Mesh | null = null;
  private shadowGeometry: THREE.PlaneGeometry | null = null;
  private shadowMaterial: THREE.MeshBasicMaterial | null = null;
  private shadowTexture: THREE.CanvasTexture | null = null;

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
    this.camera.position.set(0, 0, this.currentDistance);
    this.camera.lookAt(0, 0, 0);

    // 3. WebGL Renderer with High-End Color Science
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // 4. Studio Environment & Reflections
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.setupEnvironment();

    // 5. Lighting
    this.setupLighting();

    // 6. Contact Shadow
    this.setupShadowPlane();

    // 7. Build 27 Speedcube Cubies
    this.buildCubies();

    // 8. Directional Move Arrow
    this.moveArrow = new MoveArrow();
    this.rootCubeGroup.add(this.moveArrow.group);

    // 9. Event Listeners
    this.attachEventListeners();

    // 10. Start Render Loop. The timer is deliberately not connected to the Page Visibility
    // API: it would report zero elapsed time whenever document.hidden is true, which freezes
    // queued turns in contexts that keep rendering while hidden. Clamping each frame's delta
    // (MAX_FRAME_DELTA_S) already stops a returning tab from fast-forwarding a turn.
    this.renderLoop = this.renderLoop.bind(this);
    this.renderLoop();
  }

  private setupEnvironment(): void {
    if (!this.pmremGenerator) return;

    try {
      const envScene = new THREE.Scene();
      const room = new THREE.Mesh(
        new THREE.BoxGeometry(20, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0x3a3f4c, side: THREE.BackSide })
      );
      envScene.add(room);

      const addPanel = (w: number, h: number, x: number, y: number, z: number, intensity: number) => {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(intensity, intensity, intensity),
            side: THREE.DoubleSide,
          })
        );
        m.position.set(x, y, z);
        m.lookAt(0, 0, 0);
        envScene.add(m);
      };

      addPanel(8, 4, 0, 9, 2, 5.0); // Big overhead softbox
      addPanel(3, 6, -9, 2, 4, 3.0); // Left strip
      addPanel(3, 6, 9, 1, -3, 2.2); // Right strip
      addPanel(6, 2, 0, -2, 9, 1.2); // Front fill

      const renderTarget = this.pmremGenerator.fromScene(envScene, 0.04);
      this.envTexture = renderTarget.texture;
      this.scene.environment = this.envTexture;

      envScene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        }
      });
    } catch {
      // Graceful fallback if WebGL environment generation fails
    }
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x445066, 0.4);
    this.scene.add(hemiLight);

    const mainKeyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainKeyLight.position.set(5, 8, 6);
    mainKeyLight.castShadow = true;
    mainKeyLight.shadow.mapSize.width = 1024;
    mainKeyLight.shadow.mapSize.height = 1024;
    this.scene.add(mainKeyLight);

    const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.5);
    fillLight.position.set(-6, -3, -6);
    this.scene.add(fillLight);
  }

  private setupShadowPlane(): void {
    if (typeof document === 'undefined') return;

    try {
      const sc = document.createElement('canvas');
      sc.width = 256;
      sc.height = 256;
      const sctx = sc.getContext('2d');
      if (sctx) {
        const grd = sctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        grd.addColorStop(0, 'rgba(0,0,0,0.60)');
        grd.addColorStop(0.45, 'rgba(0,0,0,0.22)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        sctx.fillStyle = grd;
        sctx.fillRect(0, 0, 256, 256);
      }
      this.shadowTexture = new THREE.CanvasTexture(sc);
      this.shadowGeometry = new THREE.PlaneGeometry(6.5, 6.5);
      this.shadowMaterial = new THREE.MeshBasicMaterial({
        map: this.shadowTexture,
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
      });
      this.shadowMesh = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
      this.shadowMesh.rotation.x = -Math.PI / 2;
      this.shadowMesh.position.y = -2.35;
      this.scene.add(this.shadowMesh);
    } catch {
      // Non-critical visual embellishment
    }
  }

  private buildCubies(): void {
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const cubie = new CubieMesh({
            x: x as -1 | 0 | 1,
            y: y as -1 | 0 | 1,
            z: z as -1 | 0 | 1,
            size: 0.985,
            spacing: 1.0,
          });
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

      // U Face (+Y, y = 1)
      if (y === 1) {
        const col = x + 1;
        const row = z + 1;
        const index = row * 3 + col;
        cubie.setStickerColor('U', state.U[index]);
      }
      // D Face (-Y, y = -1)
      if (y === -1) {
        const col = x + 1;
        const row = 1 - z;
        const index = row * 3 + col;
        cubie.setStickerColor('D', state.D[index]);
      }
      // F Face (+Z, z = 1)
      if (z === 1) {
        const col = x + 1;
        const row = 1 - y;
        const index = row * 3 + col;
        cubie.setStickerColor('F', state.F[index]);
      }
      // B Face (-Z, z = -1)
      if (z === -1) {
        const col = 1 - x;
        const row = 1 - y;
        const index = row * 3 + col;
        cubie.setStickerColor('B', state.B[index]);
      }
      // R Face (+X, x = 1)
      if (x === 1) {
        const col = 1 - z;
        const row = 1 - y;
        const index = row * 3 + col;
        cubie.setStickerColor('R', state.R[index]);
      }
      // L Face (-X, x = -1)
      if (x === -1) {
        const col = z + 1;
        const row = 1 - y;
        const index = row * 3 + col;
        cubie.setStickerColor('L', state.L[index]);
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

    const { face, quarterTurns } = next.move;
    const cubies = this.cubies.filter((c) => {
      const pos = c.group.position;
      switch (face) {
        case 'U': return Math.round(pos.y) === 1;
        case 'D': return Math.round(pos.y) === -1;
        case 'R': return Math.round(pos.x) === 1;
        case 'L': return Math.round(pos.x) === -1;
        case 'F': return Math.round(pos.z) === 1;
        case 'B': return Math.round(pos.z) === -1;
      }
    });

    // Pivot shares the cube group's frame, so an identity pivot makes attach() lossless.
    this.pivotGroup.quaternion.identity();
    this.pivotGroup.position.set(0, 0, 0);
    this.pivotGroup.updateMatrixWorld(true);
    for (const cubie of cubies) {
      this.pivotGroup.attach(cubie.group);
    }

    // Clockwise as seen looking at the face: negative about +axis faces, positive about -axis faces.
    const axis = new THREE.Vector3();
    let angleSign = 1;
    switch (face) {
      case 'U': axis.set(0, 1, 0); angleSign = -1; break;
      case 'D': axis.set(0, 1, 0); angleSign = 1; break;
      case 'R': axis.set(1, 0, 0); angleSign = -1; break;
      case 'L': axis.set(1, 0, 0); angleSign = 1; break;
      case 'F': axis.set(0, 0, 1); angleSign = -1; break;
      case 'B': axis.set(0, 0, 1); angleSign = 1; break;
    }

    let turnAngle = Math.PI / 2;
    if (quarterTurns === -1) turnAngle = -(Math.PI / 2);
    if (quarterTurns === 2) turnAngle = Math.PI;

    this.activeTween = {
      axis,
      totalAngle: turnAngle * angleSign,
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
    this.targetDistance = 6.2;
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
    this.targetDistance = Math.max(
      3.8,
      Math.min(9.5, this.targetDistance + e.deltaY * 0.005)
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

    // Subtle physical floating bob and breathing shadow
    if (!this.prefersReducedMotion) {
      const t = this.elapsedS;
      const bob = Math.sin(t * 1.2) * 0.06;
      this.rootCubeGroup.position.y = bob;
      if (this.shadowMaterial && this.shadowMesh) {
        this.shadowMaterial.opacity = 0.85 - bob * 1.8;
        this.shadowMesh.scale.setScalar(1 - bob * 0.5);
      }
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
      // Moving the window to a monitor with a different DPI changes devicePixelRatio.
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(width, height);
    }
  }

  public dispose(): void {
    this.isDisposed = true;
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

    // Clean up shadow resources
    if (this.shadowTexture) this.shadowTexture.dispose();
    if (this.shadowGeometry) this.shadowGeometry.dispose();
    if (this.shadowMaterial) this.shadowMaterial.dispose();

    // Clean up environment resources
    if (this.envTexture) this.envTexture.dispose();
    if (this.pmremGenerator) this.pmremGenerator.dispose();

    this.moveArrow.dispose();
    this.cubies.forEach((c) => c.dispose());

    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
