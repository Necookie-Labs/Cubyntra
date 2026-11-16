/**
 * Cubyntra - Size-capped request body reader (server only)
 * Necookie Labs (c) 2026
 *
 * Reads a request body chunk by chunk and stops as soon as it passes the cap, so an oversized
 * or endless (chunked, no Content-Length) body is never buffered in full. A declared
 * Content-Length over the cap is refused before anything is read.
 */

export type CappedBody =
  | { ok: true; text: string }
  | { ok: false; status: 400 | 413; error: string };

export async function readBodyCapped(req: Request, maxBytes: number): Promise<CappedBody> {
  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) {
    return { ok: false, status: 413, error: 'Request body too large' };
  }
  if (!req.body) return { ok: true, text: '' };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: 'Request body too large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: 'Could not read the request body' };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, status: 400, error: 'Request body is not valid UTF-8' };
  }
}

/** Reads a capped body and parses it as JSON. */
export async function readJsonCapped(
  req: Request,
  maxBytes: number
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string }> {
  const body = await readBodyCapped(req, maxBytes);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(body.text) };
  } catch {
    return { ok: false, status: 400, error: 'Body must be JSON' };
  }
}
