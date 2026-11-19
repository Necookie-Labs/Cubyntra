# Deploying Cubyntra to a home server

**Target**: `https://cubyntra.necookie.dev`, served from a Linux home server through a Cloudflare
Tunnel and protected by Cloudflare Access (email one-time PIN). Two people use it, each with their
own profile. The decisions behind this are in [ADR-017](../docs/ADR/017-hosting-cloudflare.md).

```
browser ──HTTPS──> Cloudflare edge ──(Access: email + PIN)──> tunnel ──> cloudflared ──> 127.0.0.1:3001 (next start)
```

The app never listens on a public interface and no router port is opened. Laptop use
(`npm run dev`, local mode) is unchanged by anything here.

Files in this folder:

| File | What |
|:---|:---|
| `cubyntra.service` | systemd unit: runs `next start -p 3001 -H 127.0.0.1` as a service user |
| `cloudflared-config.example.yml` | Tunnel ingress: `cubyntra.necookie.dev` → `http://127.0.0.1:3001`, everything else 404 |
| `user/cubyntra.service`, `user/cubyntra-tunnel.service` | The same two services as systemd *user* units, for a server where you have no root (see "Without root") |

---

## 1. Server prerequisites (fresh Ubuntu 24.04)

```bash
sudo apt update && sudo apt install -y git curl ca-certificates

# Node.js 22 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # v22.x
which npx  # /usr/bin/npx (the path used in cubyntra.service)

# A service user with no login shell, and the app folder
sudo useradd --system --create-home --home-dir /opt/cubyntra --shell /usr/sbin/nologin cubyntra
```

## 2. Get and build the app

```bash
sudo -u cubyntra -s /bin/bash      # work as the service user from here
cd /opt/cubyntra
git clone https://github.com/<owner>/Cubyntra.git .   # or copy the repo in
git checkout main                                      # the branch you are presenting
npm ci
npm run build
mkdir -p data && chmod 700 data
```

The build needs network once (fonts are fetched by `next/font`). It makes no Claude or
ElevenLabs calls.

## 3. `.env.local`

Create `/opt/cubyntra/.env.local` (mode `600`, owned by `cubyntra`). Every variable is described
in [`.env.example`](../.env.example). For Cloudflare Access:

```bash
# --- Hosting (ADR-017) ---
CUBYNTRA_AUTH_MODE=cloudflare-access
CF_ACCESS_TEAM_DOMAIN=<your-team>.cloudflareaccess.com   # Zero Trust → Settings → Custom pages / team domain
CF_ACCESS_AUD=<the Application Audience (AUD) tag>         # filled in at step 6
CUBYNTRA_ALLOWED_EMAILS=owner@example.com,kiko@example.com # optional second allowlist inside the app
PUBLIC_ORIGIN=https://cubyntra.necookie.dev                # the QR pairing link uses this origin

# --- Optional services (shared monthly caps, see below) ---
ANTHROPIC_API_KEY=
COACH_MONTHLY_CAP_USD=10
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_MONTHLY_CREDIT_CAP=20000
```

Without Cloudflare Access (fallback), use `CUBYNTRA_AUTH_MODE=passcode` and
`CUBYNTRA_ACCESS_CODE=<at least 8 characters>` instead of the `CF_ACCESS_*` lines. Everyone signs
in at `/signin` with their name and that code.

```bash
chmod 600 /opt/cubyntra/.env.local
```

Notes:
- systemd's `EnvironmentFile` does not run a shell: write `KEY=value` with no `export`, and avoid
  quotes unless the whole value is quoted.
- The coach and voice spend caps are **global and shared** by everyone on this server (they
  protect one wallet). Each person's profile is separate: `data/students/<slug>.json`.
- An unknown `CUBYNTRA_AUTH_MODE` value makes every API route refuse (fail closed);
  `/api/health` shows `"mode": "invalid"`.

## Without root (how `necore` runs it)

When `sudo` isn't available for the setup, everything can live in your own account. Only one
command needs root, once: `sudo loginctl enable-linger "$USER"`, so your services run without a
login and start after a reboot.

```bash
# Node 22 under ~/.local/node (official tarball, checksum-verified) and cloudflared under ~/.local/bin
# (official release binary, checksum-verified). Then:
git clone https://github.com/Necookie-Labs/Cubyntra.git ~/apps/cubyntra
cd ~/apps/cubyntra && npm ci && npm run build
nano .env.local && chmod 600 .env.local            # see section 3
mkdir -p ~/.config/cubyntra && nano ~/.config/cubyntra/tunnel-token && chmod 600 ~/.config/cubyntra/tunnel-token
mkdir -p ~/.config/systemd/user && cp deploy/user/*.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now cubyntra cubyntra-tunnel
curl -s http://127.0.0.1:3001/api/health
```

The tunnel here is **dashboard-managed**: in Zero Trust → Networks → Tunnels, create the tunnel,
add the public hostname `cubyntra.necookie.dev` → `HTTP` → `localhost:3001`, and copy its token
into `~/.config/cubyntra/tunnel-token`. No `config.yml` or `cloudflared tunnel login` is needed.
Logs: `journalctl --user -u cubyntra -f` and `journalctl --user -u cubyntra-tunnel -f`.

## 4. Run it with systemd

