/**
 * Cubyntra - Document metadata and viewport
 * Necookie Labs (c) 2026
 *
 * Used by the root layout. Kept apart from layout.tsx (which loads fonts) so tests can check it.
 * The manifest link is added by Next from app/manifest.ts.
 */

import type { Metadata, Viewport } from 'next';
import { APP_CHROME_HEX } from '@/lib/tokens';

export const APP_METADATA: Metadata = {
  title: { default: 'Cubyntra', template: '%s · Cubyntra' },
  description:
    'A Rubik’s Cube tutor that runs on your own computer: scan your cube, follow the 3D twin step by step, and let the camera check each step. Camera images never leave the device that took them.',
  applicationName: 'Cubyntra',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Cubyntra',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

export const APP_VIEWPORT: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: APP_CHROME_HEX.light.ground },
    { media: '(prefers-color-scheme: dark)', color: APP_CHROME_HEX.dark.ground },
  ],
};
