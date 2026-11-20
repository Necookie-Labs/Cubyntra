import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkDesignRules, declaredTokens, usedTokenVars } from './helpers/designRules';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(css|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('raised design rules (ADR-018)', () => {
  const files = sourceFiles(SRC);

  it('finds the source files to scan', () => {
    expect(files.some((f) => f.endsWith('globals.css'))).toBe(true);
    expect(files.filter((f) => f.endsWith('.tsx')).length).toBeGreaterThan(10);
  });

  it('src has no one-off gradients, blur, glass, text-shadow, default shadows, off-scale radii or stray colors', () => {
    const report = files.flatMap((file) =>
      checkDesignRules(readFileSync(file, 'utf8'), file.endsWith('.css') ? 'css' : 'tsx').map(
        (v) => `${relative(ROOT, file)}:${v.line} ${v.rule}: ${v.match}`
      )
    );
    expect(report).toEqual([]);
  });

  it('every var(--vx-*) in src names a declared token', () => {
    const css = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');
    // The four face variables .vx-block sets for its variants are local to globals.css.
    const known = new Set([...declaredTokens(css, ':root'), '--vx-face', '--vx-edge', '--vx-rim', '--vx-text']);
    const unknown = files.flatMap((file) =>
      usedTokenVars(readFileSync(file, 'utf8'))
        .filter((v) => !known.has(v.name))
        .map((v) => `${relative(ROOT, file)}:${v.line} ${v.name}`)
    );
    expect(unknown).toEqual([]);
  });

  it('the dark theme only overrides tokens the light theme defines', () => {
    const css = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');
    const light = declaredTokens(css, ':root');
    const dark = declaredTokens(css, ':root[data-theme="dark"]');
    expect(light.size).toBeGreaterThan(20);
    expect(dark.size).toBeGreaterThan(5);
    expect([...dark].filter((t) => !light.has(t))).toEqual([]);
  });
});

describe('design rule checker', () => {
  const rules = (src: string, kind: 'css' | 'tsx' = 'tsx') => checkDesignRules(src, kind).map((v) => v.rule);

  it('flags CSS effects in any file', () => {
    expect(rules('a { background: linear-gradient(red, blue); }', 'css')).toContain('gradient');
    expect(rules('a { filter: blur(4px); }', 'css')).toContain('blur');
    expect(rules('a { backdrop-filter: none; }', 'css')).toContain('backdrop-filter');
    expect(rules('a { text-shadow: 0 0 1px; }', 'css')).toContain('text-shadow');
  });

  it('flags Tailwind classes for the same effects', () => {
    expect(rules('<div className="bg-gradient-to-r from-leaf" />')).toContain('gradient class');
    expect(rules('<div className="bg-linear-to-b" />')).toContain('gradient class');
    expect(rules('<div className="backdrop-blur-md" />')).toContain('blur class');
    expect(rules('<div className="blur-3xl" />')).toContain('blur class');
    expect(rules('<div className="shadow-2xl" />')).toContain('soft shadow class');
    expect(rules('<div className="shadow" />')).toContain('soft shadow class');
    expect(rules('<div className="text-neutral-400 bg-white" />')).toEqual([
      'default palette color',
      'default palette color',
    ]);
  });

  it('allows the token utilities', () => {
    expect(
      rules('<div className="vx-panel shadow-block bg-panel text-ink border-line bg-sticker-red bg-primary text-on-primary" />')
    ).toEqual([]);
    expect(rules('<div className="shadow-[inset_0_-4px_0_0_var(--vx-primary-edge)]" />')).toEqual([]);
  });

  it('flags classes for tokens retired with the voxel system', () => {
    expect(rules('<div className="bg-leaf text-on-leaf border-leaf-edge hover:bg-leaf-soft" />')).toEqual([
      'retired token class',
      'retired token class',
      'retired token class',
      'retired token class',
    ]);
    expect(rules('<div className="bg-panel-edge" />')).toEqual(['retired token class']);
    expect(rules('<div className="bg-success text-on-success border-raised-edge" />')).toEqual([]);
  });

  it('allows corners on the radius scale only', () => {
    expect(
      rules('<div className="rounded-xs rounded-sm rounded-md rounded-lg rounded-xl rounded-2xl rounded-full rounded-none" />')
    ).toEqual([]);
    expect(rules('<div className="rounded-t-xl rounded-bl-lg rounded-r-full" />')).toEqual([]);
    expect(rules('<div className="rounded" />')).toEqual(['radius off the scale']);
    expect(rules('<div className="rounded-[6px]" />')).toEqual(['radius off the scale']);
    expect(rules('<div className="rounded-3xl" />')).toEqual(['radius off the scale']);
    expect(rules('<div className="rounded-t" />')).toEqual(['radius off the scale']);
  });

  it('allows a gradient inside the token block only', () => {
    const css =
      '/* tokens:start */\n:root { --vx-backdrop: linear-gradient(#EAF4E2, #123456); }\n/* tokens:end */\na { background: linear-gradient(red, blue); }';
    const found = checkDesignRules(css, 'css');
    expect(found.map((v) => v.rule)).toEqual(['gradient']);
    expect(found[0].line).toBe(4);
  });

  it('flags hex colors outside the token block only', () => {
    expect(rules("<div style={{ color: '#ff0000' }} />")).toEqual(['hex color outside tokens']);
    const css = '/* tokens:start */\n:root { --vx-a: #EAF4E2; }\n/* tokens:end */\nbody { color: #123456; }';
    const found = checkDesignRules(css, 'css');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ match: '#123456', line: 4 });
  });

  it('reads class rules on code, not on comments', () => {
    expect(rules('/** A panel with a hard shadow and no rounded look. */\n// shadow here too')).toEqual([]);
    expect(rules('{/* soft shadow */}<div className="shadow-lg" />')).toEqual(['soft shadow class']);
  });

  it('does not mistake entities or anchors for colors', () => {
    expect(rules('<a href="#top">&#8203;Item #{n}</a>')).toEqual([]);
  });
});
