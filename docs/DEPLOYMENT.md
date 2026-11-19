# Cubyntra Deployment Guide

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented (2.0.0)  
**Scope**: Running Cubyntra on the student's laptop (default), or hosted on a home server behind
Cloudflare Tunnel + Access (ADR-017, section 6).

---

## 1. Where Cubyntra Runs

By default Cubyntra is a **localhost** app ([`docs/tutor/GOAL.md`](tutor/GOAL.md), locked
decisions): one Next.js server on the student's laptop, opened in the laptop's browser and,
optionally, on a phone on the same Wi-Fi. Sections 2 to 4 describe that. Section 6 describes the
one supported hosted setup (ADR-017). There is no container image or serverless deployment. The
local design depends on:

- the profile, coach usage and app secret are files in `data/` next to the code;
- the app token is handed out only to requests addressed to `localhost` / `127.0.0.1` / `[::1]`
  (a reverse proxy would add forwarding headers and the laptop would be refused);
- the sync relay keeps sessions in the memory of one long-running server process and uses
  long-lived event streams, so it would not work on multi-instance serverless hosting.

---

## 2. Prerequisites

- **Node.js** 20.9 or newer (the `next` 16 requirement; CI uses Node 22) and npm.
- Network access for the first `npm run dev` / `npm run build` (fonts are fetched once by
  `next/font`).
- Optional: `ANTHROPIC_API_KEY` in `.env.local` for the live coach ([DEVELOPMENT.md](DEVELOPMENT.md) §5).

---

## 3. The Two Ways to Run It

### 3.1 Development server (recommended for daily use with a phone)
```bash
npm install
npm run dev     # HTTPS on 0.0.0.0:3000, self-signed certificate in .certs/
```
Open `https://localhost:3000` on the laptop and `https://<laptop-ip>:3000` on the phone (Pair
shows the address and a QR code). Each device shows a one-time certificate warning. HTTPS is what
lets the phone open its camera. To install the PWA on the phone or to remove the warning, trust
the certificate on the phone ([DEVELOPMENT.md](DEVELOPMENT.md) §6.4).

### 3.2 Production build on the laptop
```bash
npm ci
npm run lint && npm run typecheck && npm test   # optional checks
npm run build
npm start       # next start: plain HTTP on port 3000
```
`npm start` serves **plain HTTP**. The laptop works fully at `http://localhost:3000` (the camera
is allowed on `localhost`), but a phone at `http://<laptop-ip>:3000` cannot open its camera, so
phone scanning and checkpoint photos on the phone need `npm run dev`.

---

## 4. Data and Secrets on the Laptop

| Path | What | Notes |
|:---|:---|:---|
| `data/student.json` | Profile, palette, progress, saved solve | Delete to start over as a new student |
| `data/coach-usage.json` | Coach token counts and cost per month | No reply text |
| `data/app-secret` | Per-install app token | Delete to sign every paired device out |
| `.env.local` | `ANTHROPIC_API_KEY`, `COACH_MONTHLY_CAP_USD` | Server only; never `NEXT_PUBLIC_` |
| `.certs/` | Dev HTTPS key and certificate | Regenerated when network addresses change |

All of these are git-ignored. Back up `data/` to keep a student's progress.

---

## 5. Out of Scope

Vercel or other serverless hosting, Docker images, sign-up or account management, and more than a
handful of named people. The in-memory relay needs one long-running process.

---

## 6. Hosted on a Home Server (ADR-017)

The full step-by-step, smoke test, update and backup procedure is in
[`deploy/README.md`](../deploy/README.md). In short:

```
browser --HTTPS--> Cloudflare edge (Access: email + one-time PIN) --tunnel--> cloudflared --> 127.0.0.1:3001
```

- The server runs `next start -p 3001 -H 127.0.0.1` under systemd (`deploy/cubyntra.service`)
  and is published by a Cloudflare Tunnel (`deploy/cloudflared-config.example.yml`). No router
  port is opened.
- `.env.local` sets `CUBYNTRA_AUTH_MODE=cloudflare-access`, `CF_ACCESS_TEAM_DOMAIN`,
  `CF_ACCESS_AUD`, `PUBLIC_ORIGIN` and optionally `CUBYNTRA_ALLOWED_EMAILS` (every variable is in
  `.env.example`). The fallback without Access is `CUBYNTRA_AUTH_MODE=passcode` with
  `CUBYNTRA_ACCESS_CODE`.
- In those modes the loopback token check is switched off (cloudflared connects from 127.0.0.1),
  every API request must carry a verified Access JWT (or the signed passcode cookie), each person
  gets `data/students/<slug>.json`, pairing is per person, and `src/proxy.ts` adds HSTS and the
  other security headers. `GET /api/health` answers `{ ok, mode, version }` for checks.
- The coach and voice monthly caps are shared by everyone on the server.

| Path (hosted) | What |
|:---|:---|
| `data/students/<slug>.json` | One profile per person (slug = safe form of the email or name + hash) |
| `data/app-secret` | Signs per-user tokens and passcode cookies; delete to sign everyone out |
| `data/coach-usage.json`, `data/voice-usage.json`, `data/voice/` | Shared usage and clip cache |
