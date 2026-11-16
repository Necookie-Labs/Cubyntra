'use client';

/**
 * Cubyntra - Checkpoint sheet
 * Necookie Labs (c) 2026
 *
 * "I did it" opens this sheet. It shows how to hold the cube and which face to point at the
 * camera (a flat mini-cube), reads that face with the student's palette and checks it against
 * the step's expected stickers. Unclear reading: show it again. Wrong face: which face to show.
 * Match: a block is placed and the next step loads. A mismatch closes the sheet and the solve
 * screen explains it. Without a camera the student can check by eye ("It matches").
 */

import React, { useEffect, useState } from 'react';
import { Camera, Check, RefreshCw } from 'lucide-react';
import type { CubeColor, Face } from '@/cube/types';
import { COLORS } from '@/cube/constants';
import { gripCenters } from '@/cube/grip';
import { observeFace } from '@/tutor/checkpoint';
import type { StepPlan } from '@/tutor/types';
import { faceToShowNext, type CheckpointOutcome } from '@/app-shell/checkpointAdapter';
import { BlockButton, Dialog, StickerGrid } from '@/components/ui';
import { CameraHelp } from '@/components/camera/CameraHelp';
import { useTutorStore } from '@/stores/useTutorStore';
import { BlockPlaced } from './BlockPlaced';
import { FACE_WORD, MiniCube } from './MiniCube';
import { RETICLE_SHARE, useCheckpointCamera } from './useCheckpointCamera';

/** The face to ask for next, given what the last check said. */
export function askedFace(plan: StepPlan, outcome: CheckpointOutcome | null): Face {
  const next = faceToShowNext(outcome);
  if (next) return next;
  const result = outcome?.result;
  if (result?.wrongFace) return result.wrongFace.asked;
  if (result?.missingFaces.length) return result.missingFaces[0];
  const unclear = result?.stickerResults.find((s) => s.outcome === 'uncertain');
  return unclear?.face ?? plan.checkpoint.facesToShow[0];
}

/** How long the "block placed" moment stays before the next step loads by itself. */
export const CELEBRATE_MS = 1800;

interface Reading {
  face: Face;
  tiles: CubeColor[];
  unsure: number[];
}

