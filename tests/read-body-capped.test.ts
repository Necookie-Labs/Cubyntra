/**
 * Cubyntra - Size-capped body reader tests
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { readBodyCapped, readJsonCapped } from '../src/lib/readBodyCapped';

/** A chunked request body (no Content-Length) that counts how many chunks were pulled. */
function chunkedRequest(chunkCount: number, chunkSize: number) {
  let pulled = 0;
  const chunk = new Uint8Array(chunkSize).fill(97);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunkCount) {
        controller.close();
        return;
      }
      pulled++;
      controller.enqueue(chunk);
    },
  });
  const req = new Request('http://localhost/x', { method: 'POST', body, duplex: 'half' } as RequestInit);
  return { req, pulled: () => pulled };
}

describe('readBodyCapped', () => {
  it('reads a body under the cap', async () => {
    const req = new Request('http://localhost/x', { method: 'POST', body: '{"a":1}' });
    expect(await readBodyCapped(req, 100)).toEqual({ ok: true, text: '{"a":1}' });
  });

  it('refuses a declared Content-Length over the cap without reading', async () => {
    const req = new Request('http://localhost/x', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': '5000' },
    });
    expect(await readBodyCapped(req, 100)).toMatchObject({ ok: false, status: 413 });
  });

  it('stops reading a chunked body as soon as it passes the cap', async () => {
    const { req, pulled } = chunkedRequest(1000, 1024);
    const result = await readBodyCapped(req, 16 * 1024);
    expect(result).toMatchObject({ ok: false, status: 413 });
    // 17 chunks cross 16 KB; the stream is cancelled long before its 1000 chunks.
    expect(pulled()).toBeLessThan(20);
  });

  it('counts bytes, not characters', async () => {
    const req = new Request('http://localhost/x', { method: 'POST', body: 'é'.repeat(60) }); // 120 bytes
    expect(await readBodyCapped(req, 100)).toMatchObject({ ok: false, status: 413 });
  });

  it('rejects invalid UTF-8', async () => {
    const req = new Request('http://localhost/x', { method: 'POST', body: new Uint8Array([0xff, 0xfe]) });
    expect(await readBodyCapped(req, 100)).toMatchObject({ ok: false, status: 400 });
  });
});

describe('readJsonCapped', () => {
  it('parses JSON and reports bad JSON as 400', async () => {
    const good = new Request('http://localhost/x', { method: 'POST', body: '[1,2]' });
    expect(await readJsonCapped(good, 100)).toEqual({ ok: true, value: [1, 2] });
    const bad = new Request('http://localhost/x', { method: 'POST', body: '{' });
    expect(await readJsonCapped(bad, 100)).toMatchObject({ ok: false, status: 400 });
  });
});
