# Cubyntra Security & Privacy Specification

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented  
**Scope**: Client-Side Data Privacy, Camera Permissions, and Web Security

---

## 1. Core Security & Privacy Philosophy

Cubyntra runs on the student's own laptop (`npm run dev` / `npm start`), with a phone on the same
network as an optional camera and remote. Users pointing a camera at a physical object must be able
to trust that their video feed, environment and likeness never leave the device holding the camera.

### Core Privacy Commitments:
1. **Zero image uploads**: camera pixels never leave the device that captured them ([ADR-001](ADR/001-client-side-processing.md), restored by [ADR-015](ADR/015-state-only-sync.md)). Webcam frames stay in the laptop's browser. The phone reads each face itself and sends only nine colors, nine confidences and nine tile mean colors (integers) per face. No route accepts, stores or returns image data, and a test enforces it (`tests/sync-privacy.test.ts`).
2. **Zero Server-Side Vision Processing**: Computer vision, sticker extraction, and color classification run in the browser of the device with the camera. The server relays small state messages between the phone and the laptop and never sees a pixel.
3. **Hardware Stream Teardown**: Camera tracks are explicitly terminated (`track.stop()`) immediately upon unmounting or when the user navigates away, guaranteeing the webcam hardware indicator turns off.
4. **No Third-Party Analytics Trackers**: No third-party tracking scripts, cookies, or telemetry libraries are bundled.
5. **The AI coach sends words, never pictures**: when an Anthropic API key is configured, the only thing sent to Anthropic is a small facts JSON about the current step (section 5). No images, video, cube state, names or device details are ever sent. Without a key nothing is sent at all.

---

## 2. Browser Camera Permissions & Hardware Lifecycle

### 2.1 WebRTC Secure Context Requirements
Browsers enforce that `navigator.mediaDevices.getUserMedia` is only accessible within a **Secure Context** (`https://` or `http://localhost`). 
- Cubyntra enforces HTTPS in production environments.
- In insecure environments (`http://` on LAN/WAN), camera activation is gracefully disabled with user guidance to enable HTTPS or use manual scramble mode.

### 2.2 Stream Acquisition and Teardown
```typescript
// Safe acquisition with ideal mobile resolution
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'environment', // Rear camera preferred on mobile
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false, // Audio is NEVER requested
});

// Explicit cleanup hook
export function stopCameraStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.stop(); // Terminates sensor hardware immediately
  });
}
```

---

## 3. Threat Modeling & Vulnerability Mitigation

| Threat Vector | Severity | Mitigation Strategy |
|:---|:---:|:---|
| **Exfiltration of Video Data** | Critical | No route accepts or returns media. Sync messages are parsed field by field into fixed shapes, so an image in any field is dropped or rejected. The phone discards its face crop after reading it. |
| **Another device on the Wi-Fi joins or drives a pairing** | High | Session ids are crypto UUIDs; every sync route requires a 128-bit session secret, compared in constant time (403 when wrong). Creating a session requires the app token, which only the laptop's own loopback browser can fetch. `preferredId` no longer exists, so a session cannot be chosen or overwritten. |
| **Guessing the typed pairing code** | Medium | 6 characters from a 29-symbol alphabet (about 600 million codes), single use, valid 10 minutes, at most 10 guesses per minute across all devices. |
| **Secrets leaking through URLs** | Medium | The QR link carries them in the URL fragment, which is never sent to a server. The phone moves them to sessionStorage and strips the address bar; the event stream is read with `fetch` so the secret travels in a header. |
| **Memory or connection exhaustion through the relay** | Medium | Bodies are read with a streaming 16 KB cap (1 KB for the code route) and refused as soon as they pass it; at most 8 sessions, idle expiry after 30 minutes, hard expiry after 12 hours; 600 messages per minute per session; stream cleanup on cancel or request abort. Rate-limiter keys with no hit inside the window are swept away, and a deleted session's key is dropped at once, so the limiter maps stay small. A client drops and reopens a stream silent for 30 s (twice the ping interval). |
| **A second device or tab overwriting the saved profile** | Medium | `PATCH /api/student` takes small operations, not whole profiles; the server merges them one request at a time (timer solves by id, trainer answers replayed, counts added, the saved solve only moves forward) and validates the result before the atomic write. There is no whole-profile PUT. |
| **Oversized bodies on the coach and profile routes** | Low | `/api/coach` (8 KB) and `/api/student` (128 KB) read bodies with the same streaming cap, so a chunked body with no Content-Length gets a 413 without being buffered. |
| **Denial of Service via Solver ReDoS / Hang** | Medium | Solver engine implements a strict 5,000ms execution timeout cap. If search exceeds threshold, it cleanly aborts. |
| **Arbitrary Code Injection via Scramble String** | High | Input strings are strictly validated against `^[UDFBLR]{54}$` character whitelists before parsing. No `eval()` or dynamic code evaluation exists. |
| **Memory Exhaustion (Three.js WebGL Leaks)** | Medium | Comprehensive `dispose()` hooks for all geometries, materials, and textures attached to component unmount lifecycle. |
| **XSS via UI Inputs** | High | React 19 automatic JSX string escaping; strict TypeScript types; no `dangerouslySetInnerHTML` usage. |
| **Coach spend abuse from the network** | Medium | `/api/coach` requires the per-install app token (`x-cubyntra-token`), allows 30 requests per minute per token and 8 KB bodies, and stops at the monthly cap (section 5). |
| **Coach inventing moves** | Medium | The engine picks every move; a guardrail rejects any reply naming a move outside the step and serves the built-in template (ADR-014). |
| **API key exposure** | High | `ANTHROPIC_API_KEY` lives in `.env.local` (git-ignored), is read only by server code and is never sent to the browser or logged. |

