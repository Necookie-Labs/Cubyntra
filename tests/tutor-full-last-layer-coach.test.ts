/**
 * Full last-layer plans as the coach receives them: the facts pass the coach's strict parser and
 * the built-in template text passes the move guardrail at every hint level, whether or not the
 * coach has a note of its own for the case.
 */

import { describe, expect, it } from 'vitest';
import { applyMoves, formatAlgorithm, invertAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { allowedMoves, buildCoachFacts, parseCoachFacts } from '../src/coach/facts';
import { checkReplyMoves } from '../src/coach/guard';
import { templateText } from '../src/coach/templates';
import { HINT_LEVELS, MAX_TEXT_FIELD } from '../src/coach/types';
import { planNextStep } from '../src/tutor';
import { OLL_CASES } from '../src/tutor/cases/oll';
import { PLL_CASES } from '../src/tutor/cases/pll';
import { YELLOW_TOP } from './helpers/lastLayerFull';

const FULL = { lastLayer: 'full' } as const;

describe('full last-layer plans and the coach', () => {
  it('every OLL and PLL plan gives facts the coach accepts and a template that names no stray move', () => {
    for (const c of [...OLL_CASES, ...PLL_CASES]) {
      // One turn of the top away from the case, so the plan has a line-up move too.
      const start = applyMoves(YELLOW_TOP, [...invertAlgorithm(parseAlgorithm(c.algorithm)), ...parseAlgorithm('U')]);
      const plan = planNextStep(start, 'cfop', undefined, 0, FULL)!;
      expect(plan.caseId, c.id).toBe(c.id);
      expect(c.recognition.length, c.id).toBeLessThanOrEqual(MAX_TEXT_FIELD);

      for (const hintLevel of HINT_LEVELS) {
        const facts = buildCoachFacts(plan, hintLevel);
        const parsed = parseCoachFacts(JSON.parse(JSON.stringify(facts)));
        expect(parsed.ok, `${c.id}: ${parsed.ok ? '' : parsed.error}`).toBe(true);
        expect(facts.lookFor, c.id).toBe(c.recognition);

        const text = templateText(facts);
        const guard = checkReplyMoves(text, allowedMoves(facts), [facts.caseName, facts.stageName]);
        expect(guard.offending, `${c.id} level ${hintLevel}: ${text}`).toEqual([]);
        if (hintLevel === 3) expect(text, c.id).toContain(formatAlgorithm(plan.algorithm));
        else expect(guard.tokens, `${c.id} level ${hintLevel}: ${text}`).toEqual([]);
        if (hintLevel === 1) expect(text, c.id).toContain(c.recognition);
      }
    }
  });
});
