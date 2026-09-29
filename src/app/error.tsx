'use client';

/**
 * Cubyntra - Page Error Boundary
 * Necookie Labs (c) 2026
 *
 * Catches a crash anywhere below the root layout and offers a way forward instead of a blank
 * page.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('[Cubyntra] Unhandled error:', error);
  }, [error]);

  return (
    <main className="min-h-[100dvh] grid place-items-center p-6">
      <div className="w-full max-w-md flex flex-col items-center gap-5 text-center">
        <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-800/60">
          <AlertTriangle className="w-7 h-7 text-rose-300" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold tracking-tight text-white">Something went wrong</h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Cubyntra hit an unexpected error. Trying again usually fixes it; if not, head back to the start.
          </p>
          {error.digest && <p className="text-[11px] font-mono text-neutral-500">Reference: {error.digest}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-neutral-950 text-sm font-bold hover:bg-neutral-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-700 text-neutral-200 text-sm font-semibold hover:bg-neutral-800 transition-colors"
          >
            <Home className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
