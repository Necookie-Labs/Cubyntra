/**
 * Cubyntra - Reduced motion: the OS setting and the student's own setting do the same
 * Necookie Labs (c) 2026
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');

/** The body of the `@media (prefers-reduced-motion: reduce)` block. */
function mediaBlock(): string {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(start, i);
  }
  throw new Error('unclosed block');
}

describe('reduced motion', () => {
  const media = mediaBlock();
  const student = css.slice(css.indexOf(':root[data-motion="reduce"] *,'));

  it.each(['animation-duration: 0.01ms !important', 'animation-iteration-count: 1 !important', 'transition-duration: 0.01ms !important'])(
    'both cut every animation and transition (%s)',
    (rule) => {
      expect(media).toContain(rule);
      expect(student).toContain(rule);
    }
  );

  it('both stop the hover lift on blocks', () => {
    const lift = '.vx-block:hover:not(:disabled):not([data-variant="ghost"]) {\n    transform: none;';
    expect(media).toContain(lift);
    expect(student).toContain(':root[data-motion="reduce"] .vx-block:hover:not(:disabled):not([data-variant="ghost"]) {\n  transform: none;');
  });
});
