/**
 * Cubyntra - Two-way playback control tests
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { SessionManager } from '../src/sync/sessionManager';
import {
  PlaybackView,
  applyPlaybackAction,
  isPlaybackEvent,
  shouldApplyPlayback,
} from '../src/sync/playbackSync';
import { PlaybackPayload, StreamEvent, SyncEvent } from '../src/sync/types';

/** One device: applies its own commands at once, then relayed ones by the rules. */
class Device {
  view: PlaybackView = { playing: false, index: -1, speed: 1 };
  lastSeq = 0;
  inbox: SyncEvent[] = [];
  constructor(
    readonly role: 'desktop' | 'mobile',
    readonly clientId: string,
    readonly drives: boolean
  ) {}

  local(payload: PlaybackPayload) {
    this.view = applyPlaybackAction(this.view, payload);
  }

  deliver(event: SyncEvent) {
    if (!isPlaybackEvent(event)) return;
    const ctx = { lastSeq: this.lastSeq, ownClientId: this.clientId, drives: this.drives, locallyPlaying: this.view.playing };
    if (shouldApplyPlayback(event, ctx)) this.view = applyPlaybackAction(this.view, event.payload);
    this.lastSeq = Math.max(this.lastSeq, event.seq);
  }
}

function setup() {
  const manager = new SessionManager();
  const { id } = manager.createSession()!;
  const laptop = new Device('desktop', 'laptop-client', true);
  const phone = new Device('mobile', 'phone-client', false);
  manager.subscribe(id, (e: StreamEvent) => {
    if (e.kind !== 'message') return;
    laptop.inbox.push(e.event);
    phone.inbox.push(e.event);
  });
  const send = (device: Device, payload: PlaybackPayload) => {
    device.local(payload);
    manager.publish(id, { type: 'playback', payload, role: device.role, clientId: device.clientId });
  };
  return { manager, id, laptop, phone, send };
}

describe('two-way playback', () => {
  it('converges on the last writer when both devices press at once', () => {
    const { laptop, phone, send } = setup();
    // Both press before either hears the other: the server receives play, then pause.
    send(laptop, { action: 'play' });
    send(phone, { action: 'pause' });
    // The phone hears the laptop's play before its own pause comes back, and vice versa.
    for (const d of [laptop, phone]) for (const e of d.inbox.splice(0)) d.deliver(e);
    expect(laptop.view.playing).toBe(false);
    expect(phone.view.playing).toBe(false);
  });

  it('converges on the last seek', () => {
    const { laptop, phone, send } = setup();
    send(laptop, { action: 'seek', index: 3 });
    send(phone, { action: 'seek', index: 7 });
    for (const d of [laptop, phone]) for (const e of d.inbox.splice(0)) d.deliver(e);
    expect(laptop.view.index).toBe(7);
    expect(phone.view.index).toBe(7);
  });

  it('the phone mirrors the laptop as it plays, and a late echo never pulls the laptop back', () => {
    const { laptop, phone, send } = setup();
    send(laptop, { action: 'play' });
    send(laptop, { action: 'index', index: 0 });
    send(laptop, { action: 'index', index: 1 });
    laptop.local({ action: 'index', index: 2 }); // the laptop has already moved on
    for (const d of [laptop, phone]) for (const e of d.inbox.splice(0)) d.deliver(e);
    expect(laptop.view).toMatchObject({ playing: true, index: 2 });
    expect(phone.view).toMatchObject({ playing: true, index: 1 });
  });

  it('a pause from the phone stops the laptop, and speed changes reach both', () => {
    const { laptop, phone, send } = setup();
    send(laptop, { action: 'play' });
    for (const d of [laptop, phone]) for (const e of d.inbox.splice(0)) d.deliver(e);
    send(phone, { action: 'pause' });
    send(phone, { action: 'speed', speed: 0.5 });
    for (const d of [laptop, phone]) for (const e of d.inbox.splice(0)) d.deliver(e);
    expect(laptop.view).toMatchObject({ playing: false, speed: 0.5 });
    expect(phone.view).toMatchObject({ playing: false, speed: 0.5 });
  });

  it('ignores stale messages', () => {
    const d = new Device('mobile', 'phone-client', false);
    d.lastSeq = 10;
    d.deliver({ type: 'playback', payload: { action: 'play' }, role: 'desktop', clientId: 'x', seq: 9, at: 0 });
    expect(d.view.playing).toBe(false);
  });
});
