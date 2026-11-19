'use client';

/**
 * Cubyntra - Account panel (hosted modes only, ADR-017)
 * Necookie Labs (c) 2026
 *
 * Asks the unauthenticated `/api/health` which auth mode the server runs in. On the laptop
 * (`local`) it renders nothing. Hosted, it offers Sign out: passcode mode clears the session
 * cookie (`POST /api/auth/signout`) and goes to `/signin`; Cloudflare Access mode goes to
 * Access's own logout page.
 */

import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { BlockButton, Panel } from '@/components/ui';
import { PageSection } from '@/components/shell/Page';
import { resetAppTokenCache } from '@/app-shell/appToken';

const ACCESS_LOGOUT_URL = '/cdn-cgi/access/logout';
const SIGN_IN_URL = '/signin';

type Mode = 'local' | 'cloudflare-access' | 'passcode' | 'invalid' | null;

export function AccountPanel() {
  const [mode, setMode] = useState<Mode>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/health', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { mode?: Mode } | null) => {
        if (alive) setMode(body?.mode ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (mode !== 'passcode' && mode !== 'cloudflare-access') return null;

  const signOut = async () => {
    resetAppTokenCache();
    if (mode === 'passcode') await fetch('/api/auth/signout', { method: 'POST', cache: 'no-store' }).catch(() => {});
    // A full page load on purpose: it drops the signed-out person's profile from memory, and
    // Access's logout page is served by Cloudflare, not by this app.
    window.location.assign(mode === 'cloudflare-access' ? ACCESS_LOGOUT_URL : SIGN_IN_URL);
  };

  return (
    <PageSection title="Account">
      <Panel className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink">Signed in on this device. Your progress is saved on the server under your name.</p>
        <BlockButton icon={<LogOut aria-hidden className="h-4 w-4" />} onClick={signOut}>
          Sign out
        </BlockButton>
      </Panel>
    </PageSection>
  );
}
