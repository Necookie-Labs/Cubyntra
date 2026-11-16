/**
 * Cubyntra - Spotlight Selection & Target-Slot Outline
 * Necookie Labs (c) 2026
 *
 * The teaching twin keeps the pieces a step is about at full color and fades the rest. Pieces
 * are named by position in the twin's logical frame: x = -1 (L) .. 1 (R), y = -1 (D) .. 1 (U),
 * z = -1 (B) .. 1 (F). The engine re-applies the spotlight after every turn, so it always
 * marks positions, not particular physical pieces.
 */

import * as THREE from 'three';

export type PiecePosition = readonly [number, number, number];

export interface SpotlightPiece {
  position: PiecePosition;
}

function assertPosition(p: PiecePosition): void {
  if (p.length !== 3 || !p.every((c) => c === -1 || c === 0 || c === 1)) {
    throw new Error(`Not a cubie position: [${p.join(', ')}]`);
  }
}

export function positionKey(p: PiecePosition): string {
  return `${p[0]},${p[1]},${p[2]}`;
}

/** The set of lit positions, or null for "no spotlight" (everything lit). */
export function spotlightKeys(pieces: readonly SpotlightPiece[] | null): ReadonlySet<string> | null {
  if (pieces === null) return null;
  return new Set(
    pieces.map(({ position }) => {
      assertPosition(position);
      return positionKey(position);
    })
  );
}

/** Whether the cubie at `position` keeps full color under the spotlight `keys`. */
export function isSpotlit(position: PiecePosition, keys: ReadonlySet<string> | null): boolean {
  return keys === null || keys.has(positionKey(position));
}

/** Outer edge of the outline box: just outside a cubie with its tiles. */
const OUTLINE_SIZE = 1.12;
const BAR = 0.06;

/**
 * A flat outline box around one cubie position: twelve square bars in one unlit color, the voxel
 * version of a wireframe (WebGL lines are one pixel wide on most platforms).
 */
export class SlotOutline {
  public readonly group = new THREE.Group();
  private readonly bar: THREE.BoxGeometry;
  private readonly material: THREE.MeshBasicMaterial;

  constructor(colorHex: string) {
    this.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex) });
    this.bar = new THREE.BoxGeometry(1, 1, 1);
    const h = OUTLINE_SIZE / 2;
    const len = OUTLINE_SIZE + BAR;
    for (const axis of [0, 1, 2]) {
      for (const a of [-h, h]) {
        for (const b of [-h, h]) {
          const mesh = new THREE.Mesh(this.bar, this.material);
          const scale = [BAR, BAR, BAR];
          scale[axis] = len;
          mesh.scale.set(scale[0], scale[1], scale[2]);
          const pos = [0, 0, 0];
          pos[(axis + 1) % 3] = a;
          pos[(axis + 2) % 3] = b;
          mesh.position.set(pos[0], pos[1], pos[2]);
          this.group.add(mesh);
        }
      }
    }
    this.group.visible = false;
  }

  /** Shows the outline around `position`, or hides it for null. */
  public setPosition(position: PiecePosition | null): void {
    if (position === null) {
      this.group.visible = false;
      return;
    }
    assertPosition(position);
    this.group.position.set(position[0], position[1], position[2]);
    this.group.visible = true;
  }

  public setColor(hex: string): void {
    this.material.color.set(hex);
  }

  public dispose(): void {
    this.group.removeFromParent();
    this.bar.dispose();
    this.material.dispose();
  }
}
