/**
 * Cubyntra - Pairing Address Selection Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect } from 'vitest';
import { rankLanAddresses } from '../src/sync/network';

describe('rankLanAddresses', () => {
  it('puts the Wi-Fi address ahead of a VPN mesh address', () => {
    // The order Windows reported on a machine running Tailscale.
    expect(rankLanAddresses(['100.73.33.14', '192.168.1.4'])[0]).toBe('192.168.1.4');
  });

  it('orders private ranges by how often home networks use them', () => {
    expect(rankLanAddresses(['100.100.1.1', '172.20.0.5', '10.0.0.8', '192.168.0.2'])).toEqual([
      '192.168.0.2',
      '10.0.0.8',
      '172.20.0.5',
      '100.100.1.1',
    ]);
  });

  it('does not treat public 172 or 100 addresses as private', () => {
    expect(rankLanAddresses(['100.20.0.1', '100.70.0.1'])).toEqual(['100.20.0.1', '100.70.0.1']);
    expect(rankLanAddresses(['172.40.0.1', '10.1.1.1'])[0]).toBe('10.1.1.1');
  });

  it('removes duplicates', () => {
    expect(rankLanAddresses(['10.0.0.1', '10.0.0.1'])).toEqual(['10.0.0.1']);
  });
});
