/**
 * WebGL context loss: the guard's event logic, and the engine's pause / rebuild around it,
 * driven through a fake canvas.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import { ContextLossGuard } from '../src/three/contextLoss';
import type { CubieMesh, VoxelKit } from '../src/three/cubie';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    domElement = new EventTarget();
    outputColorSpace = '';
    toneMapping = 0;
    renders = 0;
    setSize() {}
    setPixelRatio() {}
    render() {
      this.renders++;
    }
    contextLost = false;
    forceContextLoss() {
      this.contextLost = true;
    }
    dispose() {}
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

const { CubeEngine } = await import('../src/three/engine');

const lostEvent = () => new Event('webglcontextlost', { cancelable: true });
const restoredEvent = () => new Event('webglcontextrestored');

describe('ContextLossGuard', () => {
  it('asks the browser to restore, and reports each loss and restore once', () => {
    const canvas = new EventTarget();
    const onLost = vi.fn();
    const onRestored = vi.fn();
    const guard = new ContextLossGuard(canvas, { onLost, onRestored });

    canvas.dispatchEvent(restoredEvent()); // a restore with no loss is ignored
    expect(onRestored).not.toHaveBeenCalled();

    const lost = lostEvent();
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    canvas.dispatchEvent(lostEvent());
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(guard.isLost()).toBe(true);

    canvas.dispatchEvent(restoredEvent());
    canvas.dispatchEvent(restoredEvent());
    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(guard.isLost()).toBe(false);
  });

  it('stops listening once disposed', () => {
    const canvas = new EventTarget();
    const onLost = vi.fn();
    const guard = new ContextLossGuard(canvas, { onLost, onRestored: vi.fn() });
    guard.dispose();
    canvas.dispatchEvent(lostEvent());
    expect(onLost).not.toHaveBeenCalled();
  });
});

describe('CubeEngine context loss', () => {
  let frames: FrameRequestCallback[] = [];
  let clock = 0;

  beforeEach(() => {
    frames = [];
    clock = performance.now();
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      matchMedia: () => ({ matches: false }),
      addEventListener() {},
      removeEventListener() {},
    });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const pump = (n: number) => {
    for (let i = 0; i < n; i++) {
      const pending = frames;
      frames = [];
      clock += 16;
      for (const cb of pending) cb(clock);
    }
  };

  function makeEngine() {
    const container = { clientWidth: 400, clientHeight: 400, appendChild() {} };
    const engine = new CubeEngine(container as unknown as HTMLElement);
    const canvas = engine.renderer.domElement as unknown as EventTarget;
    const renderer = engine.renderer as unknown as { renders: number };
    return { engine, canvas, renderer };
  }

  it('gives the WebGL context back when disposed', () => {
    const { engine } = makeEngine();
    engine.dispose();
    expect((engine.renderer as unknown as { contextLost: boolean }).contextLost).toBe(true);
  });

  it('pauses rendering while lost and resumes on restore', () => {
    const { engine, canvas, renderer } = makeEngine();
    pump(3);
    canvas.dispatchEvent(lostEvent());
    const rendersAtLoss = renderer.renders;
    pump(10);
    expect(renderer.renders).toBe(rendersAtLoss);
    expect(frames).toHaveLength(0);

    canvas.dispatchEvent(restoredEvent());
    pump(3);
    expect(renderer.renders).toBeGreaterThan(rendersAtLoss);
    engine.dispose();
  });

  it('finishes queued turns at once on loss, so no caller is left waiting', async () => {
    const { engine, canvas } = makeEngine();
    const moves = parseAlgorithm("R U F'");
    let state = createSolvedCubeState();
    const done = moves.map((m) => {
      state = applyMoves(state, [m]);
      return engine.animateMove(m, state);
    });
    pump(2);
    canvas.dispatchEvent(lostEvent());
    await expect(Promise.all(done)).resolves.toBeDefined();
    expect(engine.isBusy()).toBe(false);
    const cubies = (engine as unknown as { cubies: CubieMesh[] }).cubies;
    expect(cubies.every((c) => [c.group.position.x, c.group.position.y, c.group.position.z].every(Number.isInteger))).toBe(true);
    engine.dispose();
  });

  it('rebuilds on restore: materials recompiled, twin repainted from the logical state, spotlight kept', () => {
    const { engine, canvas } = makeEngine();
    const target = applyMoves(createSolvedCubeState(), parseAlgorithm("R U2 B'"));
    engine.syncWithCubeState(target);
    engine.setSpotlight([{ position: [1, 1, 1] }]);
    canvas.dispatchEvent(lostEvent());

    const kit = (engine as unknown as { kit: VoxelKit }).kit;
    const versions = kit.materials().map((m) => m.version);
    const sync = vi.spyOn(engine, 'syncWithCubeState');
    canvas.dispatchEvent(restoredEvent());

    expect(kit.materials().every((m, i) => m.version > versions[i])).toBe(true);
    expect(sync).toHaveBeenCalledWith(target);
    const cubies = (engine as unknown as { cubies: CubieMesh[] }).cubies;
    expect(cubies.filter((c) => !c.isFaded())).toHaveLength(1);
    engine.dispose();
  });

  it('removes its listeners on dispose', () => {
    const { engine, canvas } = makeEngine();
    engine.dispose();
    expect(() => canvas.dispatchEvent(lostEvent())).not.toThrow();
    expect(() => canvas.dispatchEvent(restoredEvent())).not.toThrow();
  });
});

