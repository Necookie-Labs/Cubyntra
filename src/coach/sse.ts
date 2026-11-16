/**
 * Cubyntra - Coach Stream Wire Format
 * Necookie Labs (c) 2026
 *
 * `/api/coach` answers with Server-Sent Events (`text/event-stream`). Each event is
 *
 *   event: <delta | replace | done>
 *   data: <the CoachStreamEvent as one line of JSON>
 *
 * followed by a blank line. `delta` appends text, `replace` swaps everything shown so far for a
 * template, and `done` ends the reply. Used by the route (encode) and the hook (parse).
 */

import type { CoachStreamEvent } from './types';

export function encodeCoachEvent(event: CoachStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function isCoachEvent(value: unknown): value is CoachStreamEvent {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  if (e.type === 'delta') return typeof e.text === 'string';
  if (e.type === 'replace') return typeof e.text === 'string' && typeof e.reason === 'string';
  if (e.type === 'done') return e.source === 'live' || e.source === 'template';
  return false;
}

/** Incremental parser: feed it text chunks as they arrive; complete events go to `onEvent`. */
export function createCoachEventParser(onEvent: (event: CoachStreamEvent) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        const parsed: unknown = JSON.parse(data);
        if (isCoachEvent(parsed)) onEvent(parsed);
      } catch {
        // Ignore a malformed event rather than breaking the whole reply.
      }
    }
  };
}
