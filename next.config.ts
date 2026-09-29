import type { NextConfig } from "next";

/**
 * The phone companion opens the dev server by the desktop's LAN address, which Next.js
 * treats as a cross-origin dev client and blocks from /_next/hmr; the page then never
 * hydrates and the camera never starts. Allow loopback and the RFC 1918 private ranges
 * only, so a phone on the same network works while public hostnames stay blocked.
 * Production builds do not use this setting.
 */
const privateLanOrigins = [
  "127.0.0.1",
  "10.*.*.*",
  "192.168.*.*",
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: privateLanOrigins,
};

export default nextConfig;
