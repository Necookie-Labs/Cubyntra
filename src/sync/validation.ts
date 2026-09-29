/**
 * Cubyntra - Session Request Validation
 * Necookie Labs (c) 2026
 *
 * Pure parsers for untrusted request bodies arriving at the session relay routes.
 */

import { CubeColor, Face } from '../cube/types';
import { COLORS, FACES } from '../cube/constants';
import { CaptureQualitySummary, CapturedFaceImagePayload, FaceVerdictPayload } from './types';

/**
 * Upper bound on a face-photo request body. The phone sends a 512x512 JPEG at q0.9,
 * typically 60-150 KB as base64; this leaves generous headroom while refusing
 * anything that is clearly not a single cropped face photo.
 */
export const MAX_FACE_IMAGE_BODY_BYTES = 1.5 * 1024 * 1024;

const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,';
const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isFace(value: unknown): value is Face {
  return typeof value === 'string' && (FACES as readonly string[]).includes(value);
}

export function isCubeColor(value: unknown): value is CubeColor {
  return typeof value === 'string' && (COLORS as readonly string[]).includes(value);
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function parseQuality(value: unknown): CaptureQualitySummary | undefined {
  const q = asRecord(value);
  if (!q || typeof q.passed !== 'boolean' || !Array.isArray(q.failing)) return undefined;
  return {
    passed: q.passed,
    failing: q.failing.filter((f): f is string => typeof f === 'string').slice(0, 10),
  };
}

/** True when the body carries a photo rather than the legacy nine-color payload. */
export function isFaceImageBody(body: unknown): boolean {
  return typeof asRecord(body)?.imageDataUrl === 'string';
}

export function parseFaceImageBody(body: unknown): ParseResult<CapturedFaceImagePayload> {
  const b = asRecord(body);
  if (!b) return { ok: false, error: 'Expected a JSON object' };
  if (!isFace(b.face)) return { ok: false, error: 'Invalid face identifier' };

  const url = b.imageDataUrl;
  if (typeof url !== 'string' || !url.startsWith(JPEG_DATA_URL_PREFIX)) {
    return { ok: false, error: 'Expected a JPEG data URL' };
  }
  const data = url.slice(JPEG_DATA_URL_PREFIX.length);
  if (data.length === 0 || !BASE64_BODY.test(data)) {
    return { ok: false, error: 'Malformed image data' };
  }

  return {
    ok: true,
    value: {
      face: b.face,
      imageDataUrl: url,
      capturedAt: typeof b.capturedAt === 'number' ? b.capturedAt : Date.now(),
      quality: parseQuality(b.quality),
    },
  };
}

export function parseVerdictBody(body: unknown): ParseResult<FaceVerdictPayload> {
  const b = asRecord(body);
  if (!b) return { ok: false, error: 'Expected a JSON object' };
  if (!isFace(b.face)) return { ok: false, error: 'Invalid face identifier' };
  if (typeof b.accepted !== 'boolean') return { ok: false, error: 'accepted must be a boolean' };

  let previewColors: CubeColor[] | undefined;
  if (b.previewColors !== undefined) {
    if (!Array.isArray(b.previewColors) || b.previewColors.length !== 9 || !b.previewColors.every(isCubeColor)) {
      return { ok: false, error: 'previewColors must be 9 cube colors' };
    }
    previewColors = b.previewColors;
  }

  return {
    ok: true,
    value: {
      face: b.face,
      accepted: b.accepted,
      reason: typeof b.reason === 'string' ? b.reason.slice(0, 200) : undefined,
      previewColors,
    },
  };
}

export function parseFaceBody(body: unknown): ParseResult<Face> {
  const b = asRecord(body);
  return b && isFace(b.face) ? { ok: true, value: b.face } : { ok: false, error: 'Invalid face identifier' };
}
