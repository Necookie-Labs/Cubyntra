'use client';

/**
 * Cubyntra - App Shell
 * Necookie Labs (c) 2026
 *
 * Phone: a slim top bar and a five-tab bar along the bottom. Desktop (lg and up): a side nav
 * with every screen, grouped. Both are <nav> landmarks with aria-current on the active link;
 * a skip link jumps straight to the page content. The phone companion (`/companion`) is a
 * full-screen camera: it shares the shell's session and pairing but shows no navigation.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Box,
  Home,
  ScanLine,
  Settings,
  Smartphone,
  Target,
  Timer,
  Library,
  type LucideIcon,
} from 'lucide-react';
import { CubeGlyph } from '@/components/branding/CubeGlyph';
import { ThemeToggle } from '@/components/branding/ThemeToggle';
import { cx } from '@/components/ui';
import { NAV_GROUP_LABEL, NAV_ITEMS, isActivePath, type NavGroup } from '@/app-shell/nav';
import { useStudentSession } from '@/app-shell/useStudentSession';
import { CompanionSyncProvider } from '@/sync/CompanionSyncProvider';

const ICONS: Record<string, LucideIcon> = {
  '/': Home,
  '/scan': ScanLine,
  '/solve': Box,
  '/cubes': Library,
  '/trainer': Target,
  '/timer': Timer,
  '/progress': BarChart3,
  '/pair': Smartphone,
  '/settings': Settings,
};

const GROUPS: NavGroup[] = ['learn', 'practice', 'device'];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" aria-label="Cubyntra, home" className="vx-hit -m-1 flex items-center gap-3 rounded-lg p-1 hover:bg-well">
      <CubeGlyph className={compact ? 'h-8 w-8' : 'h-11 w-11'} />
      <span className="flex flex-col items-start">
        <span className="font-display text-xl font-black leading-none tracking-tight text-ink">Cubyntra</span>
        {/* The tagline as a teal pill, like a badge under a logo. */}
        {!compact && <span className="vx-pill mt-1.5 h-5 px-2 pb-px text-[11px] font-extrabold">See it. Solve it.</span>}
      </span>
    </Link>
  );
}

function SideNav({ pathname }: { pathname: string | null }) {
  return (
    <aside className="sticky top-0 hidden h-screen flex-col gap-8 overflow-y-auto border-r-2 border-line-soft px-4 py-6 lg:flex">
      <div className="px-2">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-6">
        {GROUPS.map((group) => (
          <div key={group} className="flex flex-col gap-1">
            <h2 className="px-3 pb-1 font-sans text-xs font-extrabold tracking-wide text-muted">
              {NAV_GROUP_LABEL[group]}
            </h2>
            <ul className="flex flex-col gap-1">
              {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = ICONS[item.href];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      title={item.blurb}
                      className={cx(
                        'flex h-11 items-center gap-3 rounded-lg border-2 px-3 font-display text-[15px] font-extrabold tracking-wide transition-colors',
                        active
                          ? 'border-primary bg-primary-soft text-ink'
                          : 'border-transparent text-muted hover:bg-well hover:text-ink'
                      )}
                    >
                      <Icon aria-hidden className="h-5 w-5 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t-2 border-line-soft px-1 pt-4">
        <p className="text-xs text-muted">Photos stay on this device.</p>
        <ThemeToggle />
      </div>
    </aside>
  );
}

function TabBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="vx-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t-2 border-line-soft bg-panel lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV_ITEMS.filter((item) => item.tab).map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = ICONS[item.href];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex h-16 flex-col items-center justify-center gap-1 font-display text-xs font-extrabold',
                  active ? 'text-ink' : 'text-muted hover:text-ink'
                )}
              >
                {/* The active tab's icon sits in a solid blue pill on a small edge. */}
                <span
                  aria-hidden
                  className={cx(
                    'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                    active ? 'bg-primary text-on-primary shadow-[inset_0_-2px_0_0_var(--vx-primary-edge)]' : ''
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Full-screen camera screens: no navigation chrome over the viewfinder. */
export function isImmersivePath(pathname: string | null): boolean {
  return Boolean(pathname && (pathname === '/companion' || pathname.startsWith('/companion/')));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useStudentSession();

  // One phone pairing for the whole app, so it survives moving between screens (ADR-015).
  return (
    <CompanionSyncProvider>
      {isImmersivePath(pathname) ? (
        <main id="content" className="min-h-[100dvh] bg-ground text-ink">
          {children}
        </main>
      ) : (
        <ShellFrame pathname={pathname}>{children}</ShellFrame>
      )}
    </CompanionSyncProvider>
  );
}

function ShellFrame({ pathname, children }: { pathname: string | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-ink lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <a
        href="#content"
        className="sr-only z-50 rounded-md border-2 border-line bg-panel px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <SideNav pathname={pathname} />

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b-2 border-line-soft bg-panel px-4 lg:hidden">
          <Brand compact />
          <ThemeToggle />
        </header>

        <main id="content" tabIndex={-1} className="flex-1 pb-24 outline-none lg:pb-0">
          {children}
        </main>
      </div>

      <TabBar pathname={pathname} />
    </div>
  );
}
