/**
 * Cubyntra - App Shell Layout
 * Necookie Labs (c) 2026
 *
 * Every tutor screen sits in the shell (navigation, profile bootstrap). The phone companion
 * (`/companion`) lives outside this group and keeps its own full-screen camera layout.
 */

import { AppShell } from '@/components/shell/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
