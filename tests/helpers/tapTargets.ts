/**
 * Phone tap targets (44x44 px), checked from class names: jsdom has no layout.
 *
 * A control passes when it is a block button or link (`.vx-block`, whose hit area globals.css
 * grows to 44px on phones), carries `.vx-hit` (the same hit area), or its own height class is
 * 44px or more without a width class under 44px. Controls only shown on desktop (inside a
 * `hidden lg:*` ancestor) and visually hidden ones (`sr-only`, e.g. the skip link before it is
 * focused) are skipped.
 */

const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="radio"], [role="switch"], [role="tab"]';

/** Pixel size of a Tailwind size token (`11`, `[44px]`), or null. */
function px(token: string): number | null {
  const arbitrary = /^\[(\d+(?:\.\d+)?)px\]$/.exec(token);
  if (arbitrary) return Number(arbitrary[1]);
  return /^\d+(?:\.\d+)?$/.test(token) ? Number(token) * 4 : null;
}

/** The phone size (no breakpoint prefix) a class list gives for `h` or `w`. */
function size(classes: string[], axis: 'h' | 'w'): number | null {
  let best: number | null = null;
  for (const c of classes) {
    const m = new RegExp(`^(?:min-)?${axis}-(.+)$`).exec(c);
    const v = m ? px(m[1]) : null;
    if (v !== null) best = Math.max(best ?? 0, v);
  }
  return best;
}

function desktopOnly(el: Element): boolean {
  for (let a = el.parentElement; a; a = a.parentElement) {
    const cls = a.classList;
    if (cls.contains('hidden') && [...cls].some((c) => /^(?:sm|md|lg|xl):(?:flex|block|grid|inline)/.test(c))) return true;
  }
  return false;
}

export function meetsTapTarget(el: Element): boolean {
  const classes = [...el.classList];
  if (classes.includes('vx-hit')) return true;
  if (classes.includes('vx-block') && (el.tagName === 'BUTTON' || el.tagName === 'A')) return true;
  const h = size(classes, 'h');
  const w = size(classes, 'w');
  return h !== null && h >= 44 && (w === null || w >= 44);
}

/** Every visible control under `root` that is smaller than 44px on a phone, described. */
export function smallTapTargets(root: ParentNode = document): string[] {
  return [...root.querySelectorAll(CONTROLS)]
    .filter((el) => !el.closest('.sr-only') && !desktopOnly(el) && !(el as HTMLElement).hidden)
    .filter((el) => !meetsTapTarget(el))
    .map((el) => `${el.tagName.toLowerCase()} "${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30)}" (${el.className})`);
}
