/**
 * Cubyntra - 3D Twin Motion Correctness
 *
 * Drives the real CubeEngine frame by frame (with WebGL stubbed out) and checks that the
 * geometry it produces agrees with the logical cube model after arbitrary move sequences.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CubeColor, CubeMove, CubeState, Face } from '../src/cube/types';
import { CANONICAL_CENTER_COLORS, createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import { SPEEDCUBE_COLORS, type CubieMesh } from '../src/three/cubie';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    domElement = { addEventListener() {}, removeEventListener() {}, parentNode: null };
    shadowMap = { enabled: false, type: 0 };
    outputColorSpace = '';
    toneMapping = 0;
    toneMappingExposure = 1;
    setSize() {}
    setPixelRatio() {}
    render() {}
    dispose() {}
  }
  class FakePMREM {
    fromScene() {
      return { texture: new actual.Texture() };
    }
    dispose() {}
  }
  return { ...actual, WebGLRenderer: FakeRenderer, PMREMGenerator: FakePMREM };
});

const { CubeEngine, snapQuaternionToCubeGroup } = await import('../src/three/engine');

type Engine = InstanceType<typeof CubeEngine>;

let frameCallbacks: FrameRequestCallback[] = [];
let clockMs = 0;

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

function makeEngine(): Engine {
  const container = { clientWidth: 400, clientHeight: 400, appendChild() {} };
  return new CubeEngine(container as unknown as HTMLElement);
}

/** Runs n frames at the given refresh interval. */
function pumpFrames(n: number, frameMs = 1000 / 60): void {
  for (let i = 0; i < n; i++) {
    const pending = frameCallbacks;
    frameCallbacks = [];
    clockMs += frameMs;
    for (const cb of pending) cb(clockMs);
  }
}

async function runUntilIdle(engine: Engine, frameMs?: number): Promise<void> {
  for (let guard = 0; guard < 10_000 && engine.isBusy(); guard++) pumpFrames(1, frameMs);
  expect(engine.isBusy()).toBe(false);
  await Promise.resolve();
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

/**
 * Reconstructs the logical state purely from cubie geometry: every sticker keeps the color
 * of the face it was built on, and lands wherever the cubie's position and orientation put
 * it. Material colors are ignored. Index conventions mirror CubeEngine.syncWithCubeState.
 */
function readStateFromGeometry(engine: Engine): CubeState {
  const state = createSolvedCubeState();
  const cubies = (engine as unknown as { cubies: CubieMesh[] }).cubies;

  for (const cubie of cubies) {
    const g = cubie.group;
    const x = Math.round(g.position.x);
    const y = Math.round(g.position.y);
    const z = Math.round(g.position.z);

    for (const child of g.children) {
      if (child.position.lengthSq() < 1e-6) continue; // cubie body sits at the origin
      const outward = child.position.clone().normalize();
      const builtOn = FACE_BY_NORMAL[axisKey(outward)];
      const facing = FACE_BY_NORMAL[axisKey(outward.clone().applyQuaternion(g.quaternion))];
      const color: CubeColor = CANONICAL_CENTER_COLORS[builtOn];

      let index = 0;
      switch (facing) {
        case 'U': index = (z + 1) * 3 + (x + 1); break;
        case 'D': index = (1 - z) * 3 + (x + 1); break;
        case 'F': index = (1 - y) * 3 + (x + 1); break;
        case 'B': index = (1 - y) * 3 + (1 - x); break;
        case 'R': index = (1 - y) * 3 + (1 - z); break;
        case 'L': index = (1 - y) * 3 + (z + 1); break;
      }
      state[facing][index] = color;
    }
  }
  return state;
}

const COLOR_BY_HEX = Object.fromEntries(
  (Object.entries(SPEEDCUBE_COLORS) as [CubeColor, string][]).map(([color, hex]) => [hex.slice(1).toLowerCase(), color])
) as Record<string, CubeColor>;

/** Reads what the viewer actually sees: each tile's material color, placed by where it faces now. */
function readStateFromMaterials(engine: Engine): CubeState {
  const state = createSolvedCubeState();
  const cubies = (engine as unknown as { cubies: CubieMesh[] }).cubies;

  for (const cubie of cubies) {
    const g = cubie.group;
    const x = Math.round(g.position.x);
    const y = Math.round(g.position.y);
    const z = Math.round(g.position.z);
    for (const child of g.children) {
      if (child.position.lengthSq() < 1e-6) continue;
      const facing = FACE_BY_NORMAL[axisKey(child.position.clone().normalize().applyQuaternion(g.quaternion))];
      const material = (child as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
      const color = COLOR_BY_HEX[material.color.getHexString()];

      let index = 0;
      switch (facing) {
        case 'U': index = (z + 1) * 3 + (x + 1); break;
        case 'D': index = (1 - z) * 3 + (x + 1); break;
        case 'F': index = (1 - y) * 3 + (x + 1); break;
        case 'B': index = (1 - y) * 3 + (1 - x); break;
        case 'R': index = (1 - y) * 3 + (1 - z); break;
        case 'L': index = (1 - y) * 3 + (z + 1); break;
      }
      state[facing][index] = color;
    }
  }
  return state;
}

function allTransformsExact(engine: Engine): boolean {
  const cubies = (engine as unknown as { cubies: CubieMesh[] }).cubies;
  return cubies.every(({ group: g }) => {
    const posExact = [g.position.x, g.position.y, g.position.z].every((v) => v === Math.round(v));
    const m = new THREE.Matrix4().makeRotationFromQuaternion(g.quaternion).elements;
    const rotExact = [0, 1, 2, 4, 5, 6, 8, 9, 10].every((i) => Math.abs(m[i] - Math.round(m[i])) < 1e-12);
    return posExact && rotExact;
  });
}

describe('snapQuaternionToCubeGroup', () => {
  it('recovers all 24 cube orientations exactly from noisy rotations', () => {
    const H = Math.PI / 2;
    const noise = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, -0.15, 0.1));
    const seen = new Set<string>();

    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        for (let c = 0; c < 4; c++) {
          const exact = new THREE.Quaternion().setFromEuler(new THREE.Euler(a * H, b * H, c * H));
          const snapped = snapQuaternionToCubeGroup(exact.clone().multiply(noise));
          expect(1 - Math.abs(snapped.dot(exact))).toBeLessThan(1e-12);

          const m = new THREE.Matrix4().makeRotationFromQuaternion(snapped);
          expect(m.determinant()).toBeCloseTo(1, 12);
          seen.add([0, 1, 2, 4, 5, 6, 8, 9, 10].map((i) => Math.round(m.elements[i])).join(','));
        }
      }
    }
    expect(seen.size).toBe(24);
  });
});

