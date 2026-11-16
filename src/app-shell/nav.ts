/**
 * Cubyntra - Navigation Map
 * Necookie Labs (c) 2026
 *
 * Every screen of the app shell. The phone tab bar shows the five `tab` entries; the desktop
 * side nav shows all of them, grouped.
 */

export type NavGroup = 'learn' | 'practice' | 'device';

export interface NavItem {
  href: string;
  label: string;
  group: NavGroup;
  /** Shown in the phone tab bar. */
  tab: boolean;
  /** One line for the home screen and the side nav's title attribute. */
  blurb: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Home', group: 'learn', tab: true, blurb: 'Pick a method and pick up where you left off.' },
  { href: '/scan', label: 'Scan', group: 'learn', tab: true, blurb: 'Show the camera all six faces of your cube.' },
  { href: '/solve', label: 'Solve', group: 'learn', tab: true, blurb: 'Follow the twin one step at a time.' },
  { href: '/trainer', label: 'Trainer', group: 'practice', tab: false, blurb: 'Drill the cases you miss.' },
  { href: '/timer', label: 'Timer', group: 'practice', tab: false, blurb: 'Time your solves with inspection.' },
  { href: '/progress', label: 'Progress', group: 'practice', tab: true, blurb: 'Stages mastered and streaks.' },
  { href: '/pair', label: 'Pair phone', group: 'device', tab: false, blurb: 'Use your phone as the camera.' },
  { href: '/settings', label: 'Settings', group: 'device', tab: true, blurb: 'Name, method, display and coach.' },
];

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  learn: 'Learn',
  practice: 'Practice',
  device: 'This device',
};

/** Whether `href` is the current section: `/` only on the home page, others on any sub-path. */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
