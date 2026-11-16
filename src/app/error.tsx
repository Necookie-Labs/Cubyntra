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
import { BlockButton } from '@/components/ui';

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('[Cubyntra] Unhandled error:', error);
  }, [error]);

  return (
    <main className="min-h-[100dvh] grid place-items-center p-6">
      <div className="vx-panel vx-place w-full max-w-md p-6 pb-7 flex flex-col items-center gap-4 text-center">
        <div aria-hidden data-variant="danger" className="vx-block flex h-12 w-12 items-center justify-center pb-1">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl text-ink">Something went wrong</h1>
          <p className="text-sm text-muted leading-relaxed">
            Cubyntra hit an unexpected error. Trying again usually fixes it; if not, head back to the start.
          </p>
          {error.digest && <p className="text-xs font-mono text-muted">Reference: {error.digest}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <BlockButton variant="primary" onClick={() => retry()} icon={<RefreshCw className="w-4 h-4" aria-hidden />}>
            Try again
          </BlockButton>
          <Link href="/" className="vx-block inline-flex h-10 items-center gap-2 px-4 pb-1 text-sm font-bold">
            <Home className="w-4 h-4" aria-hidden />
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
