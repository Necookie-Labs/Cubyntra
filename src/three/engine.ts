/**
 * Cubyntra - Three.js Digital Twin Engine & Layer Animator
 * Necookie Labs (c) 2026
 *
 * Implements:
 * - 27-cubie construction
 * - Drift-free layer rotations with integer matrix snapping
 * - Dynamic 3D move arrows
 * - Camera controls & reset
 * - Complete memory/geometry disposal
 */

import * as THREE from 'three';
import { CubeMove, CubeState } from '../cube/types';
import { CubieMesh } from './cubie';
import { MoveArrow } from './arrows';

export class CubeEngine {
  public container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private cubies: CubieMesh[] = [];
  private rootCubeGroup: THREE.Group;
  private pivotGroup: THREE.Group;
  private moveArrow: MoveArrow;

  private isDisposed = false;
  private animationFrameId: number | null = null;
  private isAnimating = false;

  // Interaction & camera rotation state
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  private targetRotation = new THREE.Euler(0.45, -0.65, 0, 'YXZ');
  private currentRotation = new THREE.Euler(0.45, -0.65, 0, 'YXZ');
  private targetDistance = 6.2;
  private currentDistance = 6.2;

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Scene & Root Groups
    this.scene = new THREE.Scene();
    this.rootCubeGroup = new THREE.Group();
    this.pivotGroup = new THREE.Group();
    this.scene.add(this.rootCubeGroup);
    this.scene.add(this.pivotGroup);

    // 2. Camera
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(0, 0, this.currentDistance);
    this.camera.lookAt(0, 0, 0);

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // 4. Lighting
    this.setupLighting();

    // 5. Build 27 Cubies
    this.buildCubies();

    // 6. Directional Move Arrow
    this.moveArrow = new MoveArrow();
    this.rootCubeGroup.add(this.moveArrow.group);

    // 7. Event Listeners
    this.attachEventListeners();

    // 8. Start Render Loop
    this.renderLoop = this.renderLoop.bind(this);
    this.renderLoop();
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const mainKeyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    mainKeyLight.position.set(6, 8, 7);
    mainKeyLight.castShadow = true;
    mainKeyLight.shadow.mapSize.width = 1024;
    mainKeyLight.shadow.mapSize.height = 1024;
    this.scene.add(mainKeyLight);

