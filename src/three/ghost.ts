/**
 * Cubyntra - "After" Preview Cube
 * Necookie Labs (c) 2026
 *
 * A small, faded second cube in the top-right corner of the view that shows the state the
 * current step should end in. A separate small cube reads better than a translucent overlay on
 * the twin: an overlay would sit on top of the very pieces the student is watching turn, and
 * two sets of colors in one place are hard to tell apart.
 *
 * The preview copies the twin's orientation (grip and orbit) every frame, so it shows exactly
 * what the twin will look like once the step has played.
 */

import * as THREE from 'three';
import type { CubeState } from '../cube/types';
import { CubieMesh, paintCubies, VoxelKit } from './cubie';

/** Size relative to the twin. */
export const GHOST_SCALE = 0.3;
/** Flat opacity of the whole preview. */
export const GHOST_OPACITY = 0.55;
/** Radius of the preview's bounding sphere (the twin's is 1.5 * sqrt 3). */
export const GHOST_RADIUS = 1.5 * Math.sqrt(3) * GHOST_SCALE;

type Coord = -1 | 0 | 1;

export class GhostCube {
  public readonly group = new THREE.Group();
  private readonly kit = new VoxelKit({ fadeStyle: 'transparent', fadedOpacity: GHOST_OPACITY });
  private readonly cubies: CubieMesh[] = [];
  private state: CubeState | null = null;

  constructor() {
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue; // the core is never seen
          const cubie = new CubieMesh({ x: x as Coord, y: y as Coord, z: z as Coord }, this.kit);
          cubie.setFaded(true);
          this.cubies.push(cubie);
          this.group.add(cubie.group);
        }
      }
    }
    this.group.scale.setScalar(GHOST_SCALE);
    this.group.visible = false;
  }

  /** Shows `state`, or hides the preview for null. */
  public setState(state: CubeState | null): void {
    this.state = state;
    this.group.visible = state !== null;
    if (state) paintCubies(this.cubies, state);
  }

  public getState(): CubeState | null {
    return this.state;
  }

  /** The preview's cubies, for repainting and tests. */
  public getCubies(): readonly CubieMesh[] {
    return this.cubies;
  }

  /**
   * Places the preview in the top-right corner of a view whose visible half extents at the
   * cube's depth are `halfWidth` x `halfHeight`, with a small margin.
   */
  public placeInCorner(halfWidth: number, halfHeight: number): void {
    const inset = GHOST_RADIUS * 1.1;
    this.group.position.set(halfWidth - inset, halfHeight - inset, 0);
  }

  /** Re-uploads materials after a lost WebGL context. */
  public invalidate(): void {
    this.kit.invalidate();
  }

  public dispose(): void {
    this.group.removeFromParent();
    this.kit.dispose();
  }
}
