/**
 * Cubyntra - Student Profile Route
 * GET   /api/student -> the saved profile (or the default one)
 * PATCH /api/student -> applies `{ ops: ProfileOp[], batchId? }` to the saved profile
 *
 * Both need the app secret in the `x-cubyntra-token` header, like the coach. In the hosted modes
 * (ADR-017) each signed-in person has their own file, `data/students/<slug>.json`, and only ever
 * reads and changes that one. A device sends
 * what changed, never its whole profile, so a paired phone or a second tab cannot wipe what the
 * laptop saved (see `src/lib/profileOps.ts` for how each operation merges). Updates run one at a
 * time per process; the merged profile is validated as a whole before the atomic write to
 * `data/student.json`. The body is read in chunks and capped at `MAX_STUDENT_BYTES`.
 *
 * `batchId` makes a retry safe: a batch already applied (its answer was lost) is not applied
 * again. There is no whole-profile PUT: nothing needs one, and it is how saves used to clobber.
 */

import { applyProfileOps, parseProfileOps } from '@/lib/profileOps';
import { MAX_STUDENT_BYTES, parseStudentProfile } from '@/lib/studentProfile';
import { ProfileTooLargeError, readStudentProfile, updateStudentProfile } from '@/lib/studentFile';
import { readJsonCapped } from '@/lib/readBodyCapped';
import { guardUser, profileSlugFor } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const tooLarge = () => Response.json({ error: 'The profile is too large' }, { status: 413 });

/** Batch ids applied lately (oldest first), so a retried batch is not applied twice. */
const appliedBatches = new Set<string>();
const MAX_REMEMBERED_BATCHES = 500;

class InvalidProfileError extends Error {}

export async function GET(req: Request) {
  const guard = await guardUser(req);
  if (!guard.ok) return guard.response;
  return Response.json(readStudentProfile(profileSlugFor(guard.user)), { headers: NO_STORE });
}

export async function PATCH(req: Request) {
  const guard = await guardUser(req);
  if (!guard.ok) return guard.response;
  const slug = profileSlugFor(guard.user);

  const body = await readJsonCapped(req, MAX_STUDENT_BYTES);
  if (!body.ok) return body.status === 413 ? tooLarge() : Response.json({ error: 'The body is not JSON' }, { status: 400 });
  const parsed = parseProfileOps(body.value);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  // Batch ids are remembered per person, so one person's id can never skip another's batch.
  const batchKey = parsed.batchId ? `${slug ?? 'local'}:${parsed.batchId}` : undefined;
  const { ops } = parsed;

  try {
    const saved = await updateStudentProfile((profile) => {
      if (batchKey && appliedBatches.has(batchKey)) return profile;
      const next = parseStudentProfile(applyProfileOps(profile, ops));
      if (!next.ok) throw new InvalidProfileError(next.error);
      return next.profile;
    }, slug);
    if (batchKey) {
      appliedBatches.add(batchKey);
      if (appliedBatches.size > MAX_REMEMBERED_BATCHES) appliedBatches.delete(appliedBatches.values().next().value!);
    }
    return Response.json(saved, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof InvalidProfileError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof ProfileTooLargeError) return tooLarge();
    console.error('[Cubyntra] Saving the student profile failed:', error);
    return Response.json({ error: 'The profile could not be saved' }, { status: 500 });
  }
}
