/**
 * Cubyntra - A Teaching Surface Without WebGL
 *
 * A real PlaybackController over a driver whose turns finish at once, plus spies for every
 * teaching aid, for testing React bindings of the teaching twin.
 */

import { vi } from 'vitest';
import type { Grip } from '../../src/cube/grip';
import { PlaybackController } from '../../src/three/playback';
import type { TeachingSurface } from '../../src/twin/teaching';

export function fakeTeachingSurface() {
  let grip: Grip | null = null;
  const driver = { animateMove: vi.fn(async () => {}), requestSync: vi.fn() };
  const surface = {
    playback: new PlaybackController(driver, { sleep: async () => {} }),
    setGrip: vi.fn((g: Grip | null) => {
      grip = g;
    }),
    getGrip: () => grip,
    setSpotlight: vi.fn(),
    setSlotOutline: vi.fn(),
    setGhostState: vi.fn(),
    setMoveArrow: vi.fn(),
  } satisfies TeachingSurface;
  return { surface, driver };
}
