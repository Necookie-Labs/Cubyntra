# ADR-017: Hosting on a Home Server behind Cloudflare Tunnel and Access

**Status**: Accepted
**Date**: 2026-11-19
**Deciders**: Necookie Labs Core Engineering Team
**Amends**: the "localhost-only" locked decision in [`docs/tutor/GOAL.md`](../tutor/GOAL.md),
[ADR-014](014-claude-coach.md) (who may call the coach), [ADR-015](015-state-only-sync.md)
(who owns a pairing), [ADR-016](016-voice-tutoring.md) (who may call the voice route)

---

## Context

Cubyntra 2.0 was built as a single-student app on the student's laptop: one `data/student.json`,
an app token handed out only to loopback requests, and a phone that pairs over the home Wi-Fi.
Hosting was out of scope.

For a presentation on 2026-11-21 the owner wants it reachable at
`https://cubyntra.necookie.dev` for two people (the owner and Kiko), each on a laptop and a phone,
served from the owner's Linux home server. `necookie.dev` is on Cloudflare. Laptop use must keep
working exactly as before.

Three things in the local design do not survive hosting:

1. **Loopback as proof of locality.** `cloudflared` runs on the server and connects to the app
   from `127.0.0.1` with whatever Host the visitor sent. Under the old check, anyone on the
   internet would look local and receive the app secret.
2. **One profile.** Two people would overwrite each other's progress.
3. **Pairing by LAN address.** The QR link points at the server's private IP.

## Decision

### 1. Three auth modes, picked by `CUBYNTRA_AUTH_MODE`

| Mode | Who it is for | Authentication | Profiles |
|:---|:---|:---|:---|
| `local` (default) | the laptop install | loopback-only app token, unchanged | `data/student.json` |
| `cloudflare-access` | the hosted site | Cloudflare Access JWT on every API request | `data/students/<slug>.json` |
| `passcode` | hosting without Access | `/signin` with a name and `CUBYNTRA_ACCESS_CODE`, signed cookie | `data/students/<slug>.json` |

Any other value is `invalid` and every guarded route refuses: a typo never falls back to the
loopback-trusting local mode.

### 2. Cloudflare Access (the chosen hosted mode)
- Cloudflare Tunnel publishes `127.0.0.1:3001` as `cubyntra.necookie.dev`; the app never binds a
  public interface and no router port is opened.
- A Cloudflare Access application allows only the two email addresses, with one-time PINs.
- The app does not trust Cloudflare blindly: every API request must carry
  `Cf-Access-Jwt-Assertion`, verified with `jose` exactly as Cloudflare's "Validate JWTs" guide
  says: RS256 only, keys from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`
  (fetched and cached, 10 minutes, 30 s cooldown before refetching for an unknown key),
  `iss` = the team domain, `aud` contains `CF_ACCESS_AUD`, `exp`/`nbf` checked. The identity is
  the `email` claim. `CUBYNTRA_ALLOWED_EMAILS` is an optional second allowlist inside the app.
- Loopback is never trusted in this mode: a request without a valid JWT gets 401 whatever its
  Host and peer.

**Why Access over basic auth or a home-made login**: Access stops unauthenticated traffic at
Cloudflare's edge, before it reaches the home server or the tunnel; identity is a verified email
with a one-time PIN, so there are no passwords to store, leak or share; sessions, revocation and
logs are Cloudflare's; and it works on a phone browser without a password manager. HTTP basic
auth would send a shared password on every request, has no logout, and puts the home server in
front of every scanner on the internet. The `passcode` mode exists only as a fallback if Access
is unavailable on the day.

### 3. Passcode mode (fallback)
`POST /api/auth/signin` takes `{ name, code }`. The code (at least 8 characters, otherwise every
sign-in is refused) is compared in constant time; attempts are limited to 10 a minute across
everyone (behind a tunnel there is no trustworthy client address to key by). Success sets
`cubyntra_session`: base64url JSON `{ v, id, name, exp }` plus an HMAC-SHA256 signature with a key
derived from the app secret; HttpOnly, Secure, SameSite=Lax, 7 days. `POST /api/auth/signout`
clears it. `src/proxy.ts` sends page requests without a valid cookie to `/signin`. The name is the
identity: anyone with the code can sign in under any name, so this mode is for trusted people.

### 4. One identity layer
`getRequestUser(req)` (`src/lib/requestUser.ts`) returns `{ id, name }`: `local` in local mode,
the email in Access mode, the cookie's user in passcode mode, or null. `guardUser` wraps it for
every token-checked route (coach, coach status, voice, voice status, student, session creation).
The client still sends `x-cubyntra-token`; in the hosted modes `/api/auth/token` returns a
**per-user token**, HMAC-SHA256 of the user id with the app secret, and the server checks the
token belongs to the user the request authenticates as. So a hosted request needs both the
Access JWT (or cookie) and that person's token. Client changes are limited to the sign-in page
and a Sign out button.

### 5. Per-person profiles
In the hosted modes each person's profile is `data/students/<slug>.json`. The slug is the user
id lower-cased with every run of other characters turned into `-`, capped at 48 characters, plus
an 8-hex SHA-256 of the full id (`owner-example-com-1a2b3c4d`), so ids that read alike stay apart
and no slug can contain `.`, `/` or `\`. `studentFilePath` re-checks the pattern before building a
path. The profile lock, size cap, atomic write and retry-safe batch ids work per file (batch ids
are remembered per person). Local mode keeps `data/student.json`.

### 6. Shared spend caps (deliberate)
The coach's monthly dollar cap (`COACH_MONTHLY_CAP_USD`) and the voice credit cap
(`ELEVENLABS_MONTHLY_CREDIT_CAP`) stay **global**: one usage file each, shared by everyone on the
server. They protect one wallet, and a per-person cap would double the worst case. One person
using a lot of hints leaves fewer for the other; with two people that is acceptable.

### 7. Pairing per person
A sync session records the user who created it. Every sync route authenticates the requester in
the hosted modes and answers 404 for another person's session (even with the right secret); a
typed code can only be claimed by its owner. The phone passes Access with the same email. The QR
link's origin is `PUBLIC_ORIGIN` when set (`https://cubyntra.necookie.dev`), and the server's LAN
addresses are then not returned. The session cap (8, shared), idle and lifetime expiry are
unchanged. Rate limits for the coach, voice, session creation and typed codes are keyed by user.

