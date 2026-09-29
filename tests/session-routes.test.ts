/**
 * Cubyntra - Session Relay Route & Validation Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { sessionManager } from '../src/sync/sessionManager';
import {
  MAX_FACE_IMAGE_BODY_BYTES,
  parseFaceImageBody,
  parseVerdictBody,
} from '../src/sync/validation';
import { POST as postFace, GET as getFace } from '../src/app/api/session/[id]/face/route';
import { POST as postVerdict } from '../src/app/api/session/[id]/verdict/route';
import { POST as postConfirm } from '../src/app/api/session/[id]/confirm/route';
import { POST as postReset } from '../src/app/api/session/[id]/reset/route';
import { SessionEvent } from '../src/sync/types';

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/';

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('parseFaceImageBody', () => {
  it('accepts a well-formed JPEG face photo', () => {
    const r = parseFaceImageBody({ face: 'F', imageDataUrl: JPEG, capturedAt: 5 });
    expect(r).toEqual({ ok: true, value: { face: 'F', imageDataUrl: JPEG, capturedAt: 5, quality: undefined } });
  });

  it.each([
    [{ face: 'X', imageDataUrl: JPEG }, 'Invalid face identifier'],
    [{ face: 'F', imageDataUrl: 'data:image/png;base64,AAAA' }, 'Expected a JPEG data URL'],
    [{ face: 'F', imageDataUrl: 'data:image/jpeg;base64,' }, 'Malformed image data'],
    [{ face: 'F', imageDataUrl: 'data:image/jpeg;base64,<script>' }, 'Malformed image data'],
    [null, 'Expected a JSON object'],
  ])('rejects %j', (body, error) => {
    expect(parseFaceImageBody(body)).toEqual({ ok: false, error });
  });

  it('keeps only well-typed quality fields', () => {
    const r = parseFaceImageBody({
      face: 'U',
      imageDataUrl: JPEG,
      quality: { passed: false, failing: ['glare', 42, 'exposure'] },
    });
    expect(r.ok && r.value.quality).toEqual({ passed: false, failing: ['glare', 'exposure'] });
  });
});

describe('parseVerdictBody', () => {
  it('requires nine valid colors when a preview is included', () => {
    expect(parseVerdictBody({ face: 'U', accepted: true, previewColors: ['red'] }).ok).toBe(false);
    expect(parseVerdictBody({ face: 'U', accepted: true, previewColors: Array(9).fill('purple') }).ok).toBe(false);
    expect(parseVerdictBody({ face: 'U', accepted: true, previewColors: Array(9).fill('red') }).ok).toBe(true);
  });

  it('caps the reason length shown on the phone', () => {
    const r = parseVerdictBody({ face: 'U', accepted: false, reason: 'x'.repeat(500) });
    expect(r.ok && r.value.reason?.length).toBe(200);
  });
});

describe('face photo routes', () => {
  beforeEach(() => {
    sessionManager.clearAll();
    sessionManager.createSession('route-1');
  });

  it('stores a posted photo and serves it back to the desktop', async () => {
    const res = await postFace(
      jsonRequest('http://x/api/session/route-1/face', { face: 'R', imageDataUrl: JPEG }),
      ctx('route-1')
    );
    expect(res.status).toBe(200);

    const got = await getFace(new NextRequest('http://x/api/session/route-1/face?face=R'), ctx('route-1'));
    expect(got.status).toBe(200);
    expect(got.headers.get('cache-control')).toBe('no-store');
    expect((await got.json()).image.imageDataUrl).toBe(JPEG);
  });

  it('refuses an oversized body by its declared length', async () => {
    const res = await postFace(
      jsonRequest('http://x/api/session/route-1/face', { face: 'R', imageDataUrl: JPEG }, {
        'content-length': String(MAX_FACE_IMAGE_BODY_BYTES + 1),
      }),
      ctx('route-1')
    );
    expect(res.status).toBe(413);
  });

  it('refuses an oversized body even without a declared length', async () => {
    const huge = JSON.stringify({ face: 'R', imageDataUrl: JPEG + 'A'.repeat(MAX_FACE_IMAGE_BODY_BYTES) });
    const res = await postFace(jsonRequest('http://x/api/session/route-1/face', huge), ctx('route-1'));
    expect(res.status).toBe(413);
    expect(sessionManager.getFaceImage('route-1', 'R')).toBeNull();
  });

  it('still accepts the legacy nine-color payload', async () => {
    const res = await postFace(
      jsonRequest('http://x/api/session/route-1/face', { face: 'U', stickers: Array(9).fill('white') }),
      ctx('route-1')
    );
    expect(res.status).toBe(200);
    expect(sessionManager.getSession('route-1')?.scannedFaces.U).toBeDefined();
  });

  it('returns 404 for an unknown session', async () => {
    const res = await postFace(
      jsonRequest('http://x/api/session/nope/face', { face: 'U', imageDataUrl: JPEG }),
      ctx('nope')
    );
    expect(res.status).toBe(404);
  });

  it('records verdicts and drops photos on confirm', async () => {
    await postFace(jsonRequest('http://x/api/session/route-1/face', { face: 'D', imageDataUrl: JPEG }), ctx('route-1'));

    const verdict = await postVerdict(
      jsonRequest('http://x/api/session/route-1/verdict', { face: 'D', accepted: false, reason: 'Glare' }),
      ctx('route-1')
    );
    expect(verdict.status).toBe(200);
    expect(sessionManager.getSession('route-1')?.verdicts.D?.reason).toBe('Glare');

    const confirm = await postConfirm(new NextRequest('http://x', { method: 'POST' }), ctx('route-1'));
    expect(confirm.status).toBe(200);
    expect(sessionManager.getFaceImage('route-1', 'D')).toBeNull();
  });
});

describe('phone "scan another cube"', () => {
  beforeEach(() => {
    sessionManager.clearAll();
    sessionManager.createSession('reset-1');
  });

  it('clears photos and tells the computer the phone started over', async () => {
    const events: SessionEvent[] = [];
    sessionManager.subscribe('reset-1', (e) => events.push(e));
    await postFace(jsonRequest('http://x/api/session/reset-1/face', { face: 'U', imageDataUrl: JPEG }), ctx('reset-1'));

    const res = await postReset(new NextRequest('http://x', { method: 'POST' }), ctx('reset-1'));

    expect(res.status).toBe(200);
    expect(events.at(-1)).toMatchObject({ type: 'SESSION_RESET', sender: 'mobile' });
    expect(sessionManager.getFaceImage('reset-1', 'U')).toBeNull();
    expect(sessionManager.getSession('reset-1')?.imageFaces).toEqual([]);
  });

  it('returns 404 once the pairing has ended', async () => {
    const res = await postReset(new NextRequest('http://x', { method: 'POST' }), ctx('gone'));
    expect(res.status).toBe(404);
  });
});