describe('CubeEngine layer turns', () => {
  it('turns every face in the direction the logical model defines', async () => {
    for (const notation of ['U', "U'", 'U2', 'D', "D'", 'R', "R'", 'L', 'F', "F'", 'B', "B'", 'L2']) {
      const engine = makeEngine();
      const moves = parseAlgorithm(notation);
      const expected = applyMoves(createSolvedCubeState(), moves);
      void engine.animateMove(moves[0], expected);
      await runUntilIdle(engine);
      expect(readStateFromGeometry(engine), notation).toEqual(expected);
      engine.dispose();
    }
  });

  it('plays a rapidly queued scramble without dropping a move, at 144 Hz', async () => {
    const engine = makeEngine();
    const moves: CubeMove[] = parseAlgorithm("R U R' U' R' F R2 U' R' U' R U R' F' D2 B L' B2");
    const finished: number[] = [];

    // Enqueue everything in one tick, as a user mashing "next" would.
    let state = createSolvedCubeState();
    moves.forEach((move, i) => {
      state = applyMoves(state, [move]);
      void engine.animateMove(move, state, 120).then(() => finished.push(i));
    });
    expect(engine.isBusy()).toBe(true);

    await runUntilIdle(engine, 1000 / 144);
    await Promise.resolve();

    expect(finished).toEqual(moves.map((_, i) => i));
    expect(readStateFromGeometry(engine)).toEqual(applyMoves(createSolvedCubeState(), moves));
    expect(allTransformsExact(engine)).toBe(true);
    engine.dispose();
  });

  it('paints each face the color the logical state says, after turns have rotated cubies', async () => {
    // Repainting must follow where each tile points now, not the face it was built on:
    // after a turn the tile built as "U" on a corner may be facing Front.
    const engine = makeEngine();
    const moves = parseAlgorithm("R U R' U' F2 D L' B R2 U2 F' L D' B2");
    let state = createSolvedCubeState();
    for (const move of moves) {
      state = applyMoves(state, [move]);
      void engine.animateMove(move, state, 60);
    }
    await runUntilIdle(engine);

    expect(readStateFromMaterials(engine)).toEqual(state);

    // A fresh repaint of a different state must land on the right tiles too.
    const other = applyMoves(state, parseAlgorithm("U F' R2"));
    engine.syncWithCubeState(other);
    expect(readStateFromMaterials(engine)).toEqual(other);
    engine.dispose();
  });

  it('defers an external repaint until the queue drains', async () => {
    const engine = makeEngine();
    const [move] = parseAlgorithm('R');
    const target = applyMoves(createSolvedCubeState(), [move]);
    const spy = vi.spyOn(engine, 'syncWithCubeState');

    void engine.animateMove(move, target);
    pumpFrames(2);
    engine.requestSync(target);
    expect(spy).not.toHaveBeenCalled();

    await runUntilIdle(engine);
    expect(spy).toHaveBeenCalledWith(target);
    engine.dispose();
  });

  it('keeps turning while the page reports itself hidden but still renders', async () => {
    // Some contexts (occluded windows, automation, embedded views) keep firing animation
    // frames while document.hidden is true. A turn must still complete there, or playback
    // would wait on it forever.
    vi.stubGlobal('document', {
      hidden: true,
      visibilityState: 'hidden',
      addEventListener() {},
      removeEventListener() {},
    });
    const engine = makeEngine();
    const [move] = parseAlgorithm('R');
    const target = applyMoves(createSolvedCubeState(), [move]);

    void engine.animateMove(move, target);
    await runUntilIdle(engine);
    expect(readStateFromGeometry(engine)).toEqual(target);
    engine.dispose();
  });

  it('releases every waiting caller when disposed mid-sequence', async () => {
    const engine = makeEngine();
    const done = parseAlgorithm('R U F').map((m) => engine.animateMove(m, createSolvedCubeState()));
    pumpFrames(3);
    engine.dispose();
    await expect(Promise.all(done)).resolves.toBeDefined();
  });
});
