import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkDesignRules, declaredTokens } from './helpers/designRules';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(css|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('voxel design rules (ADR-011)', () => {
  const files = sourceFiles(SRC);

  it('finds the source files to scan', () => {
    expect(files.some((f) => f.endsWith('globals.css'))).toBe(true);
    expect(files.filter((f) => f.endsWith('.tsx')).length).toBeGreaterThan(10);
  });

  it('src has no gradients, blur, glass, text-shadow, soft shadows, round corners or stray colors', () => {
    const report = files.flatMap((file) =>
      checkDesignRules(readFileSync(file, 'utf8'), file.endsWith('.css') ? 'css' : 'tsx').map(
        (v) => `${relative(ROOT, file)}:${v.line} ${v.rule}: ${v.match}`
      )
    );
    expect(report).toEqual([]);
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
    expect(rules('<div className="rounded-full" />')).toContain('rounded corners');
    expect(rules('<div className="text-neutral-400 bg-white" />')).toEqual([
      'default palette color',
      'default palette color',
    ]);
  });

  it('allows the voxel utilities', () => {
    expect(rules('<div className="vx-panel shadow-block bg-panel text-ink border-line bg-sticker-red" />')).toEqual(
      []
    );
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
