/**
 * Cubyntra - Voxel Cubie Construction & Shared Materials
 * Necookie Labs (c) 2026
 *
 * The twin is drawn in the flat voxel style of ADR-011:
 * - Every cubie is a plain box in the core color, with a chunky raised tile per visible side.
 * - Materials are Lambert (diffuse only): no specular, clearcoat, environment map or tone
 *   mapping. Under the engine's fixed light rig each face direction therefore gets one flat
 *   tone, so the cube reads as 3D without gradients or gloss.
 * - Colors come from the design tokens (src/lib/tokens.ts mirrors globals.css).
 * - One VoxelKit holds every geometry and material the cubies share: 2 geometries and
 *   14 materials for all 27 cubies. The engine owns the kit and disposes it.
 */

import * as THREE from 'three';
import { CubeColor, CubeState, Face } from '../cube/types';
import { STICKER_CORE_HEX, STICKER_HEX } from '../lib/tokens';

/** Edge length of a cubie body. The 0.02 gap to the next cubie shows as a dark seam. */
export const CUBIE_SIZE = 0.98;
/** Tile footprint and thickness: thick enough to read as a separate block. */
export const TILE_SIZE = 0.82;
export const TILE_DEPTH = 0.05;
/** Opacity of cubies outside the spotlight (GOAL Phase 4: 35%). */
export const FADED_OPACITY = 0.35;

const COLORS: readonly CubeColor[] = ['white', 'yellow', 'red', 'orange', 'blue', 'green'];

export interface VoxelKitOptions {
  /** Opacity used by `sticker(color, true)` and `bodyMaterial(true)`. */
  fadedOpacity?: number;
}

function flatMaterial(hex: string, opacity: number | null): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), flatShading: true });
  if (opacity !== null) {
    mat.transparent = true;
    mat.opacity = opacity;
    // Faded pieces must not hide the lit pieces behind them.
    mat.depthWrite = false;
  }
  return mat;
}

/**
 * The geometries and materials shared by a set of cubies. Swapping a mesh between materials
 * (rather than recoloring one material per tile) keeps the material count fixed.
 */
export class VoxelKit {
  public readonly bodyGeometry: THREE.BoxGeometry;
  public readonly tileGeometry: THREE.BoxGeometry;
  public readonly fadedOpacity: number;
  private readonly body: THREE.MeshLambertMaterial;
  private readonly bodyFaded: THREE.MeshLambertMaterial;
  private readonly stickers = new Map<CubeColor, THREE.MeshLambertMaterial>();
  private readonly stickersFaded = new Map<CubeColor, THREE.MeshLambertMaterial>();
  private disposed = false;

  constructor(options: VoxelKitOptions = {}) {
    this.fadedOpacity = options.fadedOpacity ?? FADED_OPACITY;
    this.bodyGeometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
    this.tileGeometry = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_DEPTH);
    this.body = flatMaterial(STICKER_CORE_HEX, null);
    this.bodyFaded = flatMaterial(STICKER_CORE_HEX, this.fadedOpacity);
    for (const color of COLORS) {
      this.stickers.set(color, flatMaterial(STICKER_HEX[color], null));
      this.stickersFaded.set(color, flatMaterial(STICKER_HEX[color], this.fadedOpacity));
    }
  }

  public bodyMaterial(faded = false): THREE.MeshLambertMaterial {
    return faded ? this.bodyFaded : this.body;
  }

  public sticker(color: CubeColor, faded = false): THREE.MeshLambertMaterial {
    return (faded ? this.stickersFaded : this.stickers).get(color)!;
  }

  /** Every material, for disposal and for re-upload after a lost WebGL context. */
  public materials(): THREE.Material[] {
    return [this.body, this.bodyFaded, ...this.stickers.values(), ...this.stickersFaded.values()];
  }

  /** Marks every material for recompilation (used after the WebGL context is restored). */
  public invalidate(): void {
    for (const m of this.materials()) m.needsUpdate = true;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bodyGeometry.dispose();
    this.tileGeometry.dispose();
    for (const m of this.materials()) m.dispose();
  }
}

export interface CubieMeshConfig {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
  z: -1 | 0 | 1;
  spacing?: number;
}

/** Outward direction and tile rotation for the side each face is built on. */
const TILE_SIDES: Record<Face, { normal: [number, number, number]; rotation: THREE.Euler; color: CubeColor }> = {
  R: { normal: [1, 0, 0], rotation: new THREE.Euler(0, Math.PI / 2, 0), color: 'red' },
  L: { normal: [-1, 0, 0], rotation: new THREE.Euler(0, -Math.PI / 2, 0), color: 'orange' },
  U: { normal: [0, 1, 0], rotation: new THREE.Euler(-Math.PI / 2, 0, 0), color: 'white' },
  D: { normal: [0, -1, 0], rotation: new THREE.Euler(Math.PI / 2, 0, 0), color: 'yellow' },
  F: { normal: [0, 0, 1], rotation: new THREE.Euler(0, 0, 0), color: 'green' },
  B: { normal: [0, 0, -1], rotation: new THREE.Euler(0, Math.PI, 0), color: 'blue' },
};

export class CubieMesh {
  public group: THREE.Group;
  public readonly initialPos: THREE.Vector3;
  private readonly kit: VoxelKit;
  private readonly body: THREE.Mesh;
  private stickerMeshes: Partial<Record<Face, THREE.Mesh>> = {};
  private stickerColors: Partial<Record<Face, CubeColor>> = {};
  private faded = false;

