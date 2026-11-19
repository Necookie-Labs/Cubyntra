/**
 * Cubyntra - Saved Cube Helpers
 * Necookie Labs (c) 2026
 *
 * Default names for saved cubes ("Scan · 19 Nov, 14:32", in the student's local time) and the
 * words the UI uses for where a cube came from. Pure TypeScript, no Node or DOM imports.
 */

import type { SavedCubeSource } from './studentProfile';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const two = (n: number) => String(n).padStart(2, '0');

/** "19 Nov, 14:32" in local time. */
export function shortDateTime(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** The name a cube gets when it is saved: "Scan · 19 Nov, 14:32" (or "Demo · ..."). */
export function defaultCubeName(source: SavedCubeSource, date: Date): string {
  return `${source === 'demo' ? 'Demo' : 'Scan'} · ${shortDateTime(date)}`;
}

/** How each source is named on the list. */
export const SOURCE_LABEL: Record<SavedCubeSource, string> = {
  webcam: 'Webcam scan',
  phone: 'Phone scan',
  demo: 'Demo cube',
};
