/**
 * Cubyntra - Color Theme
 * Necookie Labs (c) 2026
 *
 * The user picks Light, Dark or System (follow the OS). The resolved theme is written to
 * <html data-theme>, which globals.css keys the palette on. The phone companion is always
 * dark: a camera viewfinder reads best dark, and its overlays sit on live video.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'cubyntra.theme';
/** Dispatched on window after the preference changes in this tab. */
export const THEME_CHANGE_EVENT = 'cubyntra-theme-change';

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (window.location.pathname.startsWith('/companion')) return 'dark';
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(pref: ThemePreference): void {
  const theme = resolveTheme(pref);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage unavailable: the choice still applies for this visit.
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/**
 * Runs in <head> before first paint, so the page never flashes the wrong theme. Mirrors
 * readThemePreference + resolveTheme; kept as a string because it runs before React.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=null;try{p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})}catch(e){}var t=location.pathname.indexOf('/companion')===0?'dark':(p==='light'||p==='dark')?p:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t;}catch(e){}})();`;
