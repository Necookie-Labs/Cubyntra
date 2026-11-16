import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CANONICAL_CENTER_COLORS, COLORS, createSolvedCubeState } from '../src/cube/constants';
import { centerColors } from '../src/cube/orientation';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import { isValidGrip, STANDARD_GRIP, type Grip } from '../src/cube/grip';
import type { CubeColor, Face } from '../src/cube/types';
import { GripAnimator, gripQuaternion } from '../src/three/gripCamera';

const DIR: Record<Face, THREE.Vector3> = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
};

const faceOf = (centers: Record<Face, CubeColor>, color: CubeColor) =>
  (Object.keys(centers) as Face[]).find((f) => centers[f] === color)!;

function expectFrames(centers: Record<Face, CubeColor>, grip: Grip): void {
  const q = gripQuaternion(centers, grip);
  const up = DIR[faceOf(centers, grip.top)].clone().applyQuaternion(q);
  const front = DIR[faceOf(centers, grip.front)].clone().applyQuaternion(q);
  expect(up.distanceTo(new THREE.Vector3(0, 1, 0)), `${grip.top}/${grip.front}`).toBeLessThan(1e-9);
  expect(front.distanceTo(new THREE.Vector3(0, 0, 1)), `${grip.top}/${grip.front}`).toBeLessThan(1e-9);
}

const ALL_GRIPS: Grip[] = (COLORS as readonly CubeColor[]).flatMap((top) =>
  (COLORS as readonly CubeColor[]).map((front) => ({ top, front })).filter(isValidGrip)
);

describe('gripQuaternion', () => {
  it('is the identity for the standard grip on a standard-held cube', () => {
    const q = gripQuaternion(CANONICAL_CENTER_COLORS, STANDARD_GRIP);
    expect(q.angleTo(new THREE.Quaternion())).toBeLessThan(1e-9);
  });

  it('puts the top color up and the front color toward the viewer for all 24 grips', () => {
    expect(ALL_GRIPS).toHaveLength(24);
    for (const grip of ALL_GRIPS) expectFrames(CANONICAL_CENTER_COLORS, grip);
  });

  it('works when the logical state itself is held in another orientation', () => {
    const centers = centerColors(applyMoves(createSolvedCubeState(), parseAlgorithm('x y2 z')));
    for (const grip of ALL_GRIPS) expectFrames(centers, grip);
  });

  it('flipping white from top to bottom is a half turn', () => {
    const q = gripQuaternion(CANONICAL_CENTER_COLORS, { top: 'yellow', front: 'green' });
    expect(q.angleTo(new THREE.Quaternion())).toBeCloseTo(Math.PI, 9);
  });

  it('rejects impossible grips', () => {
    expect(() => gripQuaternion(CANONICAL_CENTER_COLORS, { top: 'white', front: 'yellow' })).toThrow();
  });
});

describe('GripAnimator', () => {
  const half = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

  it('eases toward the target and lands on it exactly', () => {
    const a = new GripAnimator();
    a.setTarget(half);
    a.update(1 / 60);
    const partway = a.current.angleTo(half);
    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(Math.PI / 2);
    for (let i = 0; i < 120; i++) a.update(1 / 60);
    expect(a.isSettled()).toBe(true);
    expect(a.current.equals(half)).toBe(true);
  });

  it('jumps straight there under reduced motion, or when asked to', () => {
    const reduced = new GripAnimator(true);
    reduced.setTarget(half);
    expect(reduced.current.equals(half)).toBe(true);

    const a = new GripAnimator();
    a.setTarget(half, true);
    expect(a.isSettled()).toBe(true);

    const b = new GripAnimator();
    b.setTarget(half);
    b.setReducedMotion(true);
    expect(b.isSettled()).toBe(true);
  });
});
