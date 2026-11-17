/**
 * Cubyntra - Focus ring only on controls (user-flow audit)
 * Necookie Labs (c) 2026
 *
 * Code moves focus to a new step's heading, the mismatch heading, a dialog or <main>
 * (tabindex="-1") so the next Tab starts in the right place. The global ring is unlayered CSS,
 * which beats Tailwind's `outline-none`, so the step heading showed a blue box on every load.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');

describe('focus ring', () => {
  it('rings every focused control', () => {
    expect(css).toMatch(/(^|\n):focus-visible \{\n {2}outline: 2px solid var\(--vx-focus\);/);
  });

  it('leaves out elements that only take focus from code', () => {
    expect(css).toMatch(/\[tabindex='-1'\]:focus-visible \{\n {2}outline: none;\n\}/);
    // It is more specific than the ring and comes after it.
    expect(css.indexOf("[tabindex='-1']:focus-visible")).toBeGreaterThan(css.indexOf(':focus-visible {'));
  });
});
