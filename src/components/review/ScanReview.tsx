'use client';

/**
 * Cubyntra - Scan Review & Correction Screen
 * Necookie Labs (c) 2026
 *
 * The last step before solving. Shows all 54 tiles as an unfolded cube, marks the ones
 * the reader was unsure about, and lets the user compare any tile against their own
 * photo and correct it. Solving is only offered once the cube is physically valid.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { CubeColor, CubeState, Face, ValidationIssue } from '@/cube/types';
import { COLORS, COLOR_HEX, FACES } from '@/cube/constants';
import { StickerFlag } from '@/vision/resolveCubeColors';
import { AlertTriangle, CheckCircle2, Info, RotateCcw, ScanLine, Sparkles } from 'lucide-react';

const FACE_LABEL: Record<Face, string> = {
  U: 'Top',
  F: 'Front',
  R: 'Right',
  B: 'Back',
  L: 'Left',
  D: 'Bottom',
};

/** Position of each face in a 4x3 unfolded-cube layout: U over F, L F R B across, D under F. */
const NET_POSITION: Record<Face, { col: number; row: number }> = {
  U: { col: 2, row: 1 },
  L: { col: 1, row: 2 },
  F: { col: 2, row: 2 },
  R: { col: 3, row: 2 },
  B: { col: 4, row: 2 },
  D: { col: 2, row: 3 },
};

/** Tile i after one clockwise turn came from tile CW_SOURCE[i] (mirrors rotateFaceClockwise). */
const CW_SOURCE = [6, 3, 0, 7, 4, 1, 8, 5, 2];

/** Which cell of the original photo a tile came from, undoing any automatic face rotation. */
function photoCell(index: number, quarterTurnsCW: number): number {
  let cell = index;
  for (let t = 0; t < quarterTurnsCW; t++) cell = CW_SOURCE[cell];
  return cell;
}

function isFlagged(flag?: StickerFlag): boolean {
  return Boolean(flag && (flag.lowMargin || flag.overridden));
}

function countColors(state: CubeState): Record<CubeColor, number> {
  const counts = Object.fromEntries(COLORS.map((c) => [c, 0])) as Record<CubeColor, number>;
  for (const face of FACES) for (const c of state[face]) counts[c]++;
  return counts;
}

/** Turns a validator issue into a sentence that tells the user what to do. */
function describeIssue(issue: ValidationIssue, counts: Record<CubeColor, number>): string {
  switch (issue.code) {
    case 'INVALID_COLOR_COUNT': {
      const off = COLORS.filter((c) => counts[c] !== 9).map((c) => `${c} has ${counts[c]}`);
      return `A real cube has 9 of each color, but ${off.join(', ')}.`;
    }
    case 'INVALID_CORNER_COLORS':
      return 'A corner has a color combination no real cube has. Check the marked tiles near the corners.';
    case 'INVALID_EDGE_COLORS':
      return 'An edge has a color combination no real cube has. Check the marked tiles along the edges.';
    case 'CORNER_TWIST_PARITY':
      return 'One corner looks twisted, which usually means one tile on a corner was misread.';
    case 'EDGE_FLIP_PARITY':
      return 'One edge looks flipped: two tiles on an edge are probably swapped.';
    case 'PERMUTATION_PARITY':
      return 'Two pieces look swapped. Recheck the marked tiles, or rescan the face they are on.';
    default:
      return issue.message;
  }
}

interface ScanReviewProps {
  onRescanFace: (face: Face) => void;
  onConfirmed: () => void;
  onStartOver: () => void;
}

