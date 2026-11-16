'use client';

/**
 * Cubyntra - Which pairing the solve screen syncs over
 * Necookie Labs (c) 2026
 *
 * The laptop syncs over the pairing it created (`useCompanion()`). A phone that joined a pairing
 * (QR link or typed code, kept in sessionStorage) syncs over that one as the `mobile` device, so
 * a solve done on the phone is mirrored on the laptop. A device with neither does not sync.
 */

import { useSyncExternalStore } from 'react';
import { useCompanion } from './CompanionSyncProvider';
import { getPairingSnapshot, getServerPairingSnapshot, subscribePairing } from './pairingStorage';
import { useMobileTutorTarget } from './useMobileTutorTarget';
import type { TutorSyncTarget } from './useTutorSync';

export function useSolveSyncTarget(): TutorSyncTarget {
  const companion = useCompanion();
  const pairing = useSyncExternalStore(subscribePairing, getPairingSnapshot, getServerPairingSnapshot);
  const phone = useMobileTutorTarget(companion.sessionId ? null : pairing);
  return companion.sessionId ? companion : phone;
}
