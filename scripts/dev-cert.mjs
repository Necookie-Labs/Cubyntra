/**
 * Cubyntra - Development HTTPS Certificate
 * Necookie Labs (c) 2026
 *
 * Phones only allow camera access on https:// pages (localhost is the lone exception), so
 * the dev server must serve HTTPS for the phone companion to work over Wi-Fi.
 *
 * Writes a self-signed certificate for localhost and this machine's network addresses to
 * .certs/. Nothing is installed into the system trust store, so browsers show a one-time
 * "not private" warning; tap Advanced -> Proceed. The certificate is regenerated when the
 * network addresses change or it is close to expiring.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';
import { join } from 'node:path';
import selfsigned from 'selfsigned';

const DIR = '.certs';
const KEY = join(DIR, 'dev-key.pem');
const CERT = join(DIR, 'dev-cert.pem');
const META = join(DIR, 'dev-cert.json');
const VALID_DAYS = 365;
const RENEW_WITHIN_DAYS = 14;

function localIPv4() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address)
    .sort();
}

const ips = ['127.0.0.1', ...localIPv4()];
const dnsNames = ['localhost', hostname()];

function isCurrent() {
  if (!existsSync(KEY) || !existsSync(CERT) || !existsSync(META)) return false;
  try {
    const meta = JSON.parse(readFileSync(META, 'utf8'));
    const renewAt = new Date(meta.expires).getTime() - RENEW_WITHIN_DAYS * 86_400_000;
    return JSON.stringify(meta.ips) === JSON.stringify(ips) && Date.now() < renewAt;
  } catch {
    return false;
  }
}

if (isCurrent()) {
  console.log(`[dev-cert] Using existing certificate for ${ips.join(', ')}`);
} else {
  const notBeforeDate = new Date();
  const notAfterDate = new Date(notBeforeDate.getTime() + VALID_DAYS * 86_400_000);
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'Cubyntra dev' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notBeforeDate,
    notAfterDate,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          ...dnsNames.map((value) => ({ type: 2, value })),
          ...ips.map((ip) => ({ type: 7, ip })),
        ],
      },
    ],
  });

  mkdirSync(DIR, { recursive: true });
  writeFileSync(KEY, pems.private);
  writeFileSync(CERT, pems.cert);
  writeFileSync(META, JSON.stringify({ ips, expires: notAfterDate.toISOString() }, null, 2));
  console.log(`[dev-cert] Created a certificate for ${ips.join(', ')}`);
}

console.log('[dev-cert] Browsers will warn once that the connection is not private: tap Advanced -> Proceed.');
