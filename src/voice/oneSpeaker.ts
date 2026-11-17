/**
 * Cubyntra - One speaker when paired (ADR-016)
 * Necookie Labs (c) 2026
 *
 * With the phone and the laptop paired, both show the same step, and both would speak it. Only
 * the device driving the solve speaks: the one that last showed a new step or sent a playback
 * command (play, pause, seek, speed). The other stays silent until the student drives from it.
 *
 * Messages come back to the device that sent them (the server relays a device's own messages
 * too), so each device sees the same order and reaches the same answer. Not counted:
 * - a `step` for the plan already shown: the other device adopting a step re-sends it, which
 *   must not move the voice to the follower;
 * - playback `index` reports: every animating twin sends them while it plays.
 * Unpaired, or before any such message, this device speaks.
 */

import type { SyncEvent } from '../sync/types';

export class SpeakerArbiter {
  private actor: string | null = null;
  private planId: string | null = null;

  constructor(private readonly ownClientId: () => string) {}

  /** Takes one relayed message into account. */
  observe(event: SyncEvent): void {
    if (event.type === 'step') {
      if (event.payload.planId === this.planId) return;
      this.planId = event.payload.planId;
      this.actor = event.clientId;
    } else if (event.type === 'playback' && event.payload.action !== 'index') {
      this.actor = event.clientId;
    }
  }

  /** True when this device should speak. */
  isSpeaker(): boolean {
    return this.actor === null || this.actor === this.ownClientId();
  }

  /** Forgets the pairing's history (a new pairing or none). */
  reset(): void {
    this.actor = null;
    this.planId = null;
  }
}
