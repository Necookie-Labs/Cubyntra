'use client';

/**
 * Cubyntra - Pair a phone
 * Necookie Labs (c) 2026
 *
 * The laptop side of state-only sync (ADR-015). The pairing lives in the app shell, so it
 * survives moving between screens: scan the cube with the phone on /scan, then follow the solve
 * on either device. The QR code carries the session id, secret and app token in its fragment;
 * the six-character code is the fallback when the camera cannot read the QR code.
 */

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Link2Off, Loader2, RefreshCw, ScanLine, Smartphone } from 'lucide-react';
import { BlockButton, Chip, Panel, cx, type ChipTone } from '@/components/ui';
import { BlockLink } from '@/components/shell/BlockLink';
import { PageContainer, PageHeader, PageSection } from '@/components/shell/Page';
import { useCompanion } from '@/sync/CompanionSyncProvider';
import { formatPairingCode } from '@/sync/pairingCode';

type Status = 'creating' | 'error' | 'ended' | 'phone' | 'waiting' | 'idle';

const STATUS: Record<Status, { tone: ChipTone; label: string; Icon: typeof Smartphone }> = {
  creating: { tone: 'neutral', label: 'Making a pairing code', Icon: Loader2 },
  error: { tone: 'danger', label: 'Could not make a code', Icon: AlertTriangle },
  ended: { tone: 'danger', label: 'Pairing ended', Icon: Link2Off },
  phone: { tone: 'solid', label: 'Phone connected', Icon: CheckCircle2 },
  waiting: { tone: 'warn', label: 'Waiting for your phone', Icon: Smartphone },
  idle: { tone: 'neutral', label: 'Not paired', Icon: Smartphone },
};

function minutesLeft(expiresAt: number | null): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 60_000));
}

export function PairView() {
  const companion = useCompanion();
  const {
    sessionId,
    qrDataUrl,
    code,
    codeExpiresAt,
    companionBaseUrl,
    availableIps,
    isCreating,
    sessionEnded,
    mobileConnected,
    error,
    initSession,
    selectHost,
    disconnect,
  } = companion;

  // Opening the page makes a pairing if there is none; after Unpair it waits to be asked.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    if (!sessionId && !isCreating) void initSession();
  }, [sessionId, isCreating, initSession]);

  const status: Status = isCreating
    ? 'creating'
    : error
      ? 'error'
      : sessionEnded
        ? 'ended'
        : mobileConnected
          ? 'phone'
          : sessionId
            ? 'waiting'
            : 'idle';
  const { tone, label, Icon } = STATUS[status];
  const insecure = companionBaseUrl?.startsWith('http://') ?? false;
  const left = minutesLeft(codeExpiresAt);

  return (
    <PageContainer width="lg">
      <PageHeader
        title="Pair your phone"
        lede="Use your phone as the camera while this screen shows the twin. Only colors and cube states travel between them, never photos."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel as="section" aria-labelledby="pair-code-title" className="flex flex-col items-center gap-6 p-6 pb-7">
          <div className="flex w-full items-center justify-between gap-2">
            <h2 id="pair-code-title" className="text-lg leading-tight text-ink">
              Scan this with the phone camera
            </h2>
            <Chip tone={tone} role="status" icon={<Icon aria-hidden className={cx('h-3.5 w-3.5', status === 'creating' && 'animate-spin')} />}>
              {label}
            </Chip>
          </div>

          {qrDataUrl && !sessionEnded ? (
            <div className="rounded-xl border-2 border-line-soft bg-qr-paper p-3 shadow-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Pairing QR code" className="h-56 w-56 [image-rendering:pixelated]" />
            </div>
          ) : (
            <div aria-hidden className="vx-well flex h-64 w-64 items-center justify-center rounded-xl">
              {status === 'creating' && (
                <span className="vx-loader">
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </div>
          )}

          {code && companionBaseUrl && !sessionEnded && (
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-sm text-muted">
                Can’t scan it? On the phone open <span className="font-mono text-ink">{companionBaseUrl}</span> and type
              </span>
              <span
                aria-label={`Pairing code ${code.split('').join(' ')}`}
                className="font-mono text-3xl font-bold tracking-widest text-ink"
              >
                {formatPairingCode(code)}
              </span>
              {left !== null && <span className="text-xs text-muted">Works once, for about {left} more minutes.</span>}
            </div>
          )}

          {status === 'idle' && (
            <BlockButton variant="primary" onClick={() => void initSession()} icon={<RefreshCw aria-hidden className="h-4 w-4" />}>
              Make a pairing code
            </BlockButton>
          )}

          {(error || sessionEnded) && (
            // A real error interrupts; an expired pairing is only a notice.
            <div role={error ? 'alert' : 'status'} className="flex flex-col items-center gap-3 text-center">
              <p className="max-w-sm text-sm text-ink">
                {error ?? 'This pairing ended or expired. Make a new code to pair again.'}
              </p>
              <BlockButton variant="primary" onClick={() => void initSession()} icon={<RefreshCw aria-hidden className="h-4 w-4" />}>
                New code
              </BlockButton>
            </div>
          )}

          {insecure && (
            <p role="status" className="w-full rounded-md border-2 border-warn-edge bg-warn-soft p-3 text-sm text-ink">
              The phone camera only opens on an https:// address. Start the server with npm run dev (HTTPS).
            </p>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <PageSection title="Steps">
            <ol className="flex flex-col gap-3">
              {[
                'Phone and laptop on the same Wi-Fi.',
                'Scan the code with the phone camera, or type the six characters.',
                'Allow the camera on the phone. Pictures stay on the phone.',
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-sm text-ink">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-line-soft bg-well font-mono text-xs font-bold">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </PageSection>

          {availableIps.length > 1 && sessionId && (
            <PageSection title="Laptop address">
              <p className="text-xs text-muted">If the phone cannot open the page, try another address.</p>
              <div role="group" aria-label="Laptop address for the QR code" className="flex flex-wrap gap-2">
                {availableIps.map((ip) => {
                  const selected = Boolean(companionBaseUrl?.includes(`//${ip}`));
                  return (
                    <BlockButton key={ip} size="sm" variant={selected ? 'primary' : 'secondary'} aria-pressed={selected} onClick={() => void selectHost(ip)} className="font-mono">
                      {ip}
                    </BlockButton>
                  );
                })}
              </div>
            </PageSection>
          )}

          <div className="flex flex-wrap gap-3">
            {mobileConnected && (
              <BlockLink href="/scan" variant="primary" icon={<ScanLine aria-hidden className="h-4 w-4" />}>
                Scan with the phone
              </BlockLink>
            )}
            {sessionId && (
              <BlockButton variant="ghost" onClick={disconnect} icon={<Link2Off aria-hidden className="h-4 w-4" />}>
                Unpair
              </BlockButton>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
