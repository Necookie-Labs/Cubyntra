/**
 * Cubyntra - Grip-Framed View
 * Necookie Labs (c) 2026
 *
 * Shows the twin the way the student holds the real cube: the grip's top color up and its
 * front color toward the viewer. The engine turns the whole cube group by the grip rotation
 * and then applies its usual three-quarter view on top, so U, F and R stay visible.
 *
 * Only the cube group's orientation changes. Cubie transforms stay snapped in the cube's
 * own frame, so regrips cannot introduce drift.
 */

import * as THREE from 'three';
import type { CubeColor, Face } from '../cube/types';
import { isValidGrip, type Grip } from '../cube/grip';

const FACE_DIRECTION: Record<Face, [number, number, number]> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

function faceShowing(centers: Record<Face, CubeColor>, color: CubeColor): Face {
  const face = (Object.keys(centers) as Face[]).find((f) => centers[f] === color);
  if (!face) throw new Error(`No center is ${color}`);
  return face;
}

/**
 * The rotation that brings the face whose center is `grip.top` to +Y (up) and the face whose
 * center is `grip.front` to +Z (toward the viewer), for a cube whose centers are `centers`.
 * Always one of the 24 exact cube orientations.
 */
export function gripQuaternion(centers: Record<Face, CubeColor>, grip: Grip): THREE.Quaternion {
  if (!isValidGrip(grip)) throw new Error(`Impossible grip: ${grip.top} on top with ${grip.front} in front`);
  const up = new THREE.Vector3(...FACE_DIRECTION[faceShowing(centers, grip.top)]);
  const front = new THREE.Vector3(...FACE_DIRECTION[faceShowing(centers, grip.front)]);
  if (Math.abs(up.dot(front)) > 0.5) throw new Error('Top and front centers are not adjacent');
  const right = new THREE.Vector3().crossVectors(up, front);
  // makeBasis maps the standard axes onto right/up/front; its inverse (the transpose) maps
  // right/up/front back onto X/Y/Z, which is the turn we want.
  const toGrip = new THREE.Matrix4().makeBasis(right, up, front).transpose();
  return new THREE.Quaternion().setFromRotationMatrix(toGrip);
}

/** Exponential rate of a regrip; about 0.4 s to settle. */
const REGRIP_RATE_PER_S = 9;

/** Eases the cube group's grip orientation toward a target, or jumps when motion is reduced. */
export class GripAnimator {
  public readonly current = new THREE.Quaternion();
  public readonly target = new THREE.Quaternion();
  private reducedMotion: boolean;

  constructor(reducedMotion = false) {
    this.reducedMotion = reducedMotion;
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) this.current.copy(this.target);
  }

  public setTarget(q: THREE.Quaternion, immediate = false): void {
    this.target.copy(q);
    if (immediate || this.reducedMotion) this.current.copy(q);
  }

  public isSettled(): boolean {
    return this.current.angleTo(this.target) < 1e-6;
  }

  /** Advances by `dtS` seconds. Lands exactly on the target once within a hair of it. */
  public update(dtS: number): void {
    if (this.isSettled()) {
      this.current.copy(this.target);
      return;
    }
    this.current.slerp(this.target, 1 - Math.exp(-REGRIP_RATE_PER_S * dtS));
    if (this.current.angleTo(this.target) < 1e-3) this.current.copy(this.target);
  }
}
