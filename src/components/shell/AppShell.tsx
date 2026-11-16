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
  '/trainer': Target,
  '/timer': Timer,
  '/progress': BarChart3,
  '/pair': Smartphone,
  '/settings': Settings,
};

const GROUPS: NavGroup[] = ['learn', 'practice', 'device'];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" aria-label="Cubyntra, home" className="vx-hit flex items-center gap-3 -m-1 p-1 hover:bg-well">
      <CubeGlyph className={compact ? 'h-8 w-8' : 'h-10 w-10'} />
      <span className="flex flex-col">
        <span className="font-display text-xl leading-none text-ink">Cubyntra</span>
        {!compact && <span className="mt-1 text-xs text-muted">See it. Solve it.</span>}
      </span>
    </Link>
  );
}

function SideNav({ pathname }: { pathname: string | null }) {
  return (
    <aside className="sticky top-0 hidden h-screen flex-col gap-8 overflow-y-auto border-r-2 border-line bg-panel px-4 py-6 lg:flex">
      <div className="px-2">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-6">
        {GROUPS.map((group) => (
          <div key={group} className="flex flex-col gap-1">
            <h2 className="px-2 pb-1 font-sans text-xs font-bold tracking-wide text-muted">
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
                        'flex h-10 items-center gap-3 border-2 px-3 text-sm font-bold',
                        active
                          ? 'border-line bg-leaf-soft text-ink shadow-[inset_4px_0_0_0_var(--vx-leaf-edge)]'
                          : 'border-transparent text-muted hover:bg-well hover:text-ink'
                      )}
                    >
                      <Icon aria-hidden className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t-2 border-line-soft px-2 pt-4">
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
      className="vx-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t-2 border-line bg-panel lg:hidden"
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
                  'relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-bold',
                  active ? 'text-ink' : 'text-muted hover:text-ink'
                )}
              >
                <span aria-hidden className={cx('absolute inset-x-3 top-0 h-1', active && 'bg-leaf-edge')} />
                <span
                  aria-hidden
                  className={cx(
                    'flex h-8 w-10 items-center justify-center border-2',
                    active ? 'border-line bg-leaf-soft' : 'border-transparent'
                  )}
                >
                  <Icon className="h-4 w-4" />
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
    <div className="min-h-screen bg-ground text-ink lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <a
        href="#content"
        className="sr-only z-50 border-2 border-line bg-panel px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <SideNav pathname={pathname} />

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b-2 border-line bg-panel px-4 lg:hidden">
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
