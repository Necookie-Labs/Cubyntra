'use client';

/**
 * Cubyntra - Pair a phone (placeholder until Phase 8)
 * Necookie Labs (c) 2026
 *
 * Phase 8 rebuilds pairing as state-only sync. Until then this screen opens the existing
 * QR pairing dialog unchanged.
 */

import React, { useState } from 'react';
import { QrCode } from 'lucide-react';
import { BlockButton, Chip, Panel } from '@/components/ui';
import { PageContainer, PageHeader } from '@/components/shell/Page';
import { CompanionSyncProvider } from '@/sync/CompanionSyncProvider';
import { MobilePairingModal } from '@/components/sync/MobilePairingModal';

const STEPS = [
  'Your phone and this laptop are on the same Wi-Fi.',
  'Open the pairing code below and scan it with the phone camera.',
  'Allow the camera on the phone. It is only used on the phone.',
];

export function PairView() {
  const [open, setOpen] = useState(false);
  return (
    <CompanionSyncProvider>
      <PageContainer width="md">
        <PageHeader
          eyebrow={<Chip tone="warn">Being rebuilt</Chip>}
          title="Pair your phone"
          lede="Use your phone as the camera while the laptop shows the twin."
        />
        <Panel className="flex flex-col gap-4 p-6 pb-7">
          <ol className="flex flex-col gap-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm text-ink">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-line bg-well font-mono text-xs font-bold">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <BlockButton variant="primary" size="lg" className="self-start" onClick={() => setOpen(true)} icon={<QrCode aria-hidden className="h-5 w-5" />}>
            Show pairing code
          </BlockButton>
        </Panel>
        <p className="text-sm text-muted">
          Pairing is being rebuilt so that only cube states travel between devices, never photos. This opens the
          current pairing flow in the meantime.
        </p>
      </PageContainer>
      <MobilePairingModal isOpen={open} onClose={() => setOpen(false)} />
    </CompanionSyncProvider>
  );
}