  constructor(config: CubieMeshConfig, kit: VoxelKit) {
    const { x, y, z, spacing = 1.0 } = config;
    this.kit = kit;
    this.initialPos = new THREE.Vector3(x * spacing, y * spacing, z * spacing);

    this.group = new THREE.Group();
    this.group.position.copy(this.initialPos);

    // The body sits at the cubie's origin; tests tell it from tiles by that.
    this.body = new THREE.Mesh(kit.bodyGeometry, kit.bodyMaterial());
    this.group.add(this.body);

    const coord = { x, y, z };
    for (const face of Object.keys(TILE_SIDES) as Face[]) {
      const side = TILE_SIDES[face];
      const axis = side.normal[0] !== 0 ? 'x' : side.normal[1] !== 0 ? 'y' : 'z';
      const sign = side.normal[0] + side.normal[1] + side.normal[2];
      if (coord[axis] === sign) this.addSticker(face);
    }
  }

  private addSticker(face: Face): void {
    const side = TILE_SIDES[face];
    const mesh = new THREE.Mesh(this.kit.tileGeometry, this.kit.sticker(side.color));
    mesh.rotation.copy(side.rotation);
    // The tile's back face sits just inside the body surface, so no seam shows between them.
    const offset = CUBIE_SIZE / 2 + TILE_DEPTH / 2 - 0.005;
    mesh.position.set(side.normal[0] * offset, side.normal[1] * offset, side.normal[2] * offset);
    this.group.add(mesh);
    this.stickerMeshes[face] = mesh;
    this.stickerColors[face] = side.color;
  }

  /**
   * Colors whichever tile currently points along `direction` (a unit axis in the parent
   * cube group's frame). Once a cubie has been turned, the tile built on its "U" side may
   * face Front, so repainting must follow where tiles point now, not how they were built.
   */
  public setColorFacing(direction: THREE.Vector3, color: CubeColor): void {
    const outward = new THREE.Vector3();
    for (const face of Object.keys(this.stickerMeshes) as Face[]) {
      const mesh = this.stickerMeshes[face]!;
      outward.copy(mesh.position).normalize().applyQuaternion(this.group.quaternion);
      if (outward.dot(direction) > 0.9) {
        this.setStickerColor(face, color);
        return;
      }
    }
  }

  /**
   * Updates the tile built on `face`. Only meaningful before any turn has rotated the
   * cubie; use setColorFacing to paint by current orientation.
   */
  public setStickerColor(face: Face, color: CubeColor): void {
    const mesh = this.stickerMeshes[face];
    if (!mesh) return;
    this.stickerColors[face] = color;
    mesh.material = this.kit.sticker(color, this.faded);
  }

  /** Fades the whole cubie (body and tiles) to the kit's faded opacity, or restores it. */
  public setFaded(faded: boolean): void {
    if (faded === this.faded) return;
    this.faded = faded;
    this.body.material = this.kit.bodyMaterial(faded);
    for (const face of Object.keys(this.stickerMeshes) as Face[]) {
      this.stickerMeshes[face]!.material = this.kit.sticker(this.stickerColors[face]!, faded);
    }
  }

  public isFaded(): boolean {
    return this.faded;
  }

  /** Geometries and materials belong to the shared VoxelKit; only the scene graph is released. */
  public dispose(): void {
    this.group.removeFromParent();
  }
}

const FACE_DIRECTION = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
} as const;

/**
 * Paints `cubies` (in their current positions and orientations) with a logical state. Tiles are
 * picked by the direction they face now, so this is correct after any number of turns.
 */
export function paintCubies(cubies: readonly CubieMesh[], state: CubeState): void {
  for (const cubie of cubies) {
    const pos = cubie.group.position;
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    const z = Math.round(pos.z);

    // Tiles are painted by the direction they face now, since turns rotate cubies.
    // U Face (+Y, y = 1)
    if (y === 1) {
      const col = x + 1;
      const row = z + 1;
      cubie.setColorFacing(FACE_DIRECTION.U, state.U[row * 3 + col]);
    }
    // D Face (-Y, y = -1)
    if (y === -1) {
      const col = x + 1;
      const row = 1 - z;
      cubie.setColorFacing(FACE_DIRECTION.D, state.D[row * 3 + col]);
    }
    // F Face (+Z, z = 1)
    if (z === 1) {
      const col = x + 1;
      const row = 1 - y;
      cubie.setColorFacing(FACE_DIRECTION.F, state.F[row * 3 + col]);
    }
    // B Face (-Z, z = -1)
    if (z === -1) {
      const col = 1 - x;
      const row = 1 - y;
      cubie.setColorFacing(FACE_DIRECTION.B, state.B[row * 3 + col]);
    }
    // R Face (+X, x = 1)
    if (x === 1) {
      const col = 1 - z;
      const row = 1 - y;
      cubie.setColorFacing(FACE_DIRECTION.R, state.R[row * 3 + col]);
    }
    // L Face (-X, x = -1)
    if (x === -1) {
      const col = z + 1;
      const row = 1 - y;
      cubie.setColorFacing(FACE_DIRECTION.L, state.L[row * 3 + col]);
    }
  }
}
