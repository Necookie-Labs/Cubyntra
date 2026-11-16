/**
 * Cubyntra - UI method descriptions stay in step with the tutor engine
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { METHODS } from '../src/tutor';
import { METHOD_IDS, METHOD_INFO } from '../src/app-shell/methodInfo';
import { NAV_ITEMS, isActivePath } from '../src/app-shell/nav';

describe('method info', () => {
  it.each(METHOD_IDS)('lists the same stages as the %s engine', (id) => {
    expect(METHOD_INFO[id].stages).toEqual(METHODS[id].stages.map((s) => ({ id: s.id, name: s.name })));
  });
});

describe('navigation map', () => {
  it('has every shell route once and five phone tabs', () => {
    expect(NAV_ITEMS.map((i) => i.href).sort()).toEqual(
      ['/', '/pair', '/progress', '/scan', '/settings', '/solve', '/timer', '/trainer'].sort()
    );
    expect(NAV_ITEMS.filter((i) => i.tab)).toHaveLength(5);
  });

  it('marks home only on / and other sections on their sub-paths', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/solve', '/')).toBe(false);
    expect(isActivePath('/solve', '/solve')).toBe(true);
    expect(isActivePath('/settings/coach', '/settings')).toBe(true);
    expect(isActivePath('/scanner', '/scan')).toBe(false);
    expect(isActivePath(null, '/')).toBe(false);
  });
});
