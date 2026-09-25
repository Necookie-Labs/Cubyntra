# Cubyntra Production Deployment Guide

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented  
**Scope**: Hosting, Build Configuration, and HTTPS Requirements

---

## 1. Prerequisites

- **Node.js**: v20.x or higher LTS
- **Package Manager**: npm v10.x or higher (or pnpm / yarn)
- **HTTPS Enforcement**: Required for WebRTC camera access (`getUserMedia`) on all non-localhost domains.

---

## 2. Build & Verification Commands

```bash
# Install dependencies
npm ci

# Run test suite
npm run test

# Run TypeScript type check
npm run typecheck

# Run ESLint validation
npm run lint

# Compile production bundle
npm run build

# Start local production server
npm run start -p 3000
```

---

## 3. Deployment Targets

### 3.1 Vercel (Recommended)
Because Cubyntra is built on Next.js 15+ App Router, deployment to Vercel provides automatic HTTPS, edge CDN caching for Three.js assets, and zero-configuration routing:

1. Connect `https://github.com/Necookie-Labs/Cubyntra.git` to Vercel.
2. Framework Preset: **Next.js**.
3. Build Command: `npm run build`.
4. Output Directory: `.next`.
5. HTTPS is provisioned automatically with TLS certificates, satisfying camera security requirements.

### 3.2 Docker / Self-Hosted Container
For self-hosted production deployments, use this multi-stage `Dockerfile`:

```dockerfile
# Stage 1: Build dependencies
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run test
RUN npm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npm", "run", "start"]
```

---

## 4. Reverse Proxy & SSL / TLS Configuration

When deploying behind NGINX or Caddy, ensure TLS 1.3 is enabled and HTTP is redirected to HTTPS:

```nginx
server {
    listen 80;
    server_name cubyntra.necookie.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cubyntra.necookie.com;

    ssl_certificate /etc/letsencrypt/live/cubyntra.necookie.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cubyntra.necookie.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
