'use client';

/**
 * Cubyntra - Passcode Sign-In Form (ADR-017)
 * Necookie Labs (c) 2026
 *
 * Shown at `/signin` in the `passcode` auth mode. Posts the name and access code to
 * `/api/auth/signin`, which sets the session cookie, then goes to `next` (a same-site path
 * only) or home. Use the same name on the phone so pairing finds your session.
 */

import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { BlockButton } from '@/components/ui';

/** Only a local path is followed after sign-in, never another site. */
export function safeNext(raw: string | null | undefined): string {
  // "//host" and "/\host" are read by browsers as another site.
  if (!raw || !raw.startsWith('/') || /^\/[/\\]/.test(raw)) return '/';
  return raw;
}

export function SignInForm({ next }: { next?: string }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code }),
        cache: 'no-store',
      });
      if (res.ok) {
        window.location.assign(safeNext(next));
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Sign-in failed. Try again.');
    } catch {
      setError('Could not reach Cubyntra. Check your connection.');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-4 text-left" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signin-name" className="text-xs font-bold uppercase tracking-wider text-muted">
          Your name
        </label>
        <input
          id="signin-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="username"
          maxLength={40}
          required
          className="h-12 rounded-md border-2 border-line bg-well px-3.5 text-base text-ink"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signin-code" className="text-xs font-bold uppercase tracking-wider text-muted">
          Access code
        </label>
        <input
          id="signin-code"
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'signin-error' : undefined}
          className="h-12 rounded-md border-2 border-line bg-well px-3.5 text-base text-ink"
        />
      </div>
      {error && (
        <p id="signin-error" role="alert" className="rounded-md border-2 border-warn-edge bg-warn-soft p-3 text-sm text-ink">
          {error}
        </p>
      )}
      <BlockButton type="submit" variant="primary" size="lg" fullWidth disabled={busy || !name.trim() || !code} icon={<LogIn className="w-4 h-4" aria-hidden />}>
        {busy ? 'Signing in…' : 'Sign in'}
      </BlockButton>
      <p className="text-xs text-muted leading-relaxed">
        Use the same name on your phone, so it can pair with your session.
      </p>
    </form>
  );
}
