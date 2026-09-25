/**
 * Cubyntra - Three.js Cubie Construction & Material Management
 * Necookie Labs (c) 2026
 */

import * as THREE from 'three';
import { CubeColor, Face } from '../cube/types';
import { COLOR_HEX } from '../cube/constants';

export interface CubieMeshConfig {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
  z: -1 | 0 | 1;
  size?: number;
  spacing?: number;
}

export class CubieMesh {
  public group: THREE.Group;
  public readonly initialPos: THREE.Vector3;
  private stickerMeshes: Partial<Record<Face, THREE.Mesh>> = {};
  private stickerMaterials: Partial<Record<Face, THREE.MeshStandardMaterial>> = {};

  constructor(config: CubieMeshConfig) {
    const { x, y, z, size = 0.95, spacing = 1.0 } = config;
    this.initialPos = new THREE.Vector3(x * spacing, y * spacing, z * spacing);

    this.group = new THREE.Group();
    this.group.position.copy(this.initialPos);

    // 1. Black Plastic Body
    const bodyGeometry = new THREE.BoxGeometry(size, size, size);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x121418,
      roughness: 0.8,
      metalness: 0.1,
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.group.add(bodyMesh);

    // 2. Add exterior sticker planes with high-quality physical shading
    const stickerGeom = new THREE.PlaneGeometry(size * 0.88, size * 0.88);
    const offset = size / 2 + 0.001; // Tiny epsilon above plastic surface to avoid z-fighting

    // +X (Right face)
    if (x === 1) {
      this.addSticker('R', stickerGeom, offset, new THREE.Euler(0, Math.PI / 2, 0), 'red');
    }
    // -X (Left face)
    if (x === -1) {
      this.addSticker('L', stickerGeom, -offset, new THREE.Euler(0, -Math.PI / 2, 0), 'orange');
    }
    // +Y (Up face)
    if (y === 1) {
      this.addSticker('U', stickerGeom, offset, new THREE.Euler(-Math.PI / 2, 0, 0), 'white');
    }
    // -Y (Down face)
    if (y === -1) {
      this.addSticker('D', stickerGeom, -offset, new THREE.Euler(Math.PI / 2, 0, 0), 'yellow');
    }
    // +Z (Front face)
    if (z === 1) {
      this.addSticker('F', stickerGeom, offset, new THREE.Euler(0, 0, 0), 'green');
    }
    // -Z (Back face)
    if (z === -1) {
      this.addSticker('B', stickerGeom, -offset, new THREE.Euler(0, Math.PI, 0), 'blue');
    }
  }

  private addSticker(
    face: Face,
    geometry: THREE.PlaneGeometry,
    posOffset: number,
    rotation: THREE.Euler,
    defaultColor: CubeColor
  ): void {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(COLOR_HEX[defaultColor]),
      roughness: 0.35,
      metalness: 0.05,
    });

    const mesh = new THREE.Mesh(geometry, mat);

    if (face === 'R' || face === 'L') {
      mesh.position.set(posOffset, 0, 0);
    } else if (face === 'U' || face === 'D') {
      mesh.position.set(0, posOffset, 0);
    } else {
      mesh.position.set(0, 0, posOffset);
    }

    mesh.rotation.copy(rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.group.add(mesh);
    this.stickerMeshes[face] = mesh;
    this.stickerMaterials[face] = mat;
  }

  /**
   * Updates sticker color dynamically.
   */
  public setStickerColor(face: Face, color: CubeColor): void {
    const mat = this.stickerMaterials[face];
    if (mat) {
      mat.color.set(COLOR_HEX[color]);
    }
  }

  public dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry) obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else if (obj.material) {
          obj.material.dispose();
        }
      }
    });
  }
}
