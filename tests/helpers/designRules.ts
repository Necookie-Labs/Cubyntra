/**
 * Voxel design rules (ADR-011), as a pure checker so the rules themselves can be tested.
 */

export interface DesignViolation {
  rule: string;
  line: number;
  match: string;
}

const TOKENS_START = '/* tokens:start */';
const TOKENS_END = '/* tokens:end */';

/** Literal CSS that would bring back gradients, blur, glass or glow. */
const BANNED_CSS: Array<[string, RegExp]> = [
  ['gradient', /gradient\(/gi],
  ['blur', /blur\(/gi],
  ['backdrop-filter', /backdrop-filter/gi],
  ['text-shadow', /text-shadow/gi],
];

/** Tailwind utilities that produce the same effects, or soft shadows and round corners. */
const BANNED_CLASSES: Array<[string, RegExp]> = [
  ['gradient class', /(?<![\w-])(?:bg-gradient|bg-linear|bg-radial|bg-conic)(?:-[\w[\]/.%]+)?/g],
  ['blur class', /(?<![\w-])(?:backdrop-blur|blur)(?:-[\w[\]/.]+)?(?![\w-])/g],
  ['drop-shadow class', /(?<![\w-])drop-shadow(?:-[\w[\]/.]+)?/g],
  ['text-shadow class', /(?<![\w-])text-shadow(?:-[\w[\]/.]+)?/g],
  ['soft shadow class', /(?<![\w-])shadow(?:-(?:xs|sm|md|lg|xl|2xl|inner))?(?![\w-])/g],
  ['rounded corners', /(?<![\w-])rounded(?:-[\w[\]/.]+)?(?![\w-])/g],
  [
    'default palette color',
    /(?<![\w-])(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|accent|caret|decoration|placeholder)(?:-[trblxy])?-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?![\w])/g,
  ],
];

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
  }
  collect('hex color outside tokens', HEX, text, out);
  return out;
}

/** The custom properties declared in a CSS block such as `:root { ... }`. */
export function declaredTokens(css: string, selector: string): Set<string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return new Set();
  const body = css.slice(at, css.indexOf('}', at));
  return new Set([...body.matchAll(/(--vx-[\w-]+)\s*:/g)].map((m) => m[1]));
}