---

## 4. Content Security Policy (CSP) Guidelines

For production deployments, the following HTTP response headers are recommended:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none';
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), microphone=(), geolocation=()
```
*(Notice that `microphone` and `geolocation` are explicitly forbidden by `Permissions-Policy`, while `camera` is restricted exclusively to self).*

---

## 5. AI Coach and Anthropic

The coach ([ADR-014](ADR/014-claude-coach.md)) is optional and off until an `ANTHROPIC_API_KEY`
is put in `.env.local`. With no key, hints come from built-in templates and the app makes no
outside network calls for the coach.

### 5.1 What is sent to Anthropic
Only from the laptop's server (`src/coach/service.ts`), only when the student asks for a hint:
- the fixed system prompt (the same text for everyone: curriculum, tone and rules), and
- a facts JSON built by `src/coach/facts.ts`: method, stage and case ids and names, the hint
  level, the grip colors, the step's setup moves and algorithm in notation, the engine's goal /
  look-for / why sentences, up to five earlier attempt results (matched / mismatch / unsure and
  mistake kinds) and an optional diagnosis (mistake kinds, move positions, confidences).

### 5.2 What is never sent
Camera frames, photos, sticker colors or the cube state, the student's name, profile or progress,
device or network details, the app token, and anything typed by the student. The server
validates incoming facts against a strict shape and drops unknown fields before anything leaves
the machine.

### 5.3 Local files and access
- `data/coach-usage.json`: token counts and cost per month (no content of any reply), including
  calls that were aborted or failed part-way.
- `data/app-secret`: the per-install token that `/api/coach` and `/api/coach/status` require.
  `GET /api/auth/token` gives it only to requests addressed to `localhost` / `127.0.0.1` /
  `[::1]` with no proxy headers and a loopback (or absent) `Origin`. Route handlers cannot see
  the client's socket address, so this is a header check: a device on the home network that
  forges `Host: localhost` could obtain it. The phone receives the token through the pairing QR
  code or the typed code (section 6).
- Replies are not stored. The server log shows token counts and cost only.

---

## 6. Phone ↔ Laptop Sync ([ADR-015](ADR/015-state-only-sync.md))

### 6.1 What travels
Only state messages, each at most 16 KB: `cube-state` (54 sticker colors), `face-scanned` (one
face's 9 colors, 9 confidences, 9 tile mean colors), `step`, `playback`, `grip`,
`checkpoint-result`, `presence` (page visible, which screen) and `scan-control`. They pass through
the laptop's own server process, which keeps the latest of each in memory for reconnects and
forgets them when the session is deleted or expires. Nothing is written to disk.

### 6.2 Pairing and credentials
- The laptop creates a session with the app token. It gets a crypto UUID, a 128-bit secret and a
  6-character typed code.
- The QR code holds `https://<laptop-ip>:<port>/companion#s=<id>&k=<secret>&t=<app token>`. The
  app token lets the phone use the coach, so **a paired phone is trusted like the laptop**.
- The phone keeps the credentials in **sessionStorage**: they survive a reload of that tab, are
  not shared with other tabs, and are cleared when the tab closes. The address bar is stripped
  with `history.replaceState` on arrival. The laptop holds the secret in memory only.
- Leaving the page or pressing Cancel on the laptop deletes the session (`DELETE`), which closes
  the phone's stream.

### 6.3 Limits, honestly
- Traffic between the phone and the laptop is protected by the dev server's HTTPS certificate,
  which the phone does not trust by default; a device that can intercept the Wi-Fi and get the
  student to accept a different certificate could read the messages and the app token.
- Anyone who photographs the QR code, or reads the typed code within its 10 minutes, can join
  that session and obtain the app token. The token lasts until `data/app-secret` is deleted;
  deleting it signs every device out.
- Loopback is judged from request headers (section 5.3); a program on the network that forges
  `Host: localhost` could create sessions and read the app token.
- The relay assumes one long-running server process on the laptop. It is not designed for
  hosting on the internet.
