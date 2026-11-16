/**
 * Cubyntra - PWA manifest and icons
 * Necookie Labs (c) 2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../src/app/manifest';
import { APP_METADATA as metadata, APP_VIEWPORT as viewport } from '../src/app/appMetadata';
import { APP_CHROME_HEX } from '../src/lib/tokens';
import { ICONS, encodePng, renderIcon } from '../scripts/generate-icons';

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): [number, number] {
  const bytes = fs.readFileSync(file);
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

const publicPath = (src: string) => path.join(__dirname, '..', 'public', src);

describe('web app manifest', () => {
  const m = manifest();

  it('installs as a standalone, portrait app named Cubyntra', () => {
    expect(m.name).toBe('Cubyntra');
    expect(m.short_name).toBe('Cubyntra');
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.orientation).toBe('portrait-primary');
  });

  it('takes its colors from the tokens', () => {
    expect(m.background_color).toBe(APP_CHROME_HEX.light.ground);
    expect(m.theme_color).toBe(APP_CHROME_HEX.light.ground);
  });

  it('lists 192 and 512 icons plus a maskable one, and every file exists at its size', () => {
    const icons = m.icons ?? [];
    expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of icons) {
      const [w, h] = pngSize(publicPath(icon.src));
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
  });

  it('has an apple-touch icon in the layout metadata, and theme colors per scheme', () => {
    const apple = (metadata.icons as { apple?: string }).apple;
    expect(apple).toBe('/icons/apple-touch-icon.png');
    expect(pngSize(publicPath(apple!))).toEqual([180, 180]);
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: APP_CHROME_HEX.light.ground },
      { media: '(prefers-color-scheme: dark)', color: APP_CHROME_HEX.dark.ground },
    ]);
  });
});

describe('icon generator', () => {
  it('produces the committed icons exactly (run scripts/generate-icons.ts after changing them)', () => {
    for (const icon of ICONS) {
      const png = encodePng(icon.size, icon.size, renderIcon(icon.size, icon.scale));
      expect(png.equals(fs.readFileSync(publicPath(`icons/${icon.file}`))), icon.file).toBe(true);
    }
  });
});
