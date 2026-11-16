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
import { applyMoves, invertAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import type { CubieMesh } from '../src/three/cubie';
import { STICKER_HEX, TWIN_THEME_HEX } from '../src/lib/tokens';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
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
});

const { CubeEngine, REDUCED_MOTION_TURN_MS, snapQuaternionToCubeGroup } = await import('../src/three/engine');
const ghostModule = await import('../src/three/ghost');

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
  (Object.entries(STICKER_HEX) as [CubeColor, string][]).map(([color, hex]) => [hex.slice(1).toLowerCase(), color])
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
      const material = (child as THREE.Mesh).material as THREE.MeshLambertMaterial;
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

describe('CubeEngine framing', () => {
  it.each([
    ['wide', 900, 500],
    ['square', 600, 600],
    ['tall review panel', 594, 676],
    ['phone portrait', 360, 740],
  ])('keeps the whole cube in view in a %s container, from any angle', (_label, w, h) => {
    const container = { clientWidth: w, clientHeight: h, appendChild() {} };
    const engine = new CubeEngine(container as unknown as HTMLElement);
    pumpFrames(2);

    const corners: THREE.Vector3[] = [];
    for (const x of [-1.5, 1.5]) for (const y of [-1.5, 1.5]) for (const z of [-1.5, 1.5]) corners.push(new THREE.Vector3(x, y, z));

    const camera = engine.camera;
    camera.position.set(0, 0, (engine as unknown as { currentDistance: number }).currentDistance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const rand = (() => { let s = 99; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); })();
    let worst = 0;
    for (let i = 0; i < 300; i++) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6.3, rand() * 6.3, rand() * 6.3));
      for (const c of corners) {
        const ndc = c.clone().applyQuaternion(q).project(camera);
        worst = Math.max(worst, Math.abs(ndc.x), Math.abs(ndc.y));
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
    engine.dispose();
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

  it('turns wide layers, slices and the whole cube the way the logical model does', async () => {
    const tokens = ['u', 'r', 'f', 'd', 'l', 'b', 'Rw', 'M', 'E', 'S', 'x', 'y', 'z']
      .flatMap((s) => [s, `${s}'`, `${s}2`]);
    for (const notation of tokens) {
      const engine = makeEngine();
      const [move] = parseAlgorithm(notation);
      const expected = applyMoves(createSolvedCubeState(), [move]);
      void engine.animateMove(move, expected);
      await runUntilIdle(engine);
      expect(readStateFromGeometry(engine), notation).toEqual(expected);
      expect(readStateFromMaterials(engine), notation).toEqual(expected);
      expect(allTransformsExact(engine), notation).toBe(true);
      engine.dispose();
    }
  });

  it('plays a queued mix of face, wide, slice and rotation moves with exact snapping', async () => {
    const engine = makeEngine();
    const moves = parseAlgorithm("R u' M2 x F E S' y2 r2 B' z d M' l S2 x' D Uw' E' z2 b f'");
    let state = createSolvedCubeState();
    for (const move of moves) {
      state = applyMoves(state, [move]);
      void engine.animateMove(move, state, 90);
    }
    await runUntilIdle(engine, 1000 / 144);

    expect(readStateFromGeometry(engine)).toEqual(state);
    expect(readStateFromMaterials(engine)).toEqual(state);
    expect(allTransformsExact(engine)).toBe(true);

    // And back again: the inverse sequence returns every cubie home.
    for (const move of invertAlgorithm(moves)) {
      state = applyMoves(state, [move]);
      void engine.animateMove(move, state, 90);
    }
    await runUntilIdle(engine);
    expect(readStateFromGeometry(engine)).toEqual(createSolvedCubeState());
    expect(allTransformsExact(engine)).toBe(true);
    engine.dispose();
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

  it('cuts turns short under reduced motion, and follows the setting live', async () => {
    const engine = makeEngine();
    const [r] = parseAlgorithm('R');
    const framesFor = async () => {
      let frames = 0;
      void engine.animateMove(r, applyMoves(createSolvedCubeState(), [r]));
      for (; frames < 1000 && engine.isBusy(); frames++) pumpFrames(1);
      await Promise.resolve();
      return frames;
    };
    expect(await framesFor()).toBeGreaterThan(12); // 280 ms at 60 Hz
    engine.setReducedMotion(true);
    expect(engine.isMotionReduced()).toBe(true);
    expect(await framesFor()).toBeLessThanOrEqual(Math.ceil(REDUCED_MOTION_TURN_MS / (1000 / 60)) + 1);
    expect(allTransformsExact(engine)).toBe(true);
    engine.setReducedMotion(false);
    expect(await framesFor()).toBeGreaterThan(12);
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

describe('CubeEngine playback', () => {
  /** Pumps frames until the controller has finished every command. */
  async function settle(engine: Engine): Promise<void> {
    let idle = false;
    void engine.playback.whenIdle().then(() => (idle = true));
    for (let guard = 0; guard < 20_000 && !idle; guard++) {
      pumpFrames(1);
      await Promise.resolve();
    }
    expect(idle).toBe(true);
  }

  it('plays, steps back and seeks with the twin matching the logical state after every step', async () => {
    const engine = makeEngine();
    const start = applyMoves(createSolvedCubeState(), parseAlgorithm("F2 D' L"));
    const alg = parseAlgorithm("R u M' x2 S U'");
    engine.playback.load(start, alg);
    await settle(engine);
    expect(readStateFromMaterials(engine)).toEqual(start);

    let state = start;
    for (const move of alg) {
      void engine.playback.stepForward();
      await settle(engine);
      state = applyMoves(state, [move]);
      // The start state was painted, not turned in, so only the paint can be compared to it.
      expect(readStateFromMaterials(engine), move.notation).toEqual(state);
      expect(allTransformsExact(engine)).toBe(true);
    }

    for (let i = alg.length; i > 0; i--) {
      void engine.playback.stepBack();
      await settle(engine);
      const expected = applyMoves(start, alg.slice(0, i - 1));
      expect(readStateFromMaterials(engine)).toEqual(expected);
      expect(allTransformsExact(engine)).toBe(true);
    }

    void engine.playback.seek(4);
    await settle(engine);
    expect(readStateFromMaterials(engine)).toEqual(applyMoves(start, alg.slice(0, 4)));
    engine.dispose();
  });
});

describe('CubeEngine spotlight', () => {
  const cubiesOf = (engine: Engine) => (engine as unknown as { cubies: CubieMesh[] }).cubies;
  const at = (c: CubieMesh) => [c.group.position.x, c.group.position.y, c.group.position.z].map(Math.round).join(',');

  it('fades every cubie except the listed positions, and clears', () => {
    const engine = makeEngine();
    engine.setSpotlight([{ position: [1, 1, 1] }, { position: [1, 0, 1] }]);
    const lit = cubiesOf(engine).filter((c) => !c.isFaded()).map(at);
    expect(lit.sort()).toEqual(['1,0,1', '1,1,1']);
    engine.setSpotlight(null);
    expect(cubiesOf(engine).every((c) => !c.isFaded())).toBe(true);
    engine.dispose();
  });

  it('re-applies to positions after a turn moves pieces', async () => {
    const engine = makeEngine();
    engine.setSpotlight([{ position: [1, 1, 1] }]);
    const [move] = parseAlgorithm('R');
    void engine.animateMove(move, applyMoves(createSolvedCubeState(), [move]));
    await runUntilIdle(engine);
    const lit = cubiesOf(engine).filter((c) => !c.isFaded());
    expect(lit.map(at)).toEqual(['1,1,1']);
    // A different physical cubie now sits at UFR: the one that was at DFR.
    expect(lit[0].initialPos.toArray()).toEqual([1, -1, 1]);
    engine.dispose();
  });

  it('outlines a slot in the theme focus color', () => {
    const engine = makeEngine();
    const outline = (engine as unknown as { slotOutline: { group: THREE.Group } }).slotOutline.group;
    engine.setSlotOutline([1, -1, 1]);
    expect(outline.visible).toBe(true);
    expect(outline.position.toArray()).toEqual([1, -1, 1]);
    engine.setTheme('dark');
    const material = (outline.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(`#${material.color.getHexString()}`).toBe(TWIN_THEME_HEX.dark.focus.toLowerCase());
    engine.setSlotOutline(null);
    expect(outline.visible).toBe(false);
    engine.dispose();
  });
});

describe('CubeEngine grip framing', () => {
  const rootOf = (engine: Engine) => (engine as unknown as { rootCubeGroup: THREE.Group }).rootCubeGroup;
  const gripOf = (engine: Engine) => (engine as unknown as { gripAnimator: { current: THREE.Quaternion } }).gripAnimator;
  /** Where the cube group sends a direction of its own frame, with the orbit view removed. */
  const gripView = (engine: Engine, v: THREE.Vector3) => {
    const orbit = new THREE.Quaternion().setFromEuler((engine as unknown as { currentRotation: THREE.Euler }).currentRotation);
    return v.clone().applyQuaternion(orbit.invert().multiply(rootOf(engine).quaternion));
  };

  it('animates a regrip so the grip top color ends up and its front color faces the viewer', () => {
    const engine = makeEngine();
    pumpFrames(1);
    engine.setGrip({ top: 'yellow', front: 'red' });
    pumpFrames(2);
    const mid = gripView(engine, new THREE.Vector3(0, -1, 0));
    expect(mid.distanceTo(new THREE.Vector3(0, 1, 0))).toBeGreaterThan(0.01); // still turning
    pumpFrames(120);
    // Yellow is the D center and red the R center of the solved twin.
    expect(gripView(engine, new THREE.Vector3(0, -1, 0)).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9);
    expect(gripView(engine, new THREE.Vector3(1, 0, 0)).distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9);
    expect(engine.getGrip()).toEqual({ top: 'yellow', front: 'red' });
    engine.dispose();
  });

  it('resolves the grip against the state after queued turns', async () => {
    const engine = makeEngine();
    const [x] = parseAlgorithm('x');
    const after = applyMoves(createSolvedCubeState(), [x]);
    void engine.animateMove(x, after);
    engine.setGrip({ top: 'white', front: 'green' });
    await runUntilIdle(engine);
    pumpFrames(120);
    // After x, white sits on the B side of the twin's frame and green on U.
    expect(gripView(engine, new THREE.Vector3(0, 0, -1)).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9);
    expect(gripView(engine, new THREE.Vector3(0, 1, 0)).distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9);
    engine.dispose();
  });

  it('regrips instantly under reduced motion', () => {
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      matchMedia: () => ({ matches: true }),
      addEventListener() {},
      removeEventListener() {},
    });
    const engine = makeEngine();
    engine.setGrip({ top: 'yellow', front: 'green' });
    expect(gripOf(engine).current.angleTo(new THREE.Quaternion())).toBeCloseTo(Math.PI, 9);
    engine.setGrip(null);
    expect(gripOf(engine).current.angleTo(new THREE.Quaternion())).toBeLessThan(1e-9);
    engine.dispose();
  });
});

describe('CubeEngine "after" preview', () => {
  it('shows the expected state in the corner, inside the view, and makes room for it', () => {
    const engine = makeEngine();
    pumpFrames(60);
    const before = (engine as unknown as { currentDistance: number }).currentDistance;
    const ghost = (engine as unknown as { ghost: import('../src/three/ghost').GhostCube }).ghost;
    const expected = applyMoves(createSolvedCubeState(), parseAlgorithm("R U R' U'"));
    engine.setGhostState(expected);
    pumpFrames(120);
    expect(ghost.group.visible).toBe(true);
    expect(ghost.getState()).toBe(expected);
    expect((engine as unknown as { currentDistance: number }).currentDistance).toBeGreaterThan(before * 1.2);

    // The preview's whole bounding sphere projects inside the frame.
    const camera = engine.camera;
    camera.updateMatrixWorld(true);
    const { GHOST_RADIUS } = ghostModule;
    const c = ghost.group.position;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const ndc = new THREE.Vector3(c.x + dx * GHOST_RADIUS, c.y + dy * GHOST_RADIUS, 0).project(camera);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
    }
    expect(ghost.group.quaternion.equals((engine as unknown as { rootCubeGroup: THREE.Group }).rootCubeGroup.quaternion)).toBe(true);

    engine.setGhostState(null);
    expect(ghost.group.visible).toBe(false);
    engine.dispose();
  });
});

describe('CubeEngine resources', () => {
  it('disposes the shared voxel geometries and materials with the engine', () => {
    const engine = makeEngine();
    const kit = (engine as unknown as { kit: import('../src/three/cubie').VoxelKit }).kit;
    const spies = [kit.bodyGeometry, kit.tileGeometry, ...kit.materials()].map((r) => vi.spyOn(r, 'dispose'));
    engine.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('colors the arrows with the theme ink', () => {
    const engine = makeEngine();
    engine.setTheme('dark');
    const arrow = (engine as unknown as { moveArrow: { material: THREE.MeshBasicMaterial } }).moveArrow;
    expect(`#${arrow.material.color.getHexString()}`).toBe(TWIN_THEME_HEX.dark.ink.toLowerCase());
    engine.dispose();
  });

  it('renders without tone mapping, so token colors reach the screen unchanged', () => {
    const engine = makeEngine();
    expect(engine.renderer.toneMapping).toBe(THREE.NoToneMapping);
    engine.dispose();
  });
});
