/**
 * Cubyntra - Three.js Speedcube Physical Cubie Construction & Material Management
 * Necookie Labs (c) 2026
 *
 * Implements high-precision speedcube geometry:
 * - Rounded chamfered cubie body (ExtrudeGeometry with bevel)
 * - 3D rounded beveled tiles with clearcoat specular reflections
 * - Authentic speedcube competition color palette
 * - Shared geometry reuse across 27 cubies for zero memory waste
 */

import * as THREE from 'three';
import { CubeColor, Face } from '../cube/types';
import { COLOR_HEX } from '../cube/constants';

/**
 * Authentic speedcube competition color palette optimized for PBR lighting.
 */
export const SPEEDCUBE_COLORS: Record<CubeColor, string> = {
  white: '#f4f5f0',
  yellow: '#ffd500',
  green: '#00b35c',
  blue: '#0a5cff',
  red: '#e8132e',
  orange: '#ff7a00',
};

/**
 * Creates rounded chamfered cubie body geometry.
 */
export function createRoundedBoxGeometry(
  size = 0.985,
  radius = 0.11,
  smooth = 5
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const eps = 0.00001;
  const r = radius - eps;
  const s = size;
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, s - r * 2, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(s - r * 2, s - r * 2, eps, Math.PI / 2, 0, true);
  shape.absarc(s - r * 2, eps, eps, 0, -Math.PI / 2, true);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: s - radius * 2,
    bevelEnabled: true,
    bevelSegments: smooth * 2,
    steps: 1,
    bevelSize: r,
    bevelThickness: radius,
    curveSegments: smooth,
  });
  geom.center();
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates realistic rounded 3D beveled tile geometry.
 */
export function createRoundedTileGeometry(
  size = 0.84,
  radius = 0.13,
  depth = 0.018
): THREE.BufferGeometry {
  const h = size / 2;
  const r = radius;
  const sh = new THREE.Shape();
  sh.moveTo(-h + r, -h);
  sh.lineTo(h - r, -h);
  sh.quadraticCurveTo(h, -h, h, -h + r);
  sh.lineTo(h, h - r);
  sh.quadraticCurveTo(h, h, h - r, h);
  sh.lineTo(-h + r, h);
  sh.quadraticCurveTo(-h, h, -h, h - r);
  sh.lineTo(-h, -h + r);
  sh.quadraticCurveTo(-h, -h, -h + r, -h);

  const geom = new THREE.ExtrudeGeometry(sh, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geom.computeVertexNormals();
  return geom;
}

// Module-level shared geometry singletons for maximum WebGL memory efficiency
let sharedBodyGeom: THREE.BufferGeometry | null = null;
let sharedTileGeom: THREE.BufferGeometry | null = null;

export function getSharedBodyGeometry(): THREE.BufferGeometry {
  if (!sharedBodyGeom) {
    sharedBodyGeom = createRoundedBoxGeometry(0.985, 0.11, 5);
  }
  return sharedBodyGeom;
}

export function getSharedTileGeometry(): THREE.BufferGeometry {
  if (!sharedTileGeom) {
    sharedTileGeom = createRoundedTileGeometry(0.84, 0.13, 0.018);
  }
  return sharedTileGeom;
}

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
  private stickerMaterials: Partial<Record<Face, THREE.MeshPhysicalMaterial>> = {};

  constructor(config: CubieMeshConfig) {
    const { x, y, z, size = 0.985, spacing = 1.0 } = config;
    this.initialPos = new THREE.Vector3(x * spacing, y * spacing, z * spacing);

    this.group = new THREE.Group();
    this.group.position.copy(this.initialPos);

    // 1. High-Precision Matte Black Speedcube Body
    const bodyGeometry = getSharedBodyGeometry();
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x15161b,
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0.25,
      clearcoatRoughness: 0.5,
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.group.add(bodyMesh);

    // 2. High-Precision 3D Rounded Facelet Tiles
    const tileGeometry = getSharedTileGeometry();
    const offset = size / 2 - 0.004;

    // +X (Right face)
    if (x === 1) {
      this.addSticker('R', tileGeometry, offset, new THREE.Euler(0, Math.PI / 2, 0), 'red', 'x', 1);
    }
    // -X (Left face)
    if (x === -1) {
      this.addSticker('L', tileGeometry, offset, new THREE.Euler(0, -Math.PI / 2, 0), 'orange', 'x', -1);
    }
    // +Y (Up face)
    if (y === 1) {
      this.addSticker('U', tileGeometry, offset, new THREE.Euler(-Math.PI / 2, 0, 0), 'white', 'y', 1);
    }
    // -Y (Down face)
    if (y === -1) {
      this.addSticker('D', tileGeometry, offset, new THREE.Euler(Math.PI / 2, 0, 0), 'yellow', 'y', -1);
    }
    // +Z (Front face)
    if (z === 1) {
      this.addSticker('F', tileGeometry, offset, new THREE.Euler(0, 0, 0), 'green', 'z', 1);
    }
    // -Z (Back face)
    if (z === -1) {
      this.addSticker('B', tileGeometry, offset, new THREE.Euler(0, Math.PI, 0), 'blue', 'z', -1);
    }
  }

  private addSticker(
    face: Face,
    geometry: THREE.BufferGeometry,
    posOffset: number,
    rotation: THREE.Euler,
    defaultColor: CubeColor,
    axis: 'x' | 'y' | 'z',
    sign: number
  ): void {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(SPEEDCUBE_COLORS[defaultColor] || COLOR_HEX[defaultColor]),
      roughness: 0.32,
      metalness: 0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.9,
    });

    const mesh = new THREE.Mesh(geometry, mat);
    mesh.rotation.copy(rotation);

    if (axis === 'x') {
      mesh.position.set(sign * posOffset, 0, 0);
    } else if (axis === 'y') {
      mesh.position.set(0, sign * posOffset, 0);
    } else {
      mesh.position.set(0, 0, sign * posOffset);
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.group.add(mesh);
    this.stickerMeshes[face] = mesh;
    this.stickerMaterials[face] = mat;
  }

  /**
   * Updates sticker color dynamically from logical cube state.
   */
  public setStickerColor(face: Face, color: CubeColor): void {
    const mat = this.stickerMaterials[face];
    if (mat) {
      mat.color.set(SPEEDCUBE_COLORS[color] || COLOR_HEX[color]);
    }
  }

  public dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        // Do not dispose shared geometries here to allow multi-instance or reuse
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else if (obj.material) {
          obj.material.dispose();
        }
      }
    });
  }
}
