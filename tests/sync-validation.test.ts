/**
 * Cubyntra - Sync message validation tests
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import { parseSyncMessage } from '../src/sync/validation';
import { SyncMessageType } from '../src/sync/types';

const base = { role: 'mobile', clientId: 'client-abc123' };

const face = {
  face: 'F',
  colors: Array(9).fill('green'),
  confidences: Array(9).fill(0.9),
  tileRgb: Array(9).fill([20, 160, 60]),
  capturedAt: 1,
};

function msg(type: SyncMessageType | string, payload: unknown, extra: Record<string, unknown> = {}) {
  return parseSyncMessage({ ...base, type, payload, ...extra });
}

describe('sync message envelope', () => {
  it('requires a known role, a client id and a known type', () => {
    expect(parseSyncMessage(null).ok).toBe(false);
    expect(msg('presence', { visible: true }, { role: 'server' }).ok).toBe(false);
    expect(msg('presence', { visible: true }, { clientId: 'x' }).ok).toBe(false);
    expect(msg('face-image', { face: 'F' }).ok).toBe(false);
    expect(msg('presence', { visible: true })).toEqual({
      ok: true,
      value: { type: 'presence', payload: { visible: true }, ...base },
    });
  });

  it('drops unknown fields instead of relaying them', () => {
    const r = msg('face-scanned', { ...face, imageDataUrl: 'data:image/jpeg;base64,AAAA', thumbnail: 'x' }, { blob: 1 });
    expect(r.ok).toBe(true);
    const text = JSON.stringify(r.ok && r.value);
    expect(text).not.toContain('data:image');
    expect(text).not.toContain('thumbnail');
    expect(text).not.toContain('blob');
  });
});

describe('message payloads', () => {
  it('face-scanned needs nine colors, confidences and tile means', () => {
    expect(msg('face-scanned', face).ok).toBe(true);
    expect(msg('face-scanned', { ...face, face: 'X' }).ok).toBe(false);
    expect(msg('face-scanned', { ...face, colors: Array(8).fill('green') }).ok).toBe(false);
    expect(msg('face-scanned', { ...face, colors: Array(9).fill('purple') }).ok).toBe(false);
    expect(msg('face-scanned', { ...face, confidences: Array(9).fill(2) }).ok).toBe(false);
    expect(msg('face-scanned', { ...face, tileRgb: Array(9).fill([300, 0, 0]) }).ok).toBe(false);
    expect(msg('face-scanned', { ...face, tileRgb: Array(9).fill([1.5, 0, 0]) }).ok).toBe(false);
  });

  it('cube-state needs six faces of nine colors', () => {
    expect(msg('cube-state', { state: createSolvedCubeState() }).ok).toBe(true);
    expect(msg('cube-state', { state: { ...createSolvedCubeState(), U: ['white'] } }).ok).toBe(false);
  });

  it('step checks method, index, plan id and algorithm notation', () => {
    const step = { method: 'cfop', stepIndex: 3, planId: 'cfop:f2l:12', algorithm: "R U R' U'" };
    expect(msg('step', step).ok).toBe(true);
    expect(msg('step', { ...step, method: 'roux' }).ok).toBe(false);
    expect(msg('step', { ...step, stepIndex: -1 }).ok).toBe(false);
    expect(msg('step', { ...step, solveStartedAt: '2026-11-17T10:00:00.000Z' }).ok).toBe(true);
    expect(msg('step', { ...step, solveStartedAt: 'yesterday' }).ok).toBe(false);
    expect(msg('step', { ...step, planId: 'has spaces' }).ok).toBe(false);
    expect(msg('step', { ...step, algorithm: 'R Q' }).ok).toBe(false);
    expect(msg('step', { ...step, algorithm: 'R '.repeat(201) }).ok).toBe(false);
  });

  it('playback needs an index for seek/index and a bounded speed', () => {
    expect(msg('playback', { action: 'play' }).ok).toBe(true);
    expect(msg('playback', { action: 'seek', index: 4 }).ok).toBe(true);
    expect(msg('playback', { action: 'seek' }).ok).toBe(false);
    expect(msg('playback', { action: 'index', index: -2 }).ok).toBe(false);
    expect(msg('playback', { action: 'speed', speed: 2 }).ok).toBe(true);
    expect(msg('playback', { action: 'speed', speed: 100 }).ok).toBe(false);
    expect(msg('playback', { action: 'rewind' }).ok).toBe(false);
  });

  it('grip must be physically possible', () => {
    expect(msg('grip', { top: 'yellow', front: 'red' }).ok).toBe(true);
    expect(msg('grip', { top: 'white', front: 'yellow' }).ok).toBe(false);
    expect(msg('grip', { top: 'yellow', front: 'red', planId: 'step-abc', stepIndex: 3 }).ok).toBe(true);
    expect(msg('grip', { top: 'yellow', front: 'red', planId: 'bad id!', stepIndex: 3 }).ok).toBe(false);
    expect(msg('grip', { top: 'yellow', front: 'red', planId: 'step-abc', stepIndex: -1 }).ok).toBe(false);
  });

  it('checkpoint-result checks the result and mistake kinds', () => {
    const cp = { planId: 'p1', stepIndex: 0, result: 'mismatch', mistakes: ['wrong-direction'] };
    expect(msg('checkpoint-result', cp).ok).toBe(true);
    expect(msg('checkpoint-result', { ...cp, result: 'great' }).ok).toBe(false);
    expect(msg('checkpoint-result', { ...cp, mistakes: ['typo'] }).ok).toBe(false);
  });

  it('presence and scan-control', () => {
    expect(msg('presence', { visible: false, screen: 'solve' }).ok).toBe(true);
    expect(msg('presence', { visible: 'yes' }).ok).toBe(false);
    expect(msg('scan-control', { action: 'rescan', face: 'L' }).ok).toBe(true);
    expect(msg('scan-control', { action: 'rescan' }).ok).toBe(false);
    expect(msg('scan-control', { action: 'confirmed' }).ok).toBe(true);
    expect(msg('scan-control', { action: 'explode' }).ok).toBe(false);
  });
});
