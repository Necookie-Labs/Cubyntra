/**
 * Cubyntra - Two-way playback control rules
 * Necookie Labs (c) 2026
 *
 * Either device can play, pause, seek or change speed. The server stamps every message with a
 * per-session sequence number, and each device applies playback messages in that order, own
 * messages included, so concurrent commands settle on the one the server received last
 * (last writer wins) on both devices.
 *
 * The exception is `index`: the device that animates the twin (the driver) reports each move
 * it reaches. Those reports are already applied where they came from, and while the driver is
 * playing it ignores reports from elsewhere, so a late report can never pull it backwards.
 */

import { PlaybackPayload, PlaybackState, SyncEvent } from './types';

export interface PlaybackView {
  playing: boolean;
  index: number;
  speed: number;
}

export interface ApplyContext {
  /** Highest playback sequence number applied so far. */
  lastSeq: number;
  ownClientId: string;
  /** This device animates the twin. */
  drives: boolean;
  locallyPlaying: boolean;
}

type PlaybackEvent = Extract<SyncEvent, { type: 'playback' }>;

export function isPlaybackEvent(event: SyncEvent): event is PlaybackEvent {
  return event.type === 'playback';
}

/** Whether a relayed playback message should change this device's playback. */
export function shouldApplyPlayback(event: PlaybackEvent, ctx: ApplyContext): boolean {
  if (event.seq <= ctx.lastSeq) return false;
  const own = event.clientId === ctx.ownClientId;
  if (event.payload.action === 'index') {
    if (own) return false;
    if (ctx.drives && ctx.locallyPlaying) return false;
  }
  return true;
}

/** The view after one playback command. A seek also pauses. */
export function applyPlaybackAction(view: PlaybackView, payload: PlaybackPayload): PlaybackView {
  switch (payload.action) {
    case 'play':
      return { ...view, playing: true };
    case 'pause':
      return { ...view, playing: false };
    case 'seek':
      return { ...view, playing: false, index: payload.index ?? view.index };
    case 'index':
      return { ...view, index: payload.index ?? view.index };
    case 'speed':
      return { ...view, speed: payload.speed ?? view.speed };
  }
}

/** The view a (re)connecting device starts from. */
export function viewFromState(state: PlaybackState): PlaybackView {
  return { playing: state.playing, index: state.index, speed: state.speed };
}
