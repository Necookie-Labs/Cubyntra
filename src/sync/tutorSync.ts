/**
 * Cubyntra - Guided-solve sync between the laptop and the paired phone (state only, ADR-015)
 * Necookie Labs (c) 2026
 *
 * The device running `/solve` (normally the laptop) publishes the step on screen: the cube at the
 * start of the step, the step's moves, the grip, and every play / pause / seek / speed change of
 * its twin. The phone mirrors them and can send playback commands back. Grip changes and
 * checkpoint verdicts reached on the other device are applied to the tutor session.
 *
 * Playback positions on the wire follow the sync protocol: -1 = before the first move, i = move i
 * done. The twin's controller counts moves applied (0..total), so wire index = applied - 1.
 */

import { formatAlgorithm } from '@/cube/transforms';
import type { Grip } from '@/cube/grip';
import type { PlaybackSnapshot, PlaybackSpeed } from '@/three/playback';
import type { StepPlan } from '@/tutor/types';
import type { CheckpointResultPayload, PlaybackPayload, SyncEvent, SyncMessage } from './types';

/** Short stable id for a step (FNV-1a of its method, index, case and moves). */
export function planIdFor(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `step-${(h >>> 0).toString(36)}`;
}

export function stepAlgorithm(plan: StepPlan): string {
  return formatAlgorithm([...plan.setupMoves, ...plan.algorithm]);
}

export function stepPlanId(plan: StepPlan): string {
  return planIdFor(`${plan.method}|${plan.stepIndex}|${plan.caseId}|${stepAlgorithm(plan)}`);
}

/** What the device on /solve sends when a step appears. */
export function stepMessages(plan: StepPlan): SyncMessage[] {
  return [
    { type: 'cube-state', payload: { state: plan.startState } },
    {
      type: 'step',
      payload: { method: plan.method, stepIndex: plan.stepIndex, planId: stepPlanId(plan), algorithm: stepAlgorithm(plan) },
    },
    { type: 'grip', payload: { top: plan.grip.top, front: plan.grip.front } },
  ];
}

/** Playback messages for the change from `prev` to `next` on this device's twin. */
export function playbackMessages(prev: PlaybackSnapshot | null, next: PlaybackSnapshot): PlaybackPayload[] {
  const out: PlaybackPayload[] = [];
  if (!prev || prev.moves !== next.moves) return out; // a new step: the step message covers it
  if (next.playing !== prev.playing) out.push({ action: next.playing ? 'play' : 'pause' });
  if (next.speed !== prev.speed) out.push({ action: 'speed', speed: next.speed });
  if (next.index !== prev.index) out.push({ action: next.playing ? 'index' : 'seek', index: next.index - 1 });
  return out;
}

/** The part of the twin's playback controller a remote command drives. */
export interface TwinPlayback {
  getSnapshot(): PlaybackSnapshot;
  play(): Promise<void>;
  pause(): void;
  seek(index: number): Promise<void>;
  setSpeed(speed: PlaybackSpeed): void;
}

/** Applies a relayed playback command to the twin. */
export function applyPlaybackToTwin(twin: TwinPlayback, payload: PlaybackPayload): void {
  const snap = twin.getSnapshot();
  switch (payload.action) {
    case 'play':
      if (!snap.playing) void twin.play();
      break;
    case 'pause':
      if (snap.playing) twin.pause();
      break;
    case 'speed':
      if ((payload.speed === 1 || payload.speed === 0.5) && payload.speed !== snap.speed) twin.setSpeed(payload.speed);
      break;
    case 'seek':
    case 'index':
      if (payload.index !== undefined && payload.index + 1 !== snap.index) void twin.seek(payload.index + 1);
      break;
  }
}

/** What a relayed grip or checkpoint verdict means for the session, if it is for this step. */
export type TutorSyncAction =
  | { kind: 'grip'; grip: Grip }
  | { kind: 'checkpoint'; payload: CheckpointResultPayload }
  | null;

export function tutorActionFor(event: SyncEvent, ownClientId: string, plan: StepPlan | null): TutorSyncAction {
  if (event.clientId === ownClientId || !plan) return null;
  if (event.type === 'grip') return { kind: 'grip', grip: { top: event.payload.top, front: event.payload.front } };
  if (event.type === 'checkpoint-result') {
    const p = event.payload;
    if (p.planId !== stepPlanId(plan) || p.stepIndex !== plan.stepIndex) return null;
    return { kind: 'checkpoint', payload: p };
  }
  return null;
}