export const ScanReview: React.FC<ScanReviewProps> = ({ onRescanFace, onConfirmed, onStartOver }) => {
  const cubeState = useCubyntraStore((s) => s.cubeState);
  const resolution = useCubyntraStore((s) => s.resolution);
  const validation = useCubyntraStore((s) => s.validationResult);
  const faceImages = useCubyntraStore((s) => s.faceImages);
  const setReviewSticker = useCubyntraStore((s) => s.setReviewSticker);
  const confirmReview = useCubyntraStore((s) => s.confirmReview);

  const [selected, setSelected] = useState<{ face: Face; index: number } | null>(null);

  const counts = useMemo(() => countColors(cubeState), [cubeState]);
  const isValid = validation?.valid === true;
  const flaggedCount = resolution?.flaggedCount ?? 0;

  const flaggedTiles = useMemo(
    () =>
      FACES.flatMap((face) =>
        [0, 1, 2, 3, 5, 6, 7, 8].filter((i) => isFlagged(resolution?.flags[face][i])).map((index) => ({ face, index }))
      ),
    [resolution]
  );

  const selectNextFlagged = useCallback(() => {
    if (flaggedTiles.length === 0) return;
    const at = selected
      ? flaggedTiles.findIndex((t) => t.face === selected.face && t.index === selected.index)
      : -1;
    setSelected(flaggedTiles[(at + 1) % flaggedTiles.length]);
  }, [flaggedTiles, selected]);

  const applyColor = useCallback(
    (color: CubeColor) => {
      if (!selected || selected.index === 4) return;
      setReviewSticker(selected.face, selected.index, color);
    },
    [selected, setReviewSticker]
  );

  // Keys 1-6 recolor the selected tile, in swatch order; Escape deselects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return;
      if (e.key === 'Escape') {
        setSelected(null);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 6) {
        e.preventDefault();
        applyColor(COLORS[n - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, applyColor]);

  const handleConfirm = useCallback(async () => {
    if (!isValid) return;
    onConfirmed();
    await confirmReview();
  }, [isValid, onConfirmed, confirmReview]);

  const rotated = Object.entries(resolution?.rotatedFaces ?? {}) as [Face, number][];
  const duplicate = resolution?.duplicateCenters ?? null;
  const firstIssue = validation && !validation.valid ? validation.issues[0] : null;

  const selectedPhoto = selected ? faceImages[selected.face] : undefined;
  const selectedTurns = selected ? resolution?.rotatedFaces[selected.face] ?? 0 : 0;
  const cell = selected ? photoCell(selected.index, selectedTurns) : 0;

  return (
    <section
      aria-labelledby="review-title"
      className="flex flex-col gap-5 w-full max-w-lg mx-auto lg:mx-0 bg-raised/95 backdrop-blur-md border border-neutral-800 p-5 rounded-2xl shadow-2xl"
    >
      <header className="flex flex-col gap-1.5">
        <span className="inline-flex w-fit items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-950/60 border border-sky-800/50 text-[11px] font-mono text-sky-400">
          <ScanLine className="w-3.5 h-3.5" />
          Step 2 of 2 · Check the scan
        </span>
        <h2 id="review-title" className="text-xl font-bold tracking-tight text-white">
          Does this match your cube?
        </h2>
        <p className="text-sm text-neutral-400 leading-relaxed">
          {flaggedCount > 0
            ? 'Tiles with an amber ring were hard to read. Tap one to compare it with your photo.'
            : 'Every tile read cleanly. Give it a glance, then solve.'}
        </p>
      </header>

      {duplicate && (
        <Notice tone="error" icon={<AlertTriangle className="w-4 h-4" />}>
          The {FACE_LABEL[duplicate[0]]} and {FACE_LABEL[duplicate[1]]} photos show the same face.
          <span className="flex gap-2 mt-2">
            {duplicate.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onRescanFace(f)}
                className="px-2.5 py-1 rounded-md bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-semibold hover:bg-rose-500/25 transition-colors"
              >
                Rescan {FACE_LABEL[f]}
              </button>
            ))}
          </span>
        </Notice>
      )}

      {rotated.length > 0 && (
        <Notice tone="info" icon={<Info className="w-4 h-4" />}>
          {rotated.map(([f, turns]) => `${FACE_LABEL[f]} photo turned ${turns === 2 ? 'halfway' : 'a quarter turn'}`).join(', ')}{' '}
          so the pieces fit together.
        </Notice>
      )}

      {/* Unfolded cube */}
      <div
        className="grid gap-1.5 sm:gap-2 self-center"
        style={{ gridTemplateColumns: 'repeat(4, auto)', gridTemplateRows: 'repeat(3, auto)' }}
      >
        {FACES.map((face) => (
          <div
            key={face}
            role="group"
            aria-label={`${FACE_LABEL[face]} face`}
            className="grid grid-cols-3 gap-[3px] p-[3px] rounded-lg bg-neutral-950 ring-1 ring-neutral-800"
            style={{ gridColumn: NET_POSITION[face].col, gridRow: NET_POSITION[face].row }}
          >
            {cubeState[face].map((color, index) => {
              const flag = resolution?.flags[face][index];
              const flagged = isFlagged(flag);
              const isSelected = selected?.face === face && selected.index === index;
              const isCenter = index === 4;
              return (
                <button
                  key={index}
                  type="button"
                  disabled={isCenter}
                  onClick={() => setSelected(isSelected ? null : { face, index })}
                  aria-pressed={isSelected}
                  aria-label={`${FACE_LABEL[face]}, row ${Math.floor(index / 3) + 1} column ${(index % 3) + 1}: ${color}${
                    isCenter ? ', center, fixed' : ''
                  }${flagged ? ', needs a look' : ''}`}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-[5px] transition-transform duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                    isCenter ? 'cursor-default' : 'hover:scale-110 cursor-pointer'
                  } ${isSelected ? 'ring-2 ring-offset-2 ring-offset-neutral-950 ring-sky-400 scale-110' : ''} ${
                    flagged && !isSelected ? 'ring-2 ring-offset-1 ring-offset-neutral-950 ring-amber-400' : ''
                  }`}
                  style={{ backgroundColor: COLOR_HEX[color] }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Editor for the selected tile */}
      {selected ? (
        <div className="flex items-center gap-4 p-3 rounded-xl bg-neutral-900/70 border border-neutral-800">
          {selectedPhoto && (
            <div
              className="w-16 h-16 shrink-0 rounded-lg border border-neutral-700 bg-no-repeat"
              role="img"
              aria-label="This tile in your photo"
              style={{
                backgroundImage: `url(${selectedPhoto})`,
                backgroundSize: '300% 300%',
                backgroundPosition: `${(cell % 3) * 50}% ${Math.floor(cell / 3) * 50}%`,
              }}
            />
          )}
          <div className="flex flex-col gap-2 min-w-0">
            <div className="text-xs text-neutral-400">
              {FACE_LABEL[selected.face]} · row {Math.floor(selected.index / 3) + 1}, column {(selected.index % 3) + 1}
              {selectedPhoto && <span className="text-neutral-500"> · your photo</span>}
            </div>
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Tile color">
              {COLORS.map((color, i) => {
                const active = cubeState[selected.face][selected.index] === color;
                return (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${color} (key ${i + 1})`}
                    title={`${color} · ${i + 1}`}
                    onClick={() => applyColor(color)}
                    className={`w-8 h-8 rounded-md border transition-transform duration-150 motion-reduce:transition-none hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                      active ? 'border-white ring-2 ring-white/60' : 'border-black/40'
                    }`}
                    style={{ backgroundColor: COLOR_HEX[color] }}
                  />
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => onRescanFace(selected.face)}
              className="w-fit inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Rescan the {FACE_LABEL[selected.face].toLowerCase()} face
            </button>
          </div>
        </div>
      ) : (
        flaggedCount > 0 && (
          <button
            type="button"
            onClick={selectNextFlagged}
            className="self-center inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-500/20 transition-colors"
          >
            <span className="w-2 h-2 rounded-full ring-2 ring-amber-400" />
            {flaggedCount} {flaggedCount === 1 ? 'tile needs' : 'tiles need'} a look
          </button>
        )
      )}

      {/* Validity */}
      <div className="flex flex-col gap-2 pt-4 border-t border-neutral-800/80">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Tiles per color">
          {COLORS.map((color) => (
            <span
              key={color}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums border ${
                counts[color] === 9
                  ? 'border-neutral-800 text-neutral-400'
                  : 'border-rose-500/50 text-rose-300 bg-rose-500/10'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-sm border border-black/40" style={{ backgroundColor: COLOR_HEX[color] }} />
              {counts[color]}
            </span>
          ))}
        </div>
        <p
          role="status"
          className={`flex items-start gap-2 text-sm ${isValid ? 'text-emerald-400' : 'text-rose-300'}`}
        >
          {isValid ? (
            <>
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              This is a real, solvable cube.
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {firstIssue ? describeIssue(firstIssue, counts) : 'This cube cannot exist yet.'}
            </>
          )}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onStartOver}
          className="text-xs text-neutral-400 hover:text-white transition-colors underline-offset-4 hover:underline"
        >
          Start over
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!isValid}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500 text-on-accent font-bold text-sm shadow-lg transition-[background-color,transform] duration-150 hover:brightness-110 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        >
          <Sparkles className="w-4 h-4" />
          Confirm &amp; solve
        </button>
      </div>
    </section>
  );
};

function Notice({
  tone,
  icon,
  children,
}: {
  tone: 'info' | 'error';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'note'}
      className={`flex items-start gap-2.5 p-3 rounded-xl text-sm border ${
        tone === 'error'
          ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
          : 'bg-sky-500/10 border-sky-500/30 text-sky-200'
      }`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}
