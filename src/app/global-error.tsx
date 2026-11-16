'use client';

/**
 * Cubyntra - Root Error Boundary
 * Necookie Labs (c) 2026
 *
 * Replaces the root layout when it crashes, so it brings its own document, stylesheet and
 * theme boot script (the layout's are not loaded). Plain elements only: no app components.
 */

import { useEffect } from 'react';
import './globals.css';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('[Cubyntra] Root layout error:', error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Something went wrong · Cubyntra</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-[100dvh] grid place-items-center p-6 bg-ground text-ink font-sans">
        <main className="vx-panel w-full max-w-md p-6 pb-7 flex flex-col gap-4 text-center">
          <h1 className="text-2xl">Something went wrong</h1>
          <p className="text-sm text-muted leading-relaxed">Cubyntra could not start. Trying again usually fixes it.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" data-variant="primary" className="vx-block h-10 px-4 pb-1 text-sm font-bold" onClick={() => retry()}>
              Try again
            </button>
            {/* A full page load: the app's router is not available when the root layout failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="vx-block inline-flex h-10 items-center px-4 pb-1 text-sm font-bold">
              Back to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
