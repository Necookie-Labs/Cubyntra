/**
 * Cubyntra - Coach Spend Tracking Tests
 * Necookie Labs (c) 2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COACH_MODEL,
  DEFAULT_MONTHLY_CAP_USD,
  PRICES,
  SpendTracker,
  costOfUsage,
  estimateCallCost,
  monthlyCapUsd,
} from '../src/coach/spend';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
  delete process.env.COACH_MONTHLY_CAP_USD;
});
afterEach(() => {
  scratch.cleanup();
  delete process.env.COACH_MONTHLY_CAP_USD;
});

const usage = (input: number, output: number, write = 0, read = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: write,
  cache_read_input_tokens: read,
});

describe('costOfUsage', () => {
  it('uses the Haiku 5.5 price table', () => {
    expect(PRICES[COACH_MODEL]).toEqual({
      inputPerMTok: 0.1,
      outputPerMTok: 0.5,
      cacheWriteMultiplier: 1.25,
      cacheReadMultiplier: 0.1,
    });
  });

  it('prices input, output, cache writes and cache reads', () => {
    expect(costOfUsage(usage(1_000_000, 0))).toBeCloseTo(0.1, 10);
    expect(costOfUsage(usage(0, 1_000_000))).toBeCloseTo(0.5, 10);
    expect(costOfUsage(usage(0, 0, 1_000_000))).toBeCloseTo(0.125, 10);
    expect(costOfUsage(usage(0, 0, 0, 1_000_000))).toBeCloseTo(0.01, 10);
    // A typical cached hint: 4,500 cached prompt tokens, 300 new input, 200 output.
    expect(costOfUsage(usage(300, 200, 0, 4500))).toBeCloseTo(0.00003 + 0.0001 + 0.000045, 10);
  });

  it('treats null cache counts as zero', () => {
    expect(costOfUsage({ input_tokens: 10, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null }))
      .toBeCloseTo(0.000001, 12);
  });

  it('estimates at least the real cost of a full-length reply', () => {
    const estimate = estimateCallCost(20_000);
    expect(estimate).toBeGreaterThanOrEqual(costOfUsage(usage(0, 400, 5000)));
    expect(estimate).toBeLessThan(0.01);
  });
});

describe('monthlyCapUsd', () => {
  it('defaults to $10 and reads COACH_MONTHLY_CAP_USD', () => {
    expect(monthlyCapUsd()).toBe(DEFAULT_MONTHLY_CAP_USD);
    process.env.COACH_MONTHLY_CAP_USD = '2.5';
    expect(monthlyCapUsd()).toBe(2.5);
    process.env.COACH_MONTHLY_CAP_USD = 'lots';
    expect(monthlyCapUsd()).toBe(10);
  });
});

describe('SpendTracker', () => {
  const file = () => path.join(scratch.dir, 'coach-usage.json');

  it('records usage per month into the data file', async () => {
    let now = new Date('2026-11-30T23:00:00Z');
    const tracker = new SpendTracker(file(), () => now);
    await tracker.record(usage(0, 1_000_000));
    expect(tracker.monthSpendUsd()).toBeCloseTo(0.5);
    now = new Date('2026-12-01T00:30:00Z');
    expect(tracker.monthSpendUsd()).toBe(0);
    await tracker.record(usage(1_000_000, 0, 0, 2000));

    const saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
    expect(Object.keys(saved.months)).toEqual(['2026-11', '2026-12']);
    expect(saved.months['2026-12']).toMatchObject({ requests: 1, inputTokens: 1_000_000, cacheReadTokens: 2000 });
    // A new tracker reads the file back.
    expect(new SpendTracker(file(), () => now).monthSpendUsd()).toBeCloseTo(0.1 + 0.0000002);
    // No temporary files left behind.
    expect(fs.readdirSync(scratch.dir)).toEqual(['coach-usage.json']);
  });

  it('creates the data directory when it is missing', async () => {
    const nested = path.join(scratch.dir, 'deeper', 'coach-usage.json');
    await new SpendTracker(nested).record(usage(1, 1));
    expect(fs.existsSync(nested)).toBe(true);
  });

  it('starts fresh from a corrupt file', () => {
    fs.writeFileSync(file(), '{ not json');
    expect(new SpendTracker(file()).monthSpendUsd()).toBe(0);
  });

  it('caps the month and refuses reservations that would pass the cap', async () => {
    process.env.COACH_MONTHLY_CAP_USD = '1';
    const tracker = new SpendTracker(file());
    expect(tracker.reserve(0.6)).toBe(true);
    expect(tracker.reserve(0.6)).toBe(false); // the first call is still in flight
    await tracker.settle(0.6, usage(0, 1_900_000)); // cost $0.95
    expect(tracker.isCapped()).toBe(false);
    expect(tracker.reserve(0.06)).toBe(false);
    expect(tracker.reserve(0.04)).toBe(true);
    await tracker.settle(0.04, usage(0, 100_000)); // +$0.05 reaches $1.00
    expect(tracker.isCapped()).toBe(true);
    expect(tracker.reserve(0.0001)).toBe(false);
  });

  it('releases a reservation for a call that returned no usage', async () => {
    process.env.COACH_MONTHLY_CAP_USD = '1';
    const tracker = new SpendTracker(file());
    expect(tracker.reserve(0.9)).toBe(true);
    await tracker.settle(0.9, null);
    expect(tracker.reserve(0.9)).toBe(true);
    expect(fs.existsSync(file())).toBe(false);
  });
});
