/**
 * Cubyntra - Not Found Page
 * Necookie Labs (c) 2026
 */

import Link from 'next/link';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] grid place-items-center p-6">
      <div className="w-full max-w-md flex flex-col items-center gap-5 text-center">
        <div className="w-14 h-14 rounded-xl bg-neutral-900 border border-neutral-700 p-1.5 grid grid-cols-3 gap-1" aria-hidden>
          {['bg-red-600', 'bg-sky-500', 'bg-amber-400', 'bg-emerald-500', 'bg-neutral-700', 'bg-orange-500', 'bg-sky-500', 'bg-emerald-500', 'bg-red-600'].map(
            (c, i) => (
              <span key={i} className={`rounded-sm ${c}`} />
            )
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-mono uppercase tracking-widest text-sky-400">404</p>
          <h1 className="text-xl font-bold tracking-tight text-white">This page doesn’t exist</h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            The link may be old or mistyped. If you were pairing a phone, scan the QR code on your computer again.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-neutral-950 text-sm font-bold hover:bg-neutral-200 transition-colors"
        >
          <Home className="w-4 h-4" />
          Back to home
        </Link>
      </div>
    </main>
  );
}
