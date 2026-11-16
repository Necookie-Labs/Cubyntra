/**
 * Cubyntra - Student Profile Route
 * GET /api/student -> the saved profile (or the default one)
 * PUT /api/student -> replaces the profile; the body is a whole `StudentProfile`
 *
 * Both need the app secret in the `x-cubyntra-token` header, like the coach. The body is
 * capped at `MAX_STUDENT_BYTES` and validated (version, settings, palette, current solve)
 * before an atomic write to `data/student.json`.
 */

import { guardRequest } from '@/lib/localAuth';
import { MAX_STUDENT_BYTES, parseStudentProfile } from '@/lib/studentProfile';
import { ProfileTooLargeError, readStudentProfile, writeStudentProfile } from '@/lib/studentFile';
import { readJsonCapped } from '@/lib/readBodyCapped';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const tooLarge = () => Response.json({ error: 'The profile is too large' }, { status: 413 });

export async function GET(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  return Response.json(readStudentProfile(), { headers: NO_STORE });
}

export async function PUT(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;

  // Read in chunks and stop at the cap, so a chunked body with no Content-Length is never
  // buffered in full.
  const body = await readJsonCapped(req, MAX_STUDENT_BYTES);
  if (!body.ok) return body.status === 413 ? tooLarge() : Response.json({ error: 'The body is not JSON' }, { status: 400 });
  const parsed = parseStudentProfile(body.value);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    await writeStudentProfile(parsed.profile);
  } catch (error) {
    if (error instanceof ProfileTooLargeError) return tooLarge();
    console.error('[Cubyntra] Saving the student profile failed:', error);
    return Response.json({ error: 'The profile could not be saved' }, { status: 500 });
  }
  return Response.json(parsed.profile, { headers: NO_STORE });
}