```bash
exit   # back to your sudo user
sudo cp /opt/cubyntra/deploy/cubyntra.service /etc/systemd/system/cubyntra.service
# Edit User=, WorkingDirectory=, EnvironmentFile=, ReadWritePaths= if your paths differ.
sudo systemctl daemon-reload
sudo systemctl enable --now cubyntra
systemctl status cubyntra
curl -s http://127.0.0.1:3001/api/health   # {"ok":true,"mode":"cloudflare-access","version":"2.0.0"}
```

## 5. Cloudflare Tunnel

```bash
# Install cloudflared (Cloudflare's apt repo)
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

cloudflared tunnel login                     # opens a browser link; pick necookie.dev
cloudflared tunnel create cubyntra           # prints the tunnel id, writes ~/.cloudflared/<id>.json
cloudflared tunnel route dns cubyntra cubyntra.necookie.dev   # CNAME to the tunnel

sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/<TUNNEL_ID>.json /etc/cloudflared/
sudo cp /opt/cubyntra/deploy/cloudflared-config.example.yml /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml        # replace <TUNNEL_ID> twice
cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml

sudo cloudflared service install             # runs the tunnel as a systemd service
sudo systemctl enable --now cloudflared
```

Do **not** open the site to the world before step 6: until Access is in front, every API route
answers 401 (no JWT), but pages would load.

## 6. Cloudflare Access application

In the Cloudflare dashboard → **Zero Trust**:

1. **Settings → Authentication → Login methods**: make sure **One-time PIN** is enabled.
2. **Access → Applications → Add an application → Self-hosted**.
   - Application name: `Cubyntra`; domain: `cubyntra.necookie.dev` (path empty = whole site).
   - **Session duration**: `24 hours` (a week is fine too; this is how often each person types a
     new PIN).
3. **Policy**: name `Owner and Kiko`, action **Allow**, include → **Emails** → the two addresses.
4. Save. Open the application again → **Overview** → copy the **Application Audience (AUD)
   Tag** into `CF_ACCESS_AUD` in `.env.local`. Your team domain is under **Settings → Custom
   Pages** (`<team>.cloudflareaccess.com`); put it in `CF_ACCESS_TEAM_DOMAIN`.
5. `sudo systemctl restart cubyntra`.

The app verifies the `Cf-Access-Jwt-Assertion` header on every API request itself (RS256 against
`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, plus `aud`, `iss`, expiry and the
optional `CUBYNTRA_ALLOWED_EMAILS`), so a request that somehow skips Access is still refused.

**Phone**: open `https://cubyntra.necookie.dev` on the phone and pass Access with the **same
email**, then scan the QR code from Pair. A pairing only works for the person who created it.

**Installing the PWA** (optional): browsers fetch the web manifest without cookies, so behind
Access the install prompt may not appear. If you want it, add a second Access application for
`cubyntra.necookie.dev/manifest.webmanifest` and `cubyntra.necookie.dev/icons` with a **Bypass**
policy (they contain no data). Everything works in the browser tab without it.

---

## 7. Smoke test (before the presentation)

- [ ] `curl -s http://127.0.0.1:3001/api/health` on the server → `{"ok":true,"mode":"cloudflare-access",...}`
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/student` → `401` (loopback is not trusted)
- [ ] In a private window, `https://cubyntra.necookie.dev` shows the Cloudflare Access login; an
      email not on the list never gets a PIN that works.
- [ ] Owner signs in with the PIN → Home loads; **Settings → Account** shows Sign out.
- [ ] `curl -sI http://127.0.0.1:3001/api/health` on the server shows `strict-transport-security`,
      `x-content-type-options`, `referrer-policy` and `permissions-policy`.
- [ ] Settings → change your name; reload → it stuck. Kiko signs in on another device → Kiko's
      name is the default one (separate profiles). `ls /opt/cubyntra/data/students/` shows two files.
- [ ] Scan with the laptop camera (or Try a demo cube) → Solve → one step → Hint shows text.
- [ ] Pair: the QR link starts with `https://cubyntra.necookie.dev/companion#`. The phone (same
      email) scans it and shows Linked; the camera opens on the phone.
- [ ] Settings → Coach shows the mode (`live` with a key, `mock` without) and this month's spend.
- [ ] Sign out → back at the Access login.

## 8. Updating

```bash
sudo -u cubyntra -s /bin/bash
cd /opt/cubyntra
git pull
npm ci
npm run build
exit
sudo systemctl restart cubyntra
curl -s http://127.0.0.1:3001/api/health
```

A build replaces `.next/` while the old server is still running from it; the restart right after
makes the gap a few seconds. Do it outside a lesson.

## 9. Backing up `data/`

`data/` holds everything that matters: `students/*.json` (each person's progress), `app-secret`
(signs tokens and passcode cookies; losing it just signs everyone out), `coach-usage.json`,
`voice-usage.json` and `voice/` (cached clips, can be regenerated).

```bash
# Nightly, as root (crontab -e):
15 3 * * * tar -czf /var/backups/cubyntra-data-$(date +\%F).tgz -C /opt/cubyntra data && find /var/backups -name 'cubyntra-data-*.tgz' -mtime +14 -delete
```

Restore: `sudo systemctl stop cubyntra`, extract the archive over `/opt/cubyntra`, fix ownership
(`chown -R cubyntra:cubyntra /opt/cubyntra/data`), start again. Keep backups private: they contain
the app secret and both profiles.
