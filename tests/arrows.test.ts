/**
 * Cubyntra - Guidance Arrow Direction
 *
 * The arrow must sweep the way the face turns as seen from outside that face: clockwise for
 * `X` and `X2`, counter-clockwise for `X'`, on all six faces.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MoveArrow } from '../src/three/arrows';
import { parseMove } from '../src/cube/transforms';
import type { Face } from '../src/cube/types';

const FACE_NORMALS: Record<Face, THREE.Vector3> = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
};

/** World-space points along the arrow's tube path, from tail to head. */
function arrowWorldPath(arrow: MoveArrow): THREE.Vector3[] {
  arrow.group.updateMatrixWorld(true);
  let tube: THREE.Mesh | null = null;
  arrow.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.TubeGeometry) tube = obj;
  });
  expect(tube).not.toBeNull();
  const mesh = tube as unknown as THREE.Mesh<THREE.TubeGeometry>;
  const path = mesh.geometry.parameters.path;
  return path.getPoints(64).map((p) => p.clone().applyMatrix4(mesh.matrixWorld));
}

/**
 * Signed angle swept around the outward face normal, in radians.
 * Positive is counter-clockwise when looking at the face from outside (right-hand rule).
 */
function signedSweep(points: THREE.Vector3[], normal: THREE.Vector3): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    // Project onto the face plane through the cube centre axis.
    const a = points[i - 1].clone().projectOnPlane(normal);
    const b = points[i].clone().projectOnPlane(normal);
    const cross = new THREE.Vector3().crossVectors(a, b).dot(normal);
    total += Math.atan2(cross, a.dot(b));
  }
  return total;
}

describe('MoveArrow direction', () => {
  const faces: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

  for (const face of faces) {
    it(`${face}: sits outside the face and sweeps with the turn`, () => {
      const arrow = new MoveArrow();
      const normal = FACE_NORMALS[face];

      arrow.updateMove(parseMove(face));
      const cw = arrowWorldPath(arrow);
      // Every point is in front of the face (outside the cube).
      for (const p of cw) expect(p.dot(normal)).toBeGreaterThan(1.5);
      expect(signedSweep(cw, normal)).toBeLessThan(-1);

      arrow.updateMove(parseMove(`${face}'`));
      expect(signedSweep(arrowWorldPath(arrow), normal)).toBeGreaterThan(1);

      arrow.updateMove(parseMove(`${face}2`));
      expect(signedSweep(arrowWorldPath(arrow), normal)).toBeLessThan(-2.5);

      arrow.dispose();
    });
  }

  it('points the arrowhead along the direction of travel', () => {
    const arrow = new MoveArrow();
    arrow.updateMove(parseMove('F'));
    arrow.group.updateMatrixWorld(true);
    const path = arrowWorldPath(arrow);
    const travel = path[path.length - 1].clone().sub(path[path.length - 2]).normalize();
    let head: THREE.Mesh | null = null;
    arrow.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.ConeGeometry) head = obj;
    });
    const cone = head as unknown as THREE.Mesh;
    // ConeGeometry points along local +Y.
    const tip = new THREE.Vector3(0, 1, 0).transformDirection(cone.matrixWorld);
    expect(tip.dot(travel)).toBeGreaterThan(0.95);
    arrow.dispose();
  });
});
