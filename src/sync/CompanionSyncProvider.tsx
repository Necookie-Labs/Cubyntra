'use client';

/**
 * Cubyntra - Companion Session Provider
 * Necookie Labs (c) 2026
 *
 * Keeps one phone session alive for the whole page, independent of the pairing dialog,
 * so the review screen can still ask the phone for a retake or tell it the scan is done.
 */

import React, { createContext, useContext } from 'react';
import { CompanionSync, useCompanionSync } from './useCompanionSync';

const CompanionSyncContext = createContext<CompanionSync | null>(null);

export function CompanionSyncProvider({ children }: { children: React.ReactNode }) {
  const sync = useCompanionSync();
  return <CompanionSyncContext.Provider value={sync}>{children}</CompanionSyncContext.Provider>;
}

export function useCompanion(): CompanionSync {
  const sync = useContext(CompanionSyncContext);
  if (!sync) throw new Error('useCompanion must be used inside CompanionSyncProvider');
  return sync;
}
