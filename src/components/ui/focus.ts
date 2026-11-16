/**
 * Cubyntra - Focus helpers for modal surfaces
 * Necookie Labs (c) 2026
 */

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

/** Elements inside `root` that Tab can reach, in document order. */
export function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.hasAttribute('hidden') && !el.closest('[inert],[aria-hidden="true"]')
  );
}

/**
 * Keeps Tab and Shift+Tab inside `root`, wrapping at both ends. Returns true when it moved
 * focus itself (the caller should then prevent the default).
 */
export function trapTab(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>, root: HTMLElement | null): boolean {
  if (event.key !== 'Tab' || !root) return false;
  const items = getFocusable(root);
  if (items.length === 0) {
    root.focus();
    return true;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = root.ownerDocument.activeElement;
  const inside = active instanceof HTMLElement && root.contains(active);
  if (event.shiftKey && (active === first || !inside || active === root)) {
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !inside)) {
    first.focus();
    return true;
  }
  return false;
}
