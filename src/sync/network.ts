/**
 * Cubyntra - Pairing Address Selection
 * Necookie Labs (c) 2026
 *
 * Picks which of the computer's addresses to put in the pairing QR code.
 */

/**
 * Lower is better. Home and office Wi-Fi almost always hand out 192.168.x.x, then 10.x,
 * then 172.16-31.x. 100.64.0.0/10 is carrier-grade NAT, the range VPN meshes such as
 * Tailscale use: a phone on plain Wi-Fi cannot reach it, so it must not be the default.
 */
export function lanAddressRank(address: string): number {
  const [a, b] = address.split('.').map(Number);
  if (a === 192 && b === 168) return 0;
  if (a === 10) return 1;
  if (a === 172 && b >= 16 && b <= 31) return 2;
  if (a === 100 && b >= 64 && b <= 127) return 4;
  return 3;
}

/** Orders candidate IPv4 addresses so the one a phone on the same Wi-Fi can reach comes first. */
export function rankLanAddresses(addresses: string[]): string[] {
  return [...new Set(addresses)].sort((x, y) => lanAddressRank(x) - lanAddressRank(y));
}
