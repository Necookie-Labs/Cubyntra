/**
 * Cubyntra - Web App Manifest (served at /manifest.webmanifest)
 * Necookie Labs (c) 2026
 *
 * Lets a phone add Cubyntra to its home screen and open it full screen, in portrait. Colors
 * are the light theme's ground and ink tokens; icons come from scripts/generate-icons.ts.
 */

import type { MetadataRoute } from 'next';
import { APP_CHROME_HEX } from '@/lib/tokens';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cubyntra',
    short_name: 'Cubyntra',
    description: 'Learn to solve your own Rubik’s Cube, one checked step at a time.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: APP_CHROME_HEX.light.ground,
    theme_color: APP_CHROME_HEX.light.ground,
    categories: ['education', 'games'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
