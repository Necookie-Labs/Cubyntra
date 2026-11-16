/**
 * Cubyntra - Coach Stream Wire Format Tests
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { createCoachEventParser, encodeCoachEvent } from '../src/coach/sse';
import { CoachStreamEvent } from '../src/coach/types';

const EVENTS: CoachStreamEvent[] = [
  { type: 'delta', text: 'Hold the cube\nwith yellow on top. ' },
  { type: 'replace', text: 'Template text.', reason: 'guard' },
  { type: 'done', source: 'template', mode: 'live', reason: 'guard', notice: 'n' },
];

describe('coach SSE format', () => {
  it('round-trips events split at any byte', () => {
    const wire = EVENTS.map(encodeCoachEvent).join('');
    for (const size of [1, 3, 7, wire.length]) {
      const got: CoachStreamEvent[] = [];
      const push = createCoachEventParser((e) => got.push(e));
      for (let i = 0; i < wire.length; i += size) push(wire.slice(i, i + size));
      expect(got).toEqual(EVENTS);
    }
  });

  it('names the event type and keeps the data on one line', () => {
    expect(encodeCoachEvent(EVENTS[0])).toBe(`event: delta\ndata: ${JSON.stringify(EVENTS[0])}\n\n`);
  });

  it('skips malformed or unknown events', () => {
    const got: CoachStreamEvent[] = [];
    const push = createCoachEventParser((e) => got.push(e));
    push('data: {nope\n\n: comment\n\ndata: {"type":"other"}\n\r\n\r\n');
    push(encodeCoachEvent(EVENTS[0]));
    expect(got).toEqual([EVENTS[0]]);
  });
});
