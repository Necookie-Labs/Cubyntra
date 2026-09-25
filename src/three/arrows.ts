/**
 * Cubyntra - 3D Directional Move Arrows & Visual Guidance
 * Necookie Labs (c) 2026
 */

import * as THREE from 'three';
import { CubeMove, Face } from '../cube/types';

export class MoveArrow {
  public group: THREE.Group;
  private arrowMesh: THREE.Mesh | null = null;
  private headMesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.material = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Vibrant sky blue accent
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
  }

  /**
   * Updates arrow placement and orientation according to the given move.
   */
  public updateMove(move: CubeMove | null): void {
    this.clear();
    if (!move) return;

    const { face, quarterTurns } = move;
    // Radius of circular arc
    const radius = 1.15;
    const startAngle = 0.2;
    const sweep = quarterTurns === 2 ? Math.PI * 0.95 : Math.PI * 0.55;
    const isClockwise = quarterTurns === 1 || quarterTurns === 2;

    const curve = new THREE.EllipseCurve(
      0,
      0,
      radius,
      radius,
      startAngle,
      startAngle + (isClockwise ? sweep : -sweep),
      !isClockwise,
      0
    );

    const points = curve.getPoints(32);
    // Create tubular or ribbon geometry for high visibility
    const curve3D = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p.x, p.y, 0))
    );
    const tubeGeometry = new THREE.TubeGeometry(curve3D, 24, 0.05, 8, false);
    this.arrowMesh = new THREE.Mesh(tubeGeometry, this.material);

    // Arrowhead cone at the end
    const lastPoint = points[points.length - 1];
    const prevPoint = points[points.length - 2];
    const dir = new THREE.Vector2().subVectors(lastPoint, prevPoint).normalize();

    const headGeom = new THREE.ConeGeometry(0.14, 0.35, 12);
    this.headMesh = new THREE.Mesh(headGeom, this.material);
    this.headMesh.position.set(lastPoint.x, lastPoint.y, 0);

    const angle = Math.atan2(dir.y, dir.x) - Math.PI / 2;
    this.headMesh.rotation.z = angle;

    const subGroup = new THREE.Group();
    subGroup.add(this.arrowMesh);
    subGroup.add(this.headMesh);

    // Position and orient arrow in front of the active face
    const offset = 1.75; // Distance from center
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
