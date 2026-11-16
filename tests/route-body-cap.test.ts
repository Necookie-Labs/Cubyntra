/**
 * Cubyntra - Body caps on the coach and student routes
 * Necookie Labs (c) 2026
 *
 * Both routes read their body in chunks and stop at the cap: an oversized chunked body (no
 * Content-Length) gets a 413 without being read to the end.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postCoach } from '../src/app/api/coach/route';
import * as studentRoute from '../src/app/api/student/route';
import { MAX_REQUEST_BYTES } from '../src/coach/types';
import { APP_TOKEN_HEADER, coachRateLimiter, getAppSecret } from '../src/lib/localAuth';
import { MAX_STUDENT_BYTES } from '../src/lib/studentProfile';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
  coachRateLimiter.reset();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  scratch.cleanup();
});

/** A chunked body of `total` bytes (no Content-Length) that counts the chunks pulled. */
function chunkedBody(total: number, chunkSize = 1024) {
  let sent = 0;
  let pulled = 0;
  const chunk = new Uint8Array(chunkSize).fill(32); // spaces: valid JSON padding
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      pulled++;
      sent += chunkSize;
      controller.enqueue(chunk);
    },
  });
  return { body, pulled: () => pulled };
}

const request = (url: string, method: string, body: ReadableStream<Uint8Array>) =>
  new Request(url, {
    method,
    body,
    duplex: 'half',
    headers: { [APP_TOKEN_HEADER]: getAppSecret(), 'Content-Type': 'application/json' },
  } as RequestInit);

describe('chunked oversized bodies', () => {
  it('POST /api/coach answers 413 and stops reading', async () => {
    const { body, pulled } = chunkedBody(MAX_REQUEST_BYTES * 50);
    const res = await postCoach(request('http://localhost/api/coach', 'POST', body));
    expect(res.status).toBe(413);
    expect(pulled()).toBeLessThan(MAX_REQUEST_BYTES / 1024 + 4);
  });

  it('the student write route answers 413 and stops reading', async () => {
    const write = (studentRoute as Record<string, unknown>).PATCH ?? (studentRoute as Record<string, unknown>).PUT;
    const method = 'PATCH' in studentRoute ? 'PATCH' : 'PUT';
    const { body, pulled } = chunkedBody(MAX_STUDENT_BYTES * 20);
    const res = await (write as (req: Request) => Promise<Response>)(request('http://localhost/api/student', method, body));
    expect(res.status).toBe(413);
    expect(pulled()).toBeLessThan(MAX_STUDENT_BYTES / 1024 + 4);
  });
});
