/**
 * Raised design rules (ADR-018), as a pure checker so the rules themselves can be tested.
 *
 * Gradients, colors and shadows exist only as tokens: a gradient or hex color is allowed inside
 * the token block of globals.css and nowhere else. Corners come from one radius scale. Glass,
 * blur, drop shadows and text shadows stay out everywhere.
 */

export interface DesignViolation {
  rule: string;
  line: number;
  match: string;
}

const TOKENS_START = '/* tokens:start */';
const TOKENS_END = '/* tokens:end */';

/** Literal CSS for one-off gradients (outside the token block), blur, glass or glow. */
const BANNED_CSS: Array<[string, RegExp]> = [
  ['gradient', /gradient\(/gi],
  ['blur', /blur\(/gi],
  ['backdrop-filter', /backdrop-filter/gi],
  ['text-shadow', /text-shadow/gi],
];

/** The radius scale defined in globals.css (`--radius-*`), plus Tailwind's static none and full. */
const RADIUS_SCALE = new Set(['xs', 'sm', 'md', 'lg', 'xl', '2xl', 'none', 'full']);

/** `rounded`, an optional side or corner, and an optional size, e.g. `rounded-t-xl`. */
const ROUNDED = /(?<![\w-])rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?(?:-([\w[\]/.%]+))?(?![\w-])/g;

/** Tailwind utilities that produce the same effects, or Tailwind's default soft shadows. */
const BANNED_CLASSES: Array<[string, RegExp]> = [
  ['gradient class', /(?<![\w-])(?:bg-gradient|bg-linear|bg-radial|bg-conic)(?:-[\w[\]/.%]+)?/g],
  ['blur class', /(?<![\w-])(?:backdrop-blur|blur)(?:-[\w[\]/.]+)?(?![\w-])/g],
  ['drop-shadow class', /(?<![\w-])drop-shadow(?:-[\w[\]/.]+)?/g],
  ['text-shadow class', /(?<![\w-])text-shadow(?:-[\w[\]/.]+)?/g],
  ['soft shadow class', /(?<![\w-])shadow(?:-(?:xs|sm|md|lg|xl|2xl|inner))?(?![\w-])/g],
  [
    'default palette color',
    /(?<![\w-])(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|accent|caret|decoration|placeholder)(?:-[trblxy])?-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?![\w])/g,
  ],
];

/**
 * Classes for tokens retired with the voxel system (ADR-011). Tailwind silently drops a class
 * for a token that no longer exists, so a leftover would render nothing instead of failing.
 */
const RETIRED_CLASS =
  /(?<![\w-])(?:bg|text|border|ring|outline|fill|stroke|divide|from|via|to)(?:-[trblxy])?-(?:leaf(?:-edge|-soft)?|on-leaf|panel-edge)(?![\w-])/g;

const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** Blanks out the token block (keeping line numbers), the only place hex colors may live. */
function withoutTokenBlock(source: string): string {
  const start = source.indexOf(TOKENS_START);
  const end = source.indexOf(TOKENS_END);
  if (start < 0 || end < start) return source;
  const block = source.slice(start, end);
  return source.slice(0, start) + block.replace(/[^\n]/g, ' ') + source.slice(end);
}

/**
 * Blanks out comments (keeping line numbers) so prose such as "a hard shadow" is not read as
 * a class name. Class rules run on this; CSS-effect and hex rules still see comments.
 */
function withoutComments(source: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`])(\/\/.*)$/gm, (_m, pre: string, comment: string) => pre + blank(comment));
}

function collect(rule: string, pattern: RegExp, text: string, out: DesignViolation[]): void {
  for (const m of text.matchAll(pattern)) {
    out.push({ rule, line: lineOf(text, m.index ?? 0), match: m[0] });
  }
}

/** Violations in one source file. `kind` picks the rule set: CSS or TSX. */
export function checkDesignRules(source: string, kind: 'css' | 'tsx'): DesignViolation[] {
  const text = kind === 'css' ? withoutTokenBlock(source) : source;
  const out: DesignViolation[] = [];
  for (const [rule, pattern] of BANNED_CSS) collect(rule, pattern, text, out);
  if (kind === 'tsx') {
    const code = withoutComments(text);
    for (const [rule, pattern] of BANNED_CLASSES) collect(rule, pattern, code, out);
    collect('retired token class', RETIRED_CLASS, code, out);
    // Corners come from the scale: a bare `rounded` or a one-off `rounded-[6px]` is off the scale.
    for (const m of code.matchAll(ROUNDED)) {
      if (m[1] === undefined || !RADIUS_SCALE.has(m[1])) {
        out.push({ rule: 'radius off the scale', line: lineOf(code, m.index ?? 0), match: m[0] });
      }
    }
  }
  collect('hex color outside tokens', HEX, text, out);
  return out;
}

/** Every `var(--vx-*)` a source file reads, with its line. */
export function usedTokenVars(source: string): Array<{ name: string; line: number }> {
  return [...source.matchAll(/var\(\s*(--vx-[\w-]+)/g)].map((m) => ({ name: m[1], line: lineOf(source, m.index ?? 0) }));
}

/** The custom properties declared in a CSS block such as `:root { ... }`. */
export function declaredTokens(css: string, selector: string): Set<string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return new Set();
  const body = css.slice(at, css.indexOf('}', at));
  return new Set([...body.matchAll(/(--vx-[\w-]+)\s*:/g)].map((m) => m[1]));
}
