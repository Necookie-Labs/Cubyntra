'use client';

/**
 * Cubyntra - Root Error Boundary
 * Necookie Labs (c) 2026
 *
 * Replaces the root layout when it crashes, so it cannot rely on the app's stylesheet.
 * Styled inline and following the OS color scheme.
 */

import { useEffect } from 'react';

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('[Cubyntra] Root layout error:', error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>Something went wrong · Cubyntra</title>
        <style>{`
          :root { color-scheme: light dark; --bg:#f7f8fa; --fg:#0f172a; --muted:#475569; --btn-bg:#0f172a; --btn-fg:#fff; }
          @media (prefers-color-scheme: dark) { :root { --bg:#0a0b0d; --fg:#f8fafc; --muted:#94a3b8; --btn-bg:#fff; --btn-fg:#0a0b0d; } }
          body { margin:0; min-height:100dvh; display:grid; place-items:center; background:var(--bg); color:var(--fg);
                 font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
          .card { max-width: 26rem; padding: 1.5rem; text-align:center; display:flex; flex-direction:column; gap:1rem; }
          h1 { margin:0; font-size:1.25rem; } p { margin:0; color:var(--muted); line-height:1.5; font-size:.9rem; }
          .row { display:flex; gap:.5rem; justify-content:center; flex-wrap:wrap; }
          button, a { font: inherit; font-size:.875rem; font-weight:700; padding:.6rem 1rem; border-radius:.75rem; cursor:pointer; text-decoration:none; }
          button { background:var(--btn-bg); color:var(--btn-fg); border:0; }
          a { color:var(--fg); border:1px solid color-mix(in srgb, var(--fg) 25%, transparent); }
        `}</style>
      </head>
      <body>
        <main className="card">
          <h1>Something went wrong</h1>
          <p>Cubyntra could not start. Trying again usually fixes it.</p>
          <div className="row">
            <button type="button" onClick={() => retry()}>
              Try again
            </button>
            {/* A full page load: the app's router is not available when the root layout failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Back to home</a>
          </div>
        </main>
      </body>
    </html>
  );
}
