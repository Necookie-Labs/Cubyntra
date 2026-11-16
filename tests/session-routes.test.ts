/**
 * Cubyntra - Sync route tests
 * Necookie Labs (c) 2026
 *
 * Every sync route: secret required, wrong secret 403, oversize bodies 413 (chunked, no
 * Content-Length), session cap, expiry, preferredId ignored, typed-code pairing, SSE cleanup on
 * abort.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as createSession } from '../src/app/api/session/route';
import { POST as pair } from '../src/app/api/session/pair/route';
import { DELETE as deleteSession, GET as getSession } from '../src/app/api/session/[id]/route';
import { POST as postMessage } from '../src/app/api/session/[id]/messages/route';
import { GET as getEvents } from '../src/app/api/session/[id]/events/route';
import { APP_TOKEN_HEADER, getAppSecret, getPairingToken } from '../src/lib/localAuth';
import { SESSION_SECRET_HEADER } from '../src/sync/pairing';
import { parsePairingFragment } from '../src/sync/pairingLink';
import { MAX_SESSIONS, SESSION_IDLE_MS, sessionManager } from '../src/sync/sessionManager';
import { messageLimiter, resetSyncLimitersForTests } from '../src/sync/server';
import { MAX_SYNC_BODY_BYTES, StreamEvent } from '../src/sync/types';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
  sessionManager.clearAll();
  resetSyncLimitersForTests();
});
afterEach(() => {
  sessionManager.clearAll();
  scratch.cleanup();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function create(body?: unknown): Promise<{ sessionId: string; secret: string; code: string; companionUrl: string }> {
  const res = await createSession(
    new Request('https://localhost:3000/api/session', {
      method: 'POST',
      headers: { host: 'localhost:3000', [APP_TOKEN_HEADER]: getAppSecret(), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  expect(res.status).toBe(200);
  return res.json();
}

function withSecret(url: string, secret: string | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (secret !== null) headers.set(SESSION_SECRET_HEADER, secret);
  return new Request(url, { ...init, headers });
}

const presence = { role: 'mobile', clientId: 'phone-client-1', type: 'presence', payload: { visible: true } };

function messageRequest(id: string, secret: string | null, body: unknown = presence) {
  return withSecret(`http://localhost/api/session/${id}/messages`, secret, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A body sent chunked (no Content-Length) that would go on far past the cap. */
function chunkedBody(totalBytes: number): ReadableStream<Uint8Array> {
  const chunk = new TextEncoder().encode('a'.repeat(1024));
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) return controller.close();
      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
}

