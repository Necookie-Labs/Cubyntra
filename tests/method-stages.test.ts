import { describe, expect, it } from 'vitest';
import { methodStages } from '../src/app-shell/methodInfo';
import { getMethod } from '../src/tutor';

describe('methodStages', () => {
  it.each([
    ['beginner', undefined],
    ['cfop', '2-look'],
    ['cfop', 'full'],
  ] as const)('lists %s (%s) stages in the tutor engine order', (method, lastLayer) => {
    const engine = getMethod(method, lastLayer ? { lastLayer } : undefined).stages.map((s) => s.id);
    expect(methodStages(method, lastLayer).map((s) => s.id)).toEqual(engine);
  });

  it('gives every stage a display name', () => {
    for (const lastLayer of ['2-look', 'full'] as const) {
      for (const stage of methodStages('cfop', lastLayer)) expect(stage.name.length).toBeGreaterThan(0);
    }
  });
});
