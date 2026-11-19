/**
 * Cubyntra - Sign-In Page (passcode mode, ADR-017)
 * Necookie Labs (c) 2026
 *
 * Outside the app shell, so nothing asks for a token before the person is signed in. In the
 * other auth modes there is nothing to sign in to, and the page says so.
 */

import Link from 'next/link';
import { CubeGlyph } from '@/components/branding/CubeGlyph';
import { SignInForm } from '@/components/auth/SignInForm';
import { authMode } from '@/lib/authMode';

export const dynamic = 'force-dynamic';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  const passcode = authMode() === 'passcode';
  return (
    <main className="min-h-[100dvh] grid place-items-center p-6">
      <div className="vx-panel vx-place w-full max-w-md p-6 pb-7 flex flex-col items-center gap-4 text-center">
        <CubeGlyph className="w-16 h-16" />
        <h1 className="text-2xl text-ink">Sign in to Cubyntra</h1>
        {passcode ? (
          <SignInForm next={typeof next === 'string' ? next : undefined} />
        ) : (
          <>
            <p className="text-sm text-muted leading-relaxed">There is no sign-in on this Cubyntra.</p>
            <Link href="/" data-variant="primary" className="vx-block inline-flex h-10 items-center px-4 pb-1 text-sm font-bold">
              Back to home
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
