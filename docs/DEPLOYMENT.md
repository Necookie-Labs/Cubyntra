# Cubyntra Deployment Guide

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented (2.0.0)  
**Scope**: Running Cubyntra on the student's laptop. Hosting is out of scope.

---

## 1. Where Cubyntra Runs

Cubyntra is a **localhost-only** app ([`docs/tutor/GOAL.md`](tutor/GOAL.md), locked decisions):
one Next.js server on the student's laptop, opened in the laptop's browser and, optionally, on a
phone on the same Wi-Fi. There is no hosted deployment, no container image and no cloud
configuration, and none is planned. The design depends on it:

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

Vercel or other hosting, Docker images, reverse proxies, TLS certificates from a public CA,
multiple students or accounts. If any of these is ever wanted it needs its own decision record:
the loopback token check, the in-memory relay and the local data files would all have to change
([SECURITY_PRIVACY.md](SECURITY_PRIVACY.md) §6.3).