### 8. Hosted headers and health
In the hosted modes `src/proxy.ts` (Next 16's name for middleware) adds
`Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and a
`Permissions-Policy` that allows camera, microphone, wake lock, autoplay and fullscreen on self and
switches the rest off. Not in local mode, where HSTS would pin `localhost` to HTTPS.
`GET /api/health` (no auth) returns `{ ok, mode, version }` and nothing about keys.

### 9. Deployment
`deploy/` holds a systemd unit (`next start -p 3001 -H 127.0.0.1`, `EnvironmentFile`,
`Restart=on-failure`, `MemoryMax`, sandboxing), an example `cloudflared` ingress with a 404
catch-all, and a step-by-step guide.

## Threat model

| Threat | Mitigation |
|:---|:---|
| A stranger on the internet reaches the app | Access blocks at the edge; the app independently requires a valid Access JWT on every API request; the app listens on 127.0.0.1 only |
| A request that looks local (cloudflared, or a forged Host) | Loopback is never trusted in hosted modes; no JWT → 401 |
| A forged or replayed JWT | RS256 signature against Cloudflare's published keys; `alg: none` and HS256 confusion refused; `aud`, `iss`, `exp` checked |
| An allowed person reads the other's data | Per-person files from the authenticated identity; per-user tokens; pairing sessions bound to their owner |
| Path traversal through an email or name | Slugs are `[a-z0-9-]` plus a hash, checked again before any path is built |
| Guessing the passcode | ≥ 8 characters, constant-time compare, 10 tries a minute globally |
| Cookie theft or tampering | HttpOnly, Secure, SameSite=Lax, HMAC-signed, 7-day expiry; deleting `data/app-secret` signs everyone out |
| Running up the Claude or ElevenLabs bill | Only signed-in people can call the routes; per-user rate limits; the global monthly caps |
| A misconfigured mode | Unknown `CUBYNTRA_AUTH_MODE` refuses everything; missing Access config refuses every JWT |

## Consequences

- Data now lives on the owner's home server, and all traffic passes through Cloudflare (TLS is
  terminated at Cloudflare's edge and re-encrypted through the tunnel). Camera pixels still never
  leave the device holding the camera; sync, coach and voice payloads are unchanged.
- Cloudflare sees request metadata and, because it terminates TLS, could see the state messages,
  profile writes and coach facts in transit. That is the price of the tunnel; nothing image-like
  passes through it.
- The in-memory relay still assumes one long-running process: one `next start`, not serverless.
- The PWA manifest is fetched without cookies, so behind Access the install prompt may not
  appear unless the manifest and icons get an Access bypass (documented in `deploy/README.md`).
- Laptop installs are unaffected: with `CUBYNTRA_AUTH_MODE` unset, every route behaves as in
  2.0.0 and the existing tests still pass.
