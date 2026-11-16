/**
 * Cubyntra - Coach Eval Situation Tests
 * Necookie Labs (c) 2026
 *
 * The eval script's situations come from real tutor plans. Importing the script does not run
 * the eval and never calls the API.
 */

import { describe, expect, it } from 'vitest';
import { situations } from '../scripts/coach-eval';
import { parseCoachFacts } from '../src/coach/facts';
import { METHODS } from '../src/tutor/api';
import { MethodId } from '../src/tutor/types';

describe('coach eval situations', () => {
  const all = situations();

  it('has about fifty, from both methods, at every hint level', () => {
    expect(all).toHaveLength(50);
    for (const method of Object.keys(METHODS) as MethodId[]) {
      const mine = all.filter((f) => f.method === method);
      expect(mine.length).toBeGreaterThanOrEqual(20);
      for (const level of [1, 2, 3]) expect(mine.some((f) => f.hintLevel === level), `${method} L${level}`).toBe(true);
      for (const stage of METHODS[method].stages) expect(mine.some((f) => f.stage === stage.id), stage.id).toBe(true);
    }
  });

  it('includes diagnosed situations built by the tutor diagnosis', () => {
    const diagnosed = all.filter((f) => f.diagnosis);
    expect(diagnosed.length).toBeGreaterThanOrEqual(5);
    expect(diagnosed.some((f) => f.diagnosis!.likelyMistakes[0].kind === 'wrong-direction')).toBe(true);
    for (const f of diagnosed) expect(f.diagnosis!.likelyMistakes[0].description).toBeTruthy();
  });

  it('is deterministic and every situation passes the request validator', () => {
    expect(JSON.stringify(situations())).toBe(JSON.stringify(all));
    for (const f of all) expect(parseCoachFacts(JSON.parse(JSON.stringify(f)))).toEqual({ ok: true, value: f });
  });
});
