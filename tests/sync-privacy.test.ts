/**
 * Cubyntra - Sync privacy tests (ADR-015: no pixels leave the device)
 * Necookie Labs (c) 2026
 *
 * No sync route accepts or returns image data, no sync message type can carry an image, and the
 * phone and laptop sync code never produce or send one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as createSession } from '../src/app/api/session/route';
import { GET as getSession } from '../src/app/api/session/[id]/route';
import { POST as postMessage } from '../src/app/api/session/[id]/messages/route';
import { APP_TOKEN_HEADER, getAppSecret } from '../src/lib/localAuth';
import { SESSION_SECRET_HEADER } from '../src/sync/pairing';
import { sessionManager } from '../src/sync/sessionManager';
import { resetSyncLimitersForTests } from '../src/sync/server';
import { createSolvedCubeState } from '../src/cube/constants';
import { SYNC_MESSAGE_TYPES, StreamEvent, SyncMessageType } from '../src/sync/types';
import { parseSyncMessage } from '../src/sync/validation';
import { useScratchDataDir } from './helpers/scratchData';

const IMAGE = `data:image/jpeg;base64,/9j/${'A'.repeat(4000)}`;
const BLOB = 'Q'.repeat(4000);
/** A data URL, or a long run of base64 characters (an encoded image or file). */
const IMAGE_LIKE = /data:image\/|data:[a-z]+\/[a-z0-9.+-]+;base64,|[A-Za-z0-9+/]{256,}={0,2}/;

const VALID: Record<SyncMessageType, Record<string, unknown>> = {
  'cube-state': { state: createSolvedCubeState() },
  'face-scanned': {
    face: 'U',
    colors: Array(9).fill('white'),
    confidences: Array(9).fill(1),
    tileRgb: Array(9).fill([240, 240, 240]),
    capturedAt: 1,
  },
  step: { method: 'cfop', stepIndex: 1, planId: 'p-1', algorithm: "R U R'" },
  playback: { action: 'seek', index: 2 },
  grip: { top: 'yellow', front: 'green' },
  'checkpoint-result': { planId: 'p-1', stepIndex: 1, result: 'matched' },
  presence: { visible: true, screen: 'solve' },
  'scan-control': { action: 'rescan', face: 'F' },
};

const repoFile = (...parts: string[]) => path.join(process.cwd(), ...parts);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );
}

describe('sync messages cannot carry images', () => {
  it('covers every message type', () => {
    expect(Object.keys(VALID).sort()).toEqual([...SYNC_MESSAGE_TYPES].sort());
  });

  it.each(SYNC_MESSAGE_TYPES)('%s drops or rejects image data in any field', (type) => {
    const base = VALID[type];
    const variants = [
      { ...base, image: IMAGE, imageDataUrl: IMAGE, thumbnail: IMAGE, photo: BLOB },
      ...Object.keys(base).map((key) => ({ ...base, [key]: IMAGE })),
      ...Object.keys(base).map((key) => ({ ...base, [key]: BLOB })),
    ];
    for (const payload of variants) {
      const parsed = parseSyncMessage({ type, payload, role: 'mobile', clientId: 'phone-client-1', extra: IMAGE });
      if (parsed.ok) expect(JSON.stringify(parsed.value)).not.toMatch(IMAGE_LIKE);
    }
  });

  it('no type in the protocol is about images', () => {
    expect(SYNC_MESSAGE_TYPES.join(' ')).not.toMatch(/image|photo|picture|thumbnail|frame|video/i);
  });
});

describe('sync routes neither accept nor return image data', () => {
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

  it('the photo routes are gone', () => {
    for (const dir of ['face', 'verdict', 'confirm', 'rescan', 'reset']) {
      expect(fs.existsSync(repoFile('src', 'app', 'api', 'session', '[id]', dir))).toBe(false);
    }
  });

  it('a message smuggling an image is refused or stripped, and nothing image-like comes back', async () => {
    const created = await createSession(
      new Request('http://localhost:3000/api/session', {
        method: 'POST',
        headers: { host: 'localhost:3000', [APP_TOKEN_HEADER]: getAppSecret() },
      })
    );
    const { sessionId, secret } = await created.json();
    const ctx = { params: Promise.resolve({ id: sessionId }) };
    const relayed: StreamEvent[] = [];
    sessionManager.subscribe(sessionId, (e) => relayed.push(e));

    const post = (body: unknown) =>
      postMessage(
        new Request(`http://localhost/api/session/${sessionId}/messages`, {
          method: 'POST',
          headers: { [SESSION_SECRET_HEADER]: secret },
          body: JSON.stringify(body),
        }),
        ctx
      );

    const smuggled = await post({
      type: 'face-scanned',
      role: 'mobile',
      clientId: 'phone-client-1',
      payload: { ...VALID['face-scanned'], imageDataUrl: IMAGE, thumbnail: IMAGE },
      imageDataUrl: IMAGE,
    });
    expect(smuggled.status).toBe(200);
    expect(JSON.stringify(await smuggled.json())).not.toMatch(IMAGE_LIKE);

    const legacy = await post({ face: 'U', imageDataUrl: IMAGE });
    expect(legacy.status).toBe(400);
    const imageType = await post({ type: 'face-image', role: 'mobile', clientId: 'phone-client-1', payload: { image: IMAGE } });
    expect(imageType.status).toBe(400);

    expect(JSON.stringify(relayed)).not.toMatch(IMAGE_LIKE);
    const snapshot = await getSession(
      new Request(`http://localhost/api/session/${sessionId}`, { headers: { [SESSION_SECRET_HEADER]: secret } }),
      ctx
    );
    expect(JSON.stringify(await snapshot.json())).not.toMatch(IMAGE_LIKE);
  });
});

describe('sync code never produces or sends an image', () => {
  const files = [
    ...walk(repoFile('src', 'sync')),
    ...walk(repoFile('src', 'app', 'api', 'session')),
    repoFile('src', 'app', 'companion', 'page.tsx'),
  ];

  it.each(files.map((f) => [path.relative(process.cwd(), f), f]))('%s', (_name, file) => {
    let source = fs.readFileSync(file, 'utf8');
    // The laptop draws its own pairing QR code locally; that image is shown, never sent.
    if (file.endsWith('useCompanionSync.ts')) source = source.replace(/QRCode\.toDataURL/g, '');
    expect(source).not.toMatch(/toDataURL|toBlob|image\/jpeg|image\/png|imageDataUrl|thumbnail|FormData|new Blob/);
  });
});
