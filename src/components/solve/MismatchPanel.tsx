'use client';

/**
 * Cubyntra - After a checkpoint that did not match
 * Necookie Labs (c) 2026
 *
 * Says what most likely happened (from the diagnosis), then offers the ways forward: replay
 * the step, fix the slip (a corrective step) or carry on from the cube the student most likely
 * has, show one more face when that would settle it, rescan the whole cube, or
 * "it actually matches" (the camera was wrong). The read faces can be corrected tile by tile.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Eye, RotateCcw, ScanLine } from 'lucide-react';
import { faceToShowNext } from '@/app-shell/checkpointAdapter';
import type { CubeColor, Face } from '@/cube/types';
import { COLORS } from '@/cube/constants';
import { BlockButton, Panel, StickerGrid } from '@/components/ui';
import { focusIfLost } from '@/components/ui/focus';
import { useTutorStore } from '@/stores/useTutorStore';
import { FACE_WORD } from './MiniCube';

function FaceFixer({ face, tiles, wrong, letters }: { face: Face; tiles: CubeColor[]; wrong: number[]; letters: boolean }) {
  const editTiles = useTutorStore((s) => s.editTiles);
  const [edits, setEdits] = useState<Map<number, CubeColor>>(new Map());
  const shown = tiles.map((c, i) => edits.get(i) ?? c);
  const cycle = (index: number) => {
    if (index === 4) return;
    const next = COLORS[(COLORS.indexOf(shown[index]) + 1) % COLORS.length];
    setEdits(new Map(edits).set(index, next));
  };
  return (
    <div className="flex items-start gap-3">
      <StickerGrid
        tiles={shown}
        label={`The ${FACE_WORD[face]} face as the camera read it`}
        marked={wrong}
        letters={letters}
        onTileClick={cycle}
      />
      <div className="flex flex-col gap-2 text-xs text-muted">
        <span className="font-bold text-ink">{FACE_WORD[face][0].toUpperCase() + FACE_WORD[face].slice(1)} face</span>
        <span>Marked tiles did not match. Tap a tile if the camera got it wrong.</span>
        {edits.size > 0 && (
          <BlockButton
            size="sm"
            icon={<Check aria-hidden className="h-4 w-4" />}
            onClick={() => editTiles(face, [...edits].map(([index, color]) => ({ index, color })))}
          >
            Check with my fixes
          </BlockButton>
        )}
      </div>
    </div>
  );
}

export function MismatchPanel() {
  const router = useRouter();
  const outcome = useTutorStore((s) => s.checkpoint);
  const requestRescan = useTutorStore((s) => s.requestRescan);
  const observations = useTutorStore((s) => s.observations);
  const letters = useTutorStore((s) => s.profile.settings.stickerLetters);
  const { replayStep, continueFromDiagnosis, confirmByHand, showNextFace } = useTutorStore.getState();
  // The sheet that closed took "I did it" with it: the result's heading takes the focus.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => focusIfLost(headingRef.current), [outcome]);
  if (!outcome) return null;

  const top = outcome.diagnosis?.likelyMistakes[0];
  const recovery = outcome.recovery;
  const showNext = faceToShowNext(outcome);
  const wrongByFace = new Map<Face, number[]>();
  for (const r of outcome.result.stickerResults) {
    if (r.outcome === 'mismatch') wrongByFace.set(r.face, [...(wrongByFace.get(r.face) ?? []), r.index]);
  }

  return (
    <Panel as="section" aria-labelledby="mismatch-title" className="vx-place flex flex-col gap-4 bg-danger-soft">
      {/* The result is announced politely; the ways forward below are not part of the message. */}
      <div role="status" className="flex flex-col gap-1">
        <h2 ref={headingRef} id="mismatch-title" tabIndex={-1} className="text-xl leading-tight text-ink outline-none">
          Not quite yet
        </h2>
        <p className="text-sm leading-relaxed text-ink">
          {top ? top.description : 'Some stickers are not where this step puts them. Replay the step and try again.'}
        </p>
      </div>

      {observations.length > 0 && (
        <div className="flex flex-col gap-3">
          {observations.map((o) => (
            <FaceFixer
              key={o.face}
              face={o.face}
              tiles={o.stickers.map((s) => s.color)}
              wrong={wrongByFace.get(o.face) ?? []}
              letters={letters}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <BlockButton variant="primary" onClick={replayStep} icon={<RotateCcw aria-hidden className="h-4 w-4" />}>
          Replay the step
        </BlockButton>
        {recovery?.action === 'resume' && (
          <BlockButton onClick={continueFromDiagnosis} icon={<ArrowRight aria-hidden className="h-4 w-4" />}>
            {recovery.resume.kind === 'corrective' ? 'Show me how to fix it' : 'Carry on from here'}
          </BlockButton>
        )}
        {showNext && (
          <BlockButton onClick={showNextFace} icon={<Eye aria-hidden className="h-4 w-4" />}>
            Show the {FACE_WORD[showNext]} face too
          </BlockButton>
        )}
        <BlockButton
          onClick={() => {
            requestRescan();
            router.push('/scan');
          }}
          icon={<ScanLine aria-hidden className="h-4 w-4" />}
        >
          Rescan the cube
        </BlockButton>
        <BlockButton variant="ghost" onClick={confirmByHand}>
          It actually matches
        </BlockButton>
      </div>
    </Panel>
  );
}