export function CheckpointSheet({ plan }: { plan: StepPlan }) {
  const phase = useTutorStore((s) => s.phase);
  const outcome = useTutorStore((s) => s.checkpoint);
  const palette = useTutorStore((s) => s.profile.palette);
  const letters = useTutorStore((s) => s.profile.settings.stickerLetters);
  const earned = useTutorStore((s) => s.profile.stats.checkpointsPassed);
  const { submitObservation, editTiles, confirmByHand, cancelCheckpoint, advance } = useTutorStore.getState();

  const open = phase === 'checking' || phase === 'celebrate';
  const {
    videoRef,
    status: cameraStatus,
    error: cameraError,
    retry: retryCamera,
    capture,
  } = useCheckpointCamera(phase === 'checking', palette);
  const [reading, setReading] = useState<Reading | null>(null);
  const [edits, setEdits] = useState<Map<number, CubeColor>>(new Map());

  // Move on by itself after the short celebration.
  useEffect(() => {
    if (phase !== 'celebrate') return;
    const timer = window.setTimeout(() => void useTutorStore.getState().advance(), CELEBRATE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (!open) return null;

  const face = askedFace(plan, outcome);
  const centers = gripCenters(plan.gripAfter);
  const instruction = `Hold the cube with ${plan.gripAfter.top} on top and ${plan.gripAfter.front} facing you. Point the ${FACE_WORD[face]} face (${centers[face]} center) at the camera.`;
  const status = faceToShowNext(outcome)
    ? `One more face will tell what happened. ${instruction}`
    : outcome && outcome.result.status !== 'match'
      ? outcome.result.message
      : instruction;

  const check = () => {
    const result = capture();
    if (!result) return;
    const tiles = result.stickers.map((s) => s.color);
    setReading({
      face,
      tiles,
      unsure: result.stickers.flatMap((s, i) => (s.confidence < 0.5 ? [i] : [])),
    });
    setEdits(new Map());
    submitObservation(observeFace(face, result.stickers));
  };

  const cycleTile = (index: number) => {
    if (!reading || index === 4) return;
    const current = edits.get(index) ?? reading.tiles[index];
    const next = COLORS[(COLORS.indexOf(current) + 1) % COLORS.length];
    setEdits(new Map(edits).set(index, next));
  };

  const shownTiles = reading ? reading.tiles.map((c, i) => edits.get(i) ?? c) : null;

  if (phase === 'celebrate') {
    const manual = outcome?.result.manual;
    return (
      <Dialog open onClose={() => void advance()} title="Step done" size="sm" footer={
        <BlockButton variant="primary" data-autofocus onClick={() => void advance()}>
          Next step
        </BlockButton>
      }>
        <div role="status">
          <BlockPlaced earned={earned} title="Block placed" detail={manual ? 'Marked as matching.' : 'That matches.'} />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={cancelCheckpoint}
      title="Show me your cube"
      description="Only the stickers this step changed are checked."
      size="md"
      footer={
        <>
          <BlockButton variant="ghost" onClick={confirmByHand}>
            It matches
          </BlockButton>
          <BlockButton
            variant="primary"
            data-autofocus
            disabled={cameraStatus !== 'live'}
            onClick={check}
            icon={<Camera aria-hidden className="h-4 w-4" />}
          >
            {outcome ? 'Check again' : 'Check this face'}
          </BlockButton>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <MiniCube centers={centers} highlight={face} letters={letters} className="shrink-0" />
        <p role="status" aria-live="polite" className="text-sm leading-relaxed text-ink">
          {status}
        </p>
      </div>

      <div className="relative aspect-square w-full overflow-hidden border-4 border-line bg-sticker-core">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        {cameraStatus === 'live' && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="grid grid-cols-3 grid-rows-3 border-4 border-sticker-white"
              style={{ width: `${RETICLE_SHARE * 100}%`, height: `${RETICLE_SHARE * 100}%` }}
            >
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="border border-sticker-white" />
              ))}
            </div>
          </div>
        )}
        {(cameraStatus === 'starting' || cameraStatus === 'off') && (
          <p role="status" className="absolute inset-0 flex items-center justify-center text-sm font-bold text-sticker-white">
            Starting the camera…
          </p>
        )}
        {(cameraStatus === 'denied' || cameraStatus === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel p-4 text-center">
            <p className="text-sm font-bold text-ink">
              {cameraStatus === 'denied' ? 'The camera is blocked.' : 'The camera did not start.'}
            </p>
            <p className="text-xs text-muted">{cameraError} You can also check by eye and press “It matches”.</p>
            <BlockButton size="sm" onClick={retryCamera} icon={<RefreshCw aria-hidden className="h-4 w-4" />}>
              Try again
            </BlockButton>
          </div>
        )}
      </div>

      {(cameraStatus === 'denied' || cameraStatus === 'error') && <CameraHelp open />}

      {reading && shownTiles && outcome && outcome.result.status !== 'match' && (
        <div className="vx-well flex items-start gap-4 p-3">
          <StickerGrid
            tiles={shownTiles}
            label={`What the camera read on the ${FACE_WORD[reading.face]} face`}
            letters={letters}
            marked={reading.unsure}
            onTileClick={cycleTile}
          />
          <div className="flex flex-col gap-2 text-xs text-muted">
            <p>Read wrong? Tap a tile to change its color.</p>
            {edits.size > 0 && (
              <BlockButton
                size="sm"
                icon={<Check aria-hidden className="h-4 w-4" />}
                onClick={() => editTiles(reading.face, [...edits].map(([index, color]) => ({ index, color })))}
              >
                Use my fixes
              </BlockButton>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