    const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.7);
    fillLight.position.set(-6, -4, -6);
    this.scene.add(fillLight);
  }

  private buildCubies(): void {
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const cubie = new CubieMesh({
            x: x as -1 | 0 | 1,
            y: y as -1 | 0 | 1,
            z: z as -1 | 0 | 1,
            size: 0.96,
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
    // Coordinate mapping to logical stickers
    for (const cubie of this.cubies) {
      const pos = cubie.group.position;
      const x = Math.round(pos.x);
      const y = Math.round(pos.y);
      const z = Math.round(pos.z);

      // U Face (+Y, y = 1)
      if (y === 1) {
        // Col: x (-1 -> 0, 0 -> 1, 1 -> 2)
        // Row: z (-1 -> row 0, 0 -> row 1, 1 -> row 2)
        const col = x + 1;
        const row = z + 1;
        const index = row * 3 + col;
        cubie.setStickerColor('U', state.U[index]);
      }
      // D Face (-Y, y = -1)
      if (y === -1) {
        // Looking at D with F on top:
        // Col: x (-1 -> 0, 0 -> 1, 1 -> 2)
        // Row: z (+1 -> row 0, 0 -> row 1, -1 -> row 2)
        const col = x + 1;
        const row = 1 - z;
        const index = row * 3 + col;
        cubie.setStickerColor('D', state.D[index]);
      }
      // F Face (+Z, z = 1)
      if (z === 1) {
        // Col: x (-1 -> 0, 0 -> 1, 1 -> 2)
        // Row: y (1 -> row 0, 0 -> row 1, -1 -> row 2)
        const col = x + 1;
        const row = 1 - y;
        const index = row * 3 + col;
        cubie.setStickerColor('F', state.F[index]);
      }
      // B Face (-Z, z = -1)
      if (z === -1) {
        // Col: x (+1 -> 0, 0 -> 1, -1 -> 2)
        // Row: y (1 -> row 0, 0 -> row 1, -1 -> row 2)
        const col = 1 - x;
        const row = 1 - y;
        const index = row * 3 + col;
        cubie.setStickerColor('B', state.B[index]);
      }
      // R Face (+X, x = 1)
      if (x === 1) {
        // Col: z (+1 -> 0, 0 -> 1, -1 -> 2)
        // Row: y (1 -> row 0, 0 -> row 1, -1 -> row 2)
        const col = 1 - z;
        const row = 1 - y;
        const index = row * 3 + col;
        cubie.setStickerColor('R', state.R[index]);
      }
      // L Face (-X, x = -1)
      if (x === -1) {
        // Col: z (-1 -> 0, 0 -> 1, +1 -> 2)
        // Row: y (1 -> row 0, 0 -> row 1, -1 -> row 2)
        const col = z + 1;
        const row = 1 - y;
        const index = row * 3 + col;
        cubie.setStickerColor('L', state.L[index]);
      }
    }
  }

  /**
   * Sets or updates directional move guidance arrow.
   */
  public setMoveArrow(move: CubeMove | null): void {
    this.moveArrow.updateMove(move);
  }

  /**
   * Animates a layer rotation smoothly, then orthogonally snaps cubie matrices.
   */
  public async animateMove(
    move: CubeMove,
    targetState: CubeState,
    durationMs = 280
  ): Promise<void> {
    if (this.isAnimating) return;
    this.isAnimating = true;

    // 1. Identify affected layer cubies
    const { face, quarterTurns } = move;
    const affectedCubies = this.cubies.filter((c) => {
      const pos = c.group.position;
      const x = Math.round(pos.x);
      const y = Math.round(pos.y);
      const z = Math.round(pos.z);

      switch (face) {
        case 'U': return y === 1;
        case 'D': return y === -1;
        case 'R': return x === 1;
        case 'L': return x === -1;
        case 'F': return z === 1;
        case 'B': return z === -1;
      }
    });

    // 2. Attach affected cubies to temporary pivot group
    this.pivotGroup.rotation.set(0, 0, 0);
    this.pivotGroup.position.set(0, 0, 0);
    this.pivotGroup.updateMatrixWorld(true);

    for (const cubie of affectedCubies) {
      this.pivotGroup.attach(cubie.group);
    }

    // 3. Determine rotation axis and total target angle
    const rotationAxis = new THREE.Vector3();
    let angleSign = 1;

    switch (face) {
      case 'U':
        rotationAxis.set(0, 1, 0);
        angleSign = -1; // CW around +Y
        break;
      case 'D':
        rotationAxis.set(0, 1, 0);
        angleSign = 1; // CW looking at D
        break;
      case 'R':
        rotationAxis.set(1, 0, 0);
        angleSign = -1; // CW around +X
        break;
      case 'L':
        rotationAxis.set(1, 0, 0);
        angleSign = 1; // CW looking at L
        break;
      case 'F':
        rotationAxis.set(0, 0, 1);
        angleSign = -1; // CW around +Z
        break;
      case 'B':
        rotationAxis.set(0, 0, 1);
        angleSign = 1; // CW looking at B
        break;
    }

    let turnAngle = (Math.PI / 2);
    if (quarterTurns === -1) turnAngle = -(Math.PI / 2);
    if (quarterTurns === 2) turnAngle = Math.PI;

    const totalAngle = turnAngle * angleSign;

    // 4. Smooth easing interpolation
    const startTime = performance.now();

    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        if (this.isDisposed) {
          resolve();
          return;
        }

        const elapsed = now - startTime;
        const progress = Math.min(1.0, elapsed / durationMs);
        // Cubic ease in-out
        const eased =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        const currentAngle = totalAngle * eased;
        this.pivotGroup.setRotationFromAxisAngle(rotationAxis, currentAngle);

        if (progress < 1.0) {
          requestAnimationFrame(step);
        } else {
          // Snap pivot to exact target angle
          this.pivotGroup.setRotationFromAxisAngle(rotationAxis, totalAngle);
          this.pivotGroup.updateMatrixWorld(true);
          resolve();
        }
      };

      requestAnimationFrame(step);
    });

    // 5. Re-attach cubies back to root cube group and snap transforms to integer grid
    for (const cubie of affectedCubies) {
      this.rootCubeGroup.attach(cubie.group);

      // Snap position to exact integer values (-1, 0, 1)
      cubie.group.position.x = Math.round(cubie.group.position.x);
      cubie.group.position.y = Math.round(cubie.group.position.y);
      cubie.group.position.z = Math.round(cubie.group.position.z);

      // Snap rotation quaternion to exact orthogonal grid
      const euler = new THREE.Euler().setFromQuaternion(cubie.group.quaternion);
      euler.x = Math.round(euler.x / (Math.PI / 2)) * (Math.PI / 2);
      euler.y = Math.round(euler.y / (Math.PI / 2)) * (Math.PI / 2);
      euler.z = Math.round(euler.z / (Math.PI / 2)) * (Math.PI / 2);
      cubie.group.quaternion.setFromEuler(euler);

      cubie.group.updateMatrix();
    }

    // Reset pivot
    this.pivotGroup.rotation.set(0, 0, 0);

    // 6. Resynchronize exact sticker colors with the target logical state (Zero Drift)
    this.syncWithCubeState(targetState);

    this.isAnimating = false;
  }

  /**
   * Smoothly restores camera to the canonical viewing angle.
   */
  public resetCamera(): void {
    this.targetRotation.set(0.45, -0.65, 0);
    this.targetDistance = 6.2;
  }

  private attachEventListeners(): void {
    const el = this.renderer.domElement;

    // Mouse drag
    const onMouseDown = (e: MouseEvent) => {
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
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

    const onMouseUp = () => {
      this.isDragging = false;
    };

    // Wheel zoom
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.targetDistance = Math.max(
        3.8,
        Math.min(9.5, this.targetDistance + e.deltaY * 0.005)
      );
    };

    // Touch support for mobile devices
    let touchStartX = 0;
    let touchStartY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - touchStartX;
        const deltaY = e.touches[0].clientY - touchStartY;

        this.targetRotation.y += deltaX * 0.01;
        this.targetRotation.x = Math.max(
          -Math.PI / 2.2,
          Math.min(Math.PI / 2.2, this.targetRotation.x + deltaY * 0.01)
        );

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });

    // Handle Resize
    const onResize = () => {
      if (this.isDisposed) return;
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      if (width && height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
      }
    };

    window.addEventListener('resize', onResize);
  }

  private renderLoop(): void {
    if (this.isDisposed) return;

    // Smooth damping for orbit and zoom
    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.12;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.12;
    this.currentDistance += (this.targetDistance - this.currentDistance) * 0.12;

    this.rootCubeGroup.rotation.copy(this.currentRotation);
    this.pivotGroup.position.set(0, 0, 0);

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
      this.renderer.setSize(width, height);
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.moveArrow.dispose();
    this.cubies.forEach((c) => c.dispose());

    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
