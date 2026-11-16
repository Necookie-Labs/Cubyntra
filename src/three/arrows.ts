/**
 * Cubyntra - 3D Directional Move Arrows & Visual Guidance
 * Necookie Labs (c) 2026
 */

import * as THREE from 'three';
import { CubeMove, Face, MoveKind } from '../cube/types';
import { moveReferenceFace } from '../cube/transforms';
import { TWIN_THEME_HEX } from '../lib/tokens';

/**
 * Arc radius, distance of the arc's plane from the cube center along the reference face's
 * normal, and tube thickness, per move kind. The cube spans ±1.5, so a ring in a middle plane
 * clears the cube's edges once its radius exceeds 1.5·√2 ≈ 2.12.
 */
const ARROW_LAYOUT: Record<MoveKind, { radius: number; offset: number; tube: number }> = {
  face: { radius: 1.15, offset: 1.75, tube: 0.08 },
  wide: { radius: 1.15, offset: 1.75, tube: 0.08 },
  slice: { radius: 2.3, offset: 0, tube: 0.08 },
  rotation: { radius: 2.6, offset: 0, tube: 0.12 },
};

/** Four sides per tube and cone: a square, chunky voxel bar rather than a smooth pipe. */
const ARROW_SIDES = 4;

export class MoveArrow {
  public group: THREE.Group;
  private arrowMesh: THREE.Mesh | null = null;
  private headMesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial;

  constructor() {
    this.group = new THREE.Group();
    // Flat and unlit: one solid token color, no transparency or glow.
    this.material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(TWIN_THEME_HEX.light.ink),
      side: THREE.DoubleSide,
    });
  }

  /** Recolors the arrow, e.g. to the current theme's ink. */
  public setColor(hex: string): void {
    this.material.color.set(hex);
  }

  /**
   * Updates arrow placement and orientation according to the given move.
   *
   * - Face and wide turns: an arc just outside the turning face.
   * - Slices: a wider arc around the cube in the slice's own plane, sweeping like the face the
   *   slice follows (M like L, E like D, S like F).
   * - Whole-cube rotations: the widest, thickest arc, around the middle of the cube, sweeping like
   *   the face the rotation follows (x like R, y like U, z like F).
   */
  public updateMove(move: CubeMove | null): void {
    this.clear();
    if (!move) return;

    const { quarterTurns } = move;
    const face = moveReferenceFace(move);
    const { radius, offset, tube } = ARROW_LAYOUT[move.kind];
    const startAngle = 0.2;
    const sweep = quarterTurns === 2 ? Math.PI * 0.95 : Math.PI * 0.55;
    // Half turns are drawn clockwise, matching how applyMove performs them (two clockwise quarters).
    const isClockwise = quarterTurns === 1 || quarterTurns === 2;

    // orientToFace points the local +Z axis out of the face, so the local XY plane is seen from
    // outside the cube. Seen from +Z, a clockwise arc has a decreasing angle: the end angle is
    // start - sweep and aClockwise must be true (EllipseCurve then sweeps -sweep radians).
    const curve = new THREE.EllipseCurve(
      0,
      0,
      radius,
      radius,
      startAngle,
      startAngle + (isClockwise ? -sweep : sweep),
      isClockwise,
      0
    );

    const points = curve.getPoints(32);
    // Create tubular or ribbon geometry for high visibility
    const curve3D = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p.x, p.y, 0))
    );
    const tubeGeometry = new THREE.TubeGeometry(curve3D, 24, tube, ARROW_SIDES, false);
    this.arrowMesh = new THREE.Mesh(tubeGeometry, this.material);

    // Arrowhead cone at the end
    const lastPoint = points[points.length - 1];
    const prevPoint = points[points.length - 2];
    const dir = new THREE.Vector2().subVectors(lastPoint, prevPoint).normalize();

    const headGeom = new THREE.ConeGeometry(tube * 2.6, tube * 6, ARROW_SIDES);
    this.headMesh = new THREE.Mesh(headGeom, this.material);
    this.headMesh.position.set(lastPoint.x, lastPoint.y, 0);

    const angle = Math.atan2(dir.y, dir.x) - Math.PI / 2;
    this.headMesh.rotation.z = angle;

    const subGroup = new THREE.Group();
    subGroup.add(this.arrowMesh);
    subGroup.add(this.headMesh);

    // Position and orient the arrow along the reference face's normal
    this.orientToFace(subGroup, face, offset);

    this.group.add(subGroup);
  }

  private orientToFace(subGroup: THREE.Group, face: Face, offset: number): void {
    switch (face) {
      case 'U': // +Y
        subGroup.position.set(0, offset, 0);
        subGroup.rotation.set(-Math.PI / 2, 0, 0);
        break;
      case 'D': // -Y
        subGroup.position.set(0, -offset, 0);
        subGroup.rotation.set(Math.PI / 2, 0, 0);
        break;
      case 'F': // +Z
        subGroup.position.set(0, 0, offset);
        subGroup.rotation.set(0, 0, 0);
        break;
      case 'B': // -Z
        subGroup.position.set(0, 0, -offset);
        subGroup.rotation.set(0, Math.PI, 0);
        break;
      case 'R': // +X
        subGroup.position.set(offset, 0, 0);
        subGroup.rotation.set(0, Math.PI / 2, 0);
        break;
      case 'L': // -X
        subGroup.position.set(-offset, 0, 0);
        subGroup.rotation.set(0, -Math.PI / 2, 0);
        break;
    }
  }

  private clear(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry) {
          obj.geometry.dispose();
        }
      });
    }
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public dispose(): void {
    this.clear();
    this.material.dispose();
  }
}
