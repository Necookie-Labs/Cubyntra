/**
 * Cubyntra - Not Found Page
 * Necookie Labs (c) 2026
 */

import Link from 'next/link';
import { Home } from 'lucide-react';
import { CubeGlyph } from '@/components/branding/CubeGlyph';
import { Chip } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] grid place-items-center p-6">
      <div className="vx-panel vx-place w-full max-w-md p-6 pb-7 flex flex-col items-center gap-4 text-center">
        <CubeGlyph className="w-16 h-16" />
        <Chip tone="warn" className="font-mono">404</Chip>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl text-ink">This page doesn’t exist</h1>
          <p className="text-sm text-muted leading-relaxed">
            The link may be old or mistyped. If you were pairing a phone, scan the QR code on your computer again.
          </p>
        </div>
        <Link href="/" data-variant="primary" className="vx-block inline-flex h-10 items-center gap-2 px-4 pb-1 text-sm font-bold">
          <Home className="w-4 h-4" aria-hidden />
          Back to home
        </Link>
      </div>
    </main>
  );
}
