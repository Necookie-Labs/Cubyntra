/**
 * Cubyntra - Coach Spend Tracking (server only)
 * Necookie Labs (c) 2026
 *
 * Adds up what the coach costs per calendar month (UTC) from the `usage` Claude returns, keeps
 * it in `data/coach-usage.json`, and enforces the monthly cap (default $10, env
 * `COACH_MONTHLY_CAP_USD`). Before each call the worst-case cost of that call is reserved, so
 * concurrent or expensive requests cannot push the month far past the cap.
 */

import fs from 'node:fs';
import type Anthropic from '@anthropic-ai/sdk';
import { dataPath, writeFileAtomic } from '../lib/dataDir';

export const COACH_MODEL = 'claude-haiku-5-5';
export const COACH_MAX_TOKENS = 400;
export const DEFAULT_MONTHLY_CAP_USD = 10;

export interface ModelPrice {
  /** US dollars per million uncached input tokens. */
  inputPerMTok: number;
  /** US dollars per million output tokens (thinking included). */
  outputPerMTok: number;
  /** Cache writes (5-minute TTL) cost this many times the input price. */
  cacheWriteMultiplier: number;
  /** Cache reads cost this many times the input price. */
  cacheReadMultiplier: number;
}

/**
 * The one price table. Claude Haiku 5.5, prompts up to 100K tokens (the coach's prompts are
 * about 5K); longer prompts are billed higher and are never sent.
 */
export const PRICES: Readonly<Record<string, ModelPrice>> = {
  [COACH_MODEL]: { inputPerMTok: 0.1, outputPerMTok: 0.5, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 },
};

export type UsageCounts = Pick<
  Anthropic.Usage,
  'input_tokens' | 'output_tokens' | 'cache_creation_input_tokens' | 'cache_read_input_tokens'
>;

/** Cost of one response in US dollars. */
export function costOfUsage(usage: UsageCounts, model: string = COACH_MODEL): number {
  const price = PRICES[model];
  if (!price) throw new Error(`No price for model ${model}`);
  const perToken = (perMTok: number) => perMTok / 1_000_000;
  const input = price.inputPerMTok;
  return (
    usage.input_tokens * perToken(input) +
    usage.output_tokens * perToken(price.outputPerMTok) +
    (usage.cache_creation_input_tokens ?? 0) * perToken(input * price.cacheWriteMultiplier) +
    (usage.cache_read_input_tokens ?? 0) * perToken(input * price.cacheReadMultiplier)
  );
}

/**
 * Worst-case cost of one call: input counted at 3 characters per token (pessimistic for
 * English), all of it billed as a cache write, plus a full `max_tokens` of output.
 */
export function estimateCallCost(inputChars: number, model: string = COACH_MODEL): number {
  const inputTokens = Math.ceil(inputChars / 3);
  return costOfUsage(
    { input_tokens: 0, output_tokens: COACH_MAX_TOKENS, cache_creation_input_tokens: inputTokens, cache_read_input_tokens: 0 },
    model
  );
}

/** The monthly cap in US dollars: `COACH_MONTHLY_CAP_USD` if it is a valid number, else $10. */
export function monthlyCapUsd(): number {
  const raw = process.env.COACH_MONTHLY_CAP_USD;
  if (raw === undefined || raw.trim() === '') return DEFAULT_MONTHLY_CAP_USD;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MONTHLY_CAP_USD;
}

export interface MonthUsage {
  costUsd: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export interface UsageFile {
  version: 1;
  months: Record<string, MonthUsage>;
}

const emptyMonth = (): MonthUsage => ({
  costUsd: 0,
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
});

/** `YYYY-MM` in UTC. */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export class SpendTracker {
  private reservedUsd = 0;
  private data: UsageFile | null = null;

  constructor(
    private readonly file: string = dataPath('coach-usage.json'),
    private readonly now: () => Date = () => new Date()
  ) {}

  private load(): UsageFile {
    if (this.data) return this.data;
    let data: UsageFile = { version: 1, months: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<UsageFile>;
      if (parsed && typeof parsed.months === 'object' && parsed.months) data = { version: 1, months: parsed.months };
    } catch {
      // Missing or unreadable: start a fresh file. A corrupt file is replaced on the next write.
    }
    this.data = data;
    return data;
  }

  get month(): string {
    return monthKey(this.now());
  }

  /** What this month has cost so far (recorded calls only). */
  monthSpendUsd(): number {
    return this.load().months[this.month]?.costUsd ?? 0;
  }

  monthUsage(): MonthUsage {
    return { ...emptyMonth(), ...this.load().months[this.month] };
  }

  capUsd(): number {
    return monthlyCapUsd();
  }

  /** True once recorded spend has reached the cap. */
  isCapped(): boolean {
    return this.monthSpendUsd() >= this.capUsd();
  }

  /**
   * Reserves the worst-case cost of a call. Returns false (and reserves nothing) when the call
   * could take the month past the cap. Pair every successful reserve with `settle`.
   */
  reserve(estimateUsd: number): boolean {
    if (this.monthSpendUsd() + this.reservedUsd + estimateUsd > this.capUsd()) return false;
    this.reservedUsd += estimateUsd;
    return true;
  }

  /** Releases a reservation and records the real usage, if the call returned any. */
  settle(estimateUsd: number, usage?: UsageCounts | null): number {
    this.reservedUsd = Math.max(0, this.reservedUsd - estimateUsd);
    return usage ? this.record(usage) : 0;
  }

  /** Adds one response's usage to this month and saves the file. Returns its cost. */
  record(usage: UsageCounts): number {
    const cost = costOfUsage(usage);
    const data = this.load();
    const key = this.month;
    const month = { ...emptyMonth(), ...data.months[key] };
    month.costUsd += cost;
    month.requests += 1;
    month.inputTokens += usage.input_tokens;
    month.outputTokens += usage.output_tokens;
    month.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
    month.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    data.months[key] = month;
    writeFileAtomic(this.file, `${JSON.stringify(data, null, 2)}\n`);
    return cost;
  }
}

let shared: SpendTracker | null = null;

/** The process-wide tracker for `data/coach-usage.json`. */
export function getSpendTracker(): SpendTracker {
  shared ??= new SpendTracker();
  return shared;
}

/** Test hook: forget the shared tracker (e.g. after changing `CUBYNTRA_DATA_DIR`). */
export function resetSpendTrackerForTests(): void {
  shared = null;
}
