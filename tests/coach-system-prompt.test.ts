/**
 * Cubyntra - Coach System Prompt Tests
 * Necookie Labs (c) 2026
 */

import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { COACH_SYSTEM_PROMPT } from '../src/coach/systemPrompt';
import { STAGE_TIPS } from '../src/coach/stages';

/** Estimate used across the coach code: about 4 characters per token for English text. */
const CHARS_PER_TOKEN = 4;
/** Safe floor above every current model's minimum cacheable prefix. */
const MIN_CACHEABLE_TOKENS = 4096;

describe('coach system prompt', () => {
  it('is long enough to be cached', () => {
    expect(COACH_SYSTEM_PROMPT.length / CHARS_PER_TOKEN).toBeGreaterThanOrEqual(MIN_CACHEABLE_TOKENS);
  });

  it('is byte-stable across imports and clock changes', async () => {
    const first = createHash('sha256').update(COACH_SYSTEM_PROMPT).digest('hex');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2031-01-02T03:04:05Z'));
    vi.resetModules();
    const again = await import('../src/coach/systemPrompt');
    vi.useRealTimers();
    expect(createHash('sha256').update(again.COACH_SYSTEM_PROMPT).digest('hex')).toBe(first);
  });

  it('contains no dates, times or ids', () => {
    expect(COACH_SYSTEM_PROMPT).not.toMatch(/\b20\d\d-\d\d/);
    expect(COACH_SYSTEM_PROMPT).not.toMatch(/\d\d:\d\d/);
    expect(COACH_SYSTEM_PROMPT).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it('teaches every stage the coach has notes for', () => {
    for (const key of Object.keys(STAGE_TIPS)) {
      const id = key.split(':')[1];
      expect(COACH_SYSTEM_PROMPT, id).toContain(`- ${id} (`);
    }
  });

  it('names no stage the tutor does not have', () => {
    expect(COACH_SYSTEM_PROMPT).not.toContain('- flip (');
  });

  it('states the move rule and the three hint levels', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('Never invent, change');
    expect(COACH_SYSTEM_PROMPT).toContain('Level 1, "what to look for"');
    expect(COACH_SYSTEM_PROMPT).toContain('Level 2, "why it works"');
    expect(COACH_SYSTEM_PROMPT).toContain('Level 3, "exact moves"');
  });
});