describe('POST /api/session', () => {
  it('requires the app token', async () => {
    const res = await createSession(new Request('http://localhost:3000/api/session', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('returns credentials and a QR link that carries them in the fragment only', async () => {
    const s = await create();
    expect(s.secret).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(s.code).toMatch(/^[2-9A-Z]{6}$/);
    const url = new URL(s.companionUrl);
    expect(url.pathname).toBe('/companion');
    expect(url.search).toBe('');
    expect(parsePairingFragment(url.hash)).toEqual({ sessionId: s.sessionId, secret: s.secret, token: getPairingToken() });
  });

  it('ignores preferredId: it can neither choose nor overwrite a session', async () => {
    const first = await create();
    const second = await create({ preferredId: first.sessionId });
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(sessionManager.authorize(first.sessionId, first.secret)).toEqual({ ok: true });
  });

  it('answers 503 once every session slot has an open stream', async () => {
    for (let i = 0; i < MAX_SESSIONS; i++) {
      const s = await create();
      sessionManager.connect(s.sessionId, 'desktop');
    }
    const res = await createSession(
      new Request('http://localhost:3000/api/session', {
        method: 'POST',
        headers: { [APP_TOKEN_HEADER]: getAppSecret() },
      })
    );
    expect(res.status).toBe(503);
  });
});

describe('POST /api/session/pair', () => {
  const pairRequest = (body: unknown) =>
    pair(new Request('http://localhost/api/session/pair', { method: 'POST', body: JSON.stringify(body) }));

  it('trades the typed code for the credentials, once', async () => {
    const s = await create();
    const typed = `${s.code.slice(0, 3).toLowerCase()}-${s.code.slice(3)}`;
    const res = await pairRequest({ code: typed });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sessionId: s.sessionId, secret: s.secret, token: getPairingToken() });
    expect((await pairRequest({ code: s.code })).status).toBe(404);
  });

  it('rejects malformed codes and rate-limits guessing', async () => {
    expect((await pairRequest({ code: '12' })).status).toBe(400);
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await pairRequest({ code: 'ZZZZZZ' })).status;
    expect(last).toBe(429);
  });

  it('refuses an oversized chunked body', async () => {
    const res = await pair(
      new Request('http://localhost/api/session/pair', { method: 'POST', body: chunkedBody(64 * 1024), duplex: 'half' } as RequestInit)
    );
    expect(res.status).toBe(413);
  });
});

describe('GET and DELETE /api/session/[id]', () => {
  it('require the secret', async () => {
    const s = await create();
    const url = `http://localhost/api/session/${s.sessionId}`;
    expect((await getSession(withSecret(url, null), ctx(s.sessionId))).status).toBe(403);
    expect((await getSession(withSecret(url, 'A'.repeat(22)), ctx(s.sessionId))).status).toBe(403);
    expect((await deleteSession(withSecret(url, 'A'.repeat(22), { method: 'DELETE' }), ctx(s.sessionId))).status).toBe(403);
    expect(sessionManager.has(s.sessionId)).toBe(true);

    const got = await getSession(withSecret(url, s.secret), ctx(s.sessionId));
    expect(got.status).toBe(200);
    expect(JSON.stringify(await got.json())).not.toContain(s.secret);

    expect((await deleteSession(withSecret(url, s.secret, { method: 'DELETE' }), ctx(s.sessionId))).status).toBe(200);
    expect(sessionManager.has(s.sessionId)).toBe(false);
    expect((await getSession(withSecret(url, s.secret), ctx(s.sessionId))).status).toBe(404);
  });

  it('404 once the session has expired', async () => {
    const s = await create();
    sessionManager.purgeExpired(Date.now() + SESSION_IDLE_MS + 1);
    const res = await getSession(withSecret(`http://localhost/api/session/${s.sessionId}`, s.secret), ctx(s.sessionId));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/session/[id]/messages', () => {
  it('requires the secret', async () => {
    const s = await create();
    expect((await postMessage(messageRequest(s.sessionId, null), ctx(s.sessionId))).status).toBe(403);
    const wrong = s.secret.slice(0, -1) + (s.secret.endsWith('A') ? 'B' : 'A');
    expect((await postMessage(messageRequest(s.sessionId, wrong), ctx(s.sessionId))).status).toBe(403);
    expect((await postMessage(messageRequest('missing', s.secret), ctx('missing'))).status).toBe(404);
  });

  it('relays a valid message with a sequence number', async () => {
    const s = await create();
    const res = await postMessage(messageRequest(s.sessionId, s.secret), ctx(s.sessionId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, seq: 1 });
  });

  it('drops the message rate count of a deleted session', async () => {
    const s = await create();
    await postMessage(messageRequest(s.sessionId, s.secret), ctx(s.sessionId));
    expect(messageLimiter.size).toBe(1);
    sessionManager.deleteSession(s.sessionId);
    expect(messageLimiter.size).toBe(0);
  });

  it('rejects invalid messages', async () => {
    const s = await create();
    const res = await postMessage(messageRequest(s.sessionId, s.secret, { ...presence, type: 'face-image' }), ctx(s.sessionId));
    expect(res.status).toBe(400);
  });

  it('refuses an oversized chunked body without buffering it', async () => {
    const s = await create();
    const req = withSecret(`http://localhost/api/session/${s.sessionId}/messages`, s.secret, {
      method: 'POST',
      body: chunkedBody(10 * MAX_SYNC_BODY_BYTES),
      duplex: 'half',
    } as RequestInit);
    expect(req.headers.get('content-length')).toBeNull();
    expect((await postMessage(req, ctx(s.sessionId))).status).toBe(413);
  });

  it('refuses a declared oversized body', async () => {
    const s = await create();
    const req = withSecret(`http://localhost/api/session/${s.sessionId}/messages`, s.secret, {
      method: 'POST',
      body: JSON.stringify(presence),
      headers: { 'content-length': String(MAX_SYNC_BODY_BYTES + 1) },
    });
    expect((await postMessage(req, ctx(s.sessionId))).status).toBe(413);
  });
});

describe('GET /api/session/[id]/events', () => {
  async function readFrame(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<StreamEvent> {
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    return JSON.parse(text.replace(/^data: /, '').trim());
  }

  it('requires the secret and a role', async () => {
    const s = await create();
    const url = `http://localhost/api/session/${s.sessionId}/events?role=mobile`;
    expect((await getEvents(withSecret(url, null), ctx(s.sessionId))).status).toBe(403);
    expect((await getEvents(withSecret(url, 'A'.repeat(22)), ctx(s.sessionId))).status).toBe(403);
    const noRole = withSecret(`http://localhost/api/session/${s.sessionId}/events`, s.secret);
    expect((await getEvents(noRole, ctx(s.sessionId))).status).toBe(400);
  });

  it('starts with a snapshot and cleans up when the request is aborted', async () => {
    const s = await create();
    const abort = new AbortController();
    const req = withSecret(`http://localhost/api/session/${s.sessionId}/events?role=mobile`, s.secret, {
      signal: abort.signal,
    });
    const res = await getEvents(req, ctx(s.sessionId));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();

    const first = await readFrame(reader);
    expect(first.kind).toBe('snapshot');
    expect(JSON.stringify(first)).not.toContain(s.secret);
    expect(sessionManager.snapshot(s.sessionId)!.connections.mobile).toBe(1);
    expect(sessionManager.listenerCount(s.sessionId)).toBe(1);

    abort.abort();

    expect(sessionManager.snapshot(s.sessionId)!.connections.mobile).toBe(0);
    expect(sessionManager.listenerCount(s.sessionId)).toBe(0);
    expect((await reader.read()).done).toBe(true);
  });

  it('cleans up once when the client cancels', async () => {
    const s = await create();
    const req = withSecret(`http://localhost/api/session/${s.sessionId}/events?role=desktop`, s.secret);
    const res = await getEvents(req, ctx(s.sessionId));
    const reader = res.body!.getReader();
    await readFrame(reader);
    await reader.cancel();
    expect(sessionManager.snapshot(s.sessionId)!.connections.desktop).toBe(0);
    expect(sessionManager.listenerCount(s.sessionId)).toBe(0);
  });

  it('sends ended and closes when the session is deleted', async () => {
    const s = await create();
    const res = await getEvents(
      withSecret(`http://localhost/api/session/${s.sessionId}/events?role=desktop`, s.secret),
      ctx(s.sessionId)
    );
    const reader = res.body!.getReader();
    await readFrame(reader);
    sessionManager.deleteSession(s.sessionId);
    expect(await readFrame(reader)).toEqual({ kind: 'ended', reason: 'deleted' });
    expect((await reader.read()).done).toBe(true);
  });
});
