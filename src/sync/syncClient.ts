/**
 * Cubyntra - Sync transport for the browser (laptop and phone)
 * Necookie Labs (c) 2026
 *
 * The event stream is read with `fetch` rather than `EventSource` so the session secret can go in
 * a header instead of the URL. The stream reconnects on its own after a network blip and stops
 * for good when the server says the session is gone. A connection that goes quiet (no event and
 * no ping for twice the ping interval: a sleeping laptop, a phone that switched networks) is
 * treated as dead and reconnected, since a half-open TCP connection may never report an error.
 */

import { DeviceRole, PING_INTERVAL_MS, StreamEvent, SyncMessage } from './types';

/** Same value as `SESSION_SECRET_HEADER` in `./pairing` (server only, so not imported here). */
export const SESSION_HEADER = 'x-cubyntra-session';

export type StreamStatus = 'connecting' | 'open' | 'retrying';
/** `expired` / `deleted` come from the server; `gone` is a 403/404 when (re)connecting. */
export type EndReason = 'expired' | 'deleted' | 'gone';

export interface SyncStreamOptions {
  sessionId: string;
  secret: string;
  role: DeviceRole;
  onEvent: (event: StreamEvent) => void;
  onStatus?: (status: StreamStatus) => void;
  onEnded?: (reason: EndReason) => void;
  /** Waits before each reconnect; the last value repeats. */
  retryDelaysMs?: number[];
  /** Silence after which the connection is dropped and reopened (default 2x the ping interval). */
  inactivityTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface SyncStream {
  close: () => void;
}

const DEFAULT_RETRY_MS = [1000, 2000, 5000, 10000];
export const DEFAULT_INACTIVITY_MS = 2 * PING_INTERVAL_MS;

/** A random id for this page load, so a device can recognise its own messages coming back. */
export function newClientId(): string {
  return globalThis.crypto.randomUUID();
}

/** Splits an SSE byte stream into `data:` payloads. Feed it decoded text chunks. */
export function createSseParser(onData: (data: string) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk) => {
    buffer += chunk.replace(/\r\n/g, '\n');
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) onData(data);
      end = buffer.indexOf('\n\n');
    }
  };
}

export function openSyncStream(options: SyncStreamOptions): SyncStream {
  const { sessionId, secret, role, onEvent, onStatus, onEnded } = options;
  const doFetch = options.fetchImpl ?? fetch;
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_MS;
  const inactivityMs = options.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_MS;
  let closed = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const stopWatchdog = () => {
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = null;
  };

  /** (Re)starts the silence countdown for the current connection; firing aborts it. */
  const watch = (current: AbortController) => {
    stopWatchdog();
    quietTimer = setTimeout(() => current.abort(), inactivityMs);
  };

  const end = (reason: EndReason) => {
    if (closed) return;
    closed = true;
    stopWatchdog();
    controller?.abort();
    onEnded?.(reason);
  };

  const scheduleRetry = () => {
    stopWatchdog();
    if (closed) return;
    onStatus?.('retrying');
    const delay = delays[Math.min(attempt, delays.length - 1)];
    attempt++;
    retryTimer = setTimeout(connect, delay);
  };

  async function connect() {
    if (closed) return;
    const current = new AbortController();
    controller = current;
    onStatus?.('connecting');
    // A request that never answers is as dead as a stream that stops talking.
    watch(current);
    let res: Response;
    try {
      res = await doFetch(`/api/session/${encodeURIComponent(sessionId)}/events?role=${role}`, {
        headers: { [SESSION_HEADER]: secret, Accept: 'text/event-stream' },
        cache: 'no-store',
        signal: current.signal,
      });
    } catch {
      scheduleRetry();
      return;
    }
    if (res.status === 403 || res.status === 404) return end('gone');
    if (!res.ok || !res.body) return scheduleRetry();

    attempt = 0;
    onStatus?.('open');
    const decoder = new TextDecoder();
    const parse = createSseParser((data) => {
      let event: StreamEvent;
      try {
        event = JSON.parse(data) as StreamEvent;
      } catch {
        return;
      }
      if (event.kind === 'ended') end(event.reason);
      else onEvent(event);
    });
    const reader = res.body.getReader();
    // Abort does not always reach a body already being read: cancel the reader too.
    current.signal.addEventListener('abort', () => void reader.cancel().catch(() => {}), { once: true });
    watch(current);
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || closed) break;
        // Any frame (a ping included) proves the connection is alive.
        watch(current);
        parse(decoder.decode(value, { stream: true }));
      }
    } catch {
      // Network drop or our own abort; handled below.
    }
    scheduleRetry();
  }

  void connect();

  return {
    close: () => {
      closed = true;
      stopWatchdog();
      if (retryTimer) clearTimeout(retryTimer);
      controller?.abort();
    },
  };
}

export type PostResult = { ok: true; seq: number } | { ok: false; status: number; error?: string };

/** Sends one message. Never throws; a network failure is status 0. */
export async function postSyncMessage(
  sessionId: string,
  secret: string,
  message: SyncMessage & { role: DeviceRole; clientId: string },
  fetchImpl: typeof fetch = fetch
): Promise<PostResult> {
  try {
    const res = await fetchImpl(`/api/session/${encodeURIComponent(sessionId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [SESSION_HEADER]: secret },
      body: JSON.stringify(message),
    });
    const body = (await res.json().catch(() => ({}))) as { seq?: number; error?: string };
    if (res.ok && typeof body.seq === 'number') return { ok: true, seq: body.seq };
    return { ok: false, status: res.status, error: body.error };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Ends a session on the server. `keepalive` lets it finish while the page is unloading. */
export async function deleteSyncSession(
  sessionId: string,
  secret: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  try {
    await fetchImpl(`/api/session/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: { [SESSION_HEADER]: secret },
      keepalive: true,
    });
  } catch {
    // The session expires on its own if the server cannot be reached.
  }
}
