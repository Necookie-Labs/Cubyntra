import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP_CHROME_HEX,
  FADE_WASH_HEX,
  STICKER_CORE_HEX,
  STICKER_HEX,
  TWIN_THEME_HEX,
} from '../src/lib/tokens';

const css = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');

/** Token values declared in the first block whose selector is exactly `selector`. */
function tokenValues(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--vx-[\w-]+)\s*:\s*(#[0-9a-fA-F]+)/g)) out[m[1]] = m[2].toUpperCase();
  return out;
}

describe('src/lib/tokens mirrors globals.css', () => {
  const light = tokenValues(':root');
  const dark = { ...light, ...tokenValues(':root[data-theme="dark"]') };

  it('sticker colors match --vx-sticker-*', () => {
    for (const [color, hex] of Object.entries(STICKER_HEX)) {
      expect(light[`--vx-sticker-${color}`], color).toBe(hex.toUpperCase());
    }
    expect(light['--vx-sticker-core']).toBe(STICKER_CORE_HEX.toUpperCase());
  });

  it('theme tokens match each theme', () => {
    for (const [theme, values] of [['light', light], ['dark', dark]] as const) {
      expect(TWIN_THEME_HEX[theme].ink, theme).toBe(values['--vx-ink']);
      expect(TWIN_THEME_HEX[theme].focus, theme).toBe(values['--vx-focus']);
    }
  });

  it('app chrome colors match the ground and ink tokens; the twin wash is the light ground', () => {
    for (const [theme, values] of [['light', light], ['dark', dark]] as const) {
      expect(APP_CHROME_HEX[theme].ground, theme).toBe(values['--vx-ground']);
      expect(APP_CHROME_HEX[theme].ink, theme).toBe(values['--vx-ink']);
    }
    expect(FADE_WASH_HEX).toBe(light['--vx-ground']);
  });
});
