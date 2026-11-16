/**
 * Cubyntra - Headless Twin Harness
 *
 * Drives the real CubeEngine frame by frame without WebGL and reads its state back, the way
 * tests/three-motion.test.ts does. The test file must stub WebGLRenderer itself (vi.mock is
 * hoisted per file):
 *
 *   vi.mock('three', async (orig) => withFakeRenderer(await orig<typeof import('three')>()));
 */

import { afterEach, beforeEach, expect, vi } from 'vitest';
import * as THREE from 'three';
import type { CubeColor, CubeState, Face } from '../../src/cube/types';
import { CANONICAL_CENTER_COLORS, createSolvedCubeState } from '../../src/cube/constants';
import type { CubieMesh } from '../../src/three/cubie';
import type { CubeEngine } from '../../src/three/engine';
import { STICKER_HEX } from '../../src/lib/tokens';

/** `three` with a renderer that draws nothing. */
export function withFakeRenderer<T extends object>(actual: T): T {
  class FakeRenderer {
    domElement = { addEventListener() {}, removeEventListener() {}, parentNode: null };
    outputColorSpace = '';
    toneMapping = 0;
    setSize() {}
    setPixelRatio() {}
    render() {}
    dispose() {}
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
}

let frameCallbacks: FrameRequestCallback[] = [];
let clockMs = 0;

/** Stubs window and requestAnimationFrame around each test. Call once at the top of a file. */
export function installEngineGlobals(): void {
  beforeEach(() => {
    frameCallbacks = [];
    clockMs = performance.now();
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      matchMedia: () => ({ matches: false }),
      addEventListener() {},
      removeEventListener() {},
    });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameCallbacks.push(cb);
      return frameCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
}

export function makeEngine(Engine: typeof CubeEngine): CubeEngine {
  const container = { clientWidth: 400, clientHeight: 400, appendChild() {} };
  return new Engine(container as unknown as HTMLElement);
}

/** Runs n frames at 60 Hz. */
export function pumpFrames(n: number, frameMs = 1000 / 60): void {
  for (let i = 0; i < n; i++) {
    const pending = frameCallbacks;
    frameCallbacks = [];
    clockMs += frameMs;
    for (const cb of pending) cb(clockMs);
  }
}

/** Pumps frames until `promise` settles (or fails the test after a generous guard). */
export async function pumpUntil(promise: Promise<unknown>): Promise<void> {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true)
  );
  for (let guard = 0; guard < 200_000 && !done; guard++) {
    pumpFrames(1);
    await Promise.resolve();
  }
  expect(done).toBe(true);
}

export function cubiesOf(engine: CubeEngine): CubieMesh[] {
  return (engine as unknown as { cubies: CubieMesh[] }).cubies;
}

const FACE_BY_NORMAL: Record<string, Face> = {
  '1,0,0': 'R',
  '-1,0,0': 'L',
  '0,1,0': 'U',
  '0,-1,0': 'D',
  '0,0,1': 'F',
  '0,0,-1': 'B',
};

function axisKey(v: THREE.Vector3): string {
  return [v.x, v.y, v.z].map((c) => Math.round(c) + 0).join(',');
}

function stickerIndex(facing: Face, x: number, y: number, z: number): number {
  switch (facing) {
    case 'U': return (z + 1) * 3 + (x + 1);
    case 'D': return (1 - z) * 3 + (x + 1);
    case 'F': return (1 - y) * 3 + (x + 1);
    case 'B': return (1 - y) * 3 + (1 - x);
    case 'R': return (1 - y) * 3 + (1 - z);
    case 'L': return (1 - y) * 3 + (z + 1);
  }
}

function tiles(cubie: CubieMesh): THREE.Object3D[] {
  // The cubie body sits at the group origin; tiles sit out on their faces.
  return cubie.group.children.filter((child) => child.position.lengthSq() > 1e-6);
}

export function positionOf(cubie: CubieMesh): [number, number, number] {
  const p = cubie.group.position;
  return [Math.round(p.x) + 0, Math.round(p.y) + 0, Math.round(p.z) + 0];
}

/** The cubie at a position of the twin's frame. */
export function cubieAt(engine: CubeEngine, position: readonly number[]): CubieMesh {
  const found = cubiesOf(engine).find((c) => positionOf(c).join(',') === position.join(','));
  if (!found) throw new Error(`No cubie at ${position.join(',')}`);
  return found;
}

/**
 * The colors a cubie was built with, read from its geometry: each tile keeps the color of the
 * solved-cube face it was built on, wherever turns have since carried it.
 */
export function builtColors(cubie: CubieMesh): CubeColor[] {
  return tiles(cubie).map((tile) => CANONICAL_CENTER_COLORS[FACE_BY_NORMAL[axisKey(tile.position.clone().normalize())]]);
}

/**
 * The logical state rebuilt purely from cubie geometry (materials ignored). Only meaningful when
 * the twin started solved and every change since was a turn.
 */
export function readStateFromGeometry(engine: CubeEngine): CubeState {
  const state = createSolvedCubeState();
  for (const cubie of cubiesOf(engine)) {
    const [x, y, z] = positionOf(cubie);
    for (const tile of tiles(cubie)) {
      const outward = tile.position.clone().normalize();
      const color = CANONICAL_CENTER_COLORS[FACE_BY_NORMAL[axisKey(outward)]];
      const facing = FACE_BY_NORMAL[axisKey(outward.applyQuaternion(cubie.group.quaternion))];
      state[facing][stickerIndex(facing, x, y, z)] = color;
    }
  }
  return state;
}

const COLOR_BY_HEX = Object.fromEntries(
  (Object.entries(STICKER_HEX) as [CubeColor, string][]).map(([color, hex]) => [hex.slice(1).toLowerCase(), color])
) as Record<string, CubeColor>;

/** What the viewer sees: each tile's material color, placed by where it faces now. */
export function readStateFromMaterials(engine: CubeEngine): CubeState {
  const state = createSolvedCubeState();
  for (const cubie of cubiesOf(engine)) {
    const [x, y, z] = positionOf(cubie);
    for (const tile of tiles(cubie)) {
      const facing = FACE_BY_NORMAL[axisKey(tile.position.clone().normalize().applyQuaternion(cubie.group.quaternion))];
      const material = (tile as THREE.Mesh).material as THREE.MeshLambertMaterial;
      state[facing][stickerIndex(facing, x, y, z)] = COLOR_BY_HEX[material.color.getHexString()];
    }
  }
  return state;
}

/** Positions of the cubies left at full color by the spotlight, sorted. */
export function litPositions(engine: CubeEngine): string[] {
  return cubiesOf(engine)
    .filter((c) => !c.isFaded())
    .map((c) => positionOf(c).join(','))
    .sort();
}
