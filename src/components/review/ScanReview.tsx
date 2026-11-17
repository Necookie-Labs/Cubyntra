'use client';

/**
 * Cubyntra - Scan Review & Correction Screen
 * Necookie Labs (c) 2026
 *
 * The last step before solving. Shows all 54 tiles as an unfolded cube, marks the ones
 * the reader was unsure about, and lets the user check any tile against the real cube in
 * their hand and correct it. Solving is only offered once the cube is physically valid.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { CubeColor, CubeState, Face, ValidationIssue } from '@/cube/types';
import { COLORS, FACES } from '@/cube/constants';
import { StickerFlag } from '@/vision/resolveCubeColors';
import { AlertTriangle, CheckCircle2, Info, RotateCcw, ScanLine, Sparkles } from 'lucide-react';
import { BlockButton, Chip, Dialog, cx, stickerColor, stickerLetter, stickerLetterClass } from '@/components/ui';

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
  /** Color-blind option: a letter on every tile. */
  stickerLetters?: boolean;
}

export const ScanReview: React.FC<ScanReviewProps> = ({ onRescanFace, onConfirmed, onStartOver, stickerLetters = false }) => {
  const cubeState = useCubyntraStore((s) => s.cubeState);
  const resolution = useCubyntraStore((s) => s.resolution);
  const validation = useCubyntraStore((s) => s.validationResult);
  const setReviewSticker = useCubyntraStore((s) => s.setReviewSticker);
  const confirmReview = useCubyntraStore((s) => s.confirmReview);
  const pendingFaces = useCubyntraStore((s) => s.pendingFaces);
  const applyPendingFaces = useCubyntraStore((s) => s.applyPendingFaces);
  const discardPendingFaces = useCubyntraStore((s) => s.discardPendingFaces);
  const pendingList = useMemo(() => FACES.filter((f) => pendingFaces[f]), [pendingFaces]);

  const [selected, setSelected] = useState<{ face: Face; index: number } | null>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);

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


  return (
    <section
      aria-labelledby="review-title"
      className="vx-panel vx-place flex flex-col gap-4 w-full max-w-lg mx-auto lg:mx-0 p-6 pb-7"
    >
      <header className="flex flex-col gap-2">
        <Chip tone="leaf" icon={<ScanLine className="w-4 h-4" />} className="w-fit">
          Step 2 of 2 · Check the scan
        </Chip>
        <h2 id="review-title" className="text-2xl leading-tight text-ink">
          Does this match your cube?
        </h2>
        <p className="text-sm text-muted leading-relaxed">
          {flaggedCount > 0
            ? 'Tiles with a yellow marker were hard to read. Tap one and check it against your cube.'
            : 'Every tile read cleanly. Give it a glance, then solve.'}
        </p>
      </header>

      {pendingList.length > 0 && (
        <Notice tone="info" icon={<Info className="w-4 h-4" />}>
          Your phone sent a new reading of the {pendingList.map((f) => FACE_LABEL[f]).join(' and ')} face. Use it?
          Your fixes on other faces stay.
          <span className="flex flex-wrap gap-2 mt-2">
            <BlockButton variant="primary" size="sm" onClick={applyPendingFaces}>
              Use new reading
            </BlockButton>
            <BlockButton size="sm" onClick={discardPendingFaces}>
              Keep my fixes
            </BlockButton>
          </span>
        </Notice>
      )}

      {duplicate && (
        <Notice tone="error" icon={<AlertTriangle className="w-4 h-4" />}>
          The {FACE_LABEL[duplicate[0]]} and {FACE_LABEL[duplicate[1]]} photos show the same face.
          <span className="flex flex-wrap gap-2 mt-2">
            {duplicate.map((f) => (
              <BlockButton key={f} variant="danger" size="sm" onClick={() => onRescanFace(f)}>
                Rescan {FACE_LABEL[f]}
              </BlockButton>
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
        className="grid gap-1 sm:gap-2 self-center"
        style={{ gridTemplateColumns: 'repeat(4, auto)', gridTemplateRows: 'repeat(3, auto)' }}
      >
        {FACES.map((face) => (
          <div
            key={face}
            role="group"
            aria-label={`${FACE_LABEL[face]} face`}
            className="grid grid-cols-3 gap-0.5 p-0.5 bg-sticker-core border-2 border-line shadow-block-sm"
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
                  className={`relative flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 transition-transform duration-75 ${
                    isCenter ? 'cursor-default' : 'cursor-pointer hover:-translate-y-px'
                  } ${isSelected ? 'z-10 scale-110 outline-2 outline-offset-2 outline-focus' : ''}`}
                  style={{ backgroundColor: stickerColor(color) }}
                >
                  {stickerLetters && (
                    <span aria-hidden className={cx('font-mono text-xs font-bold leading-none', stickerLetterClass(color))}>
                      {stickerLetter(color)}
                    </span>
                  )}
                  {flagged && !isSelected && (
                    <span aria-hidden className="absolute -top-1 -right-1 h-3 w-3 border-2 border-line bg-warn" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Editor for the selected tile */}
      {selected ? (
        <div className="vx-well vx-place flex items-center gap-4 p-3">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="text-xs text-muted">
              <span className="font-bold text-ink">{FACE_LABEL[selected.face]}</span> · row{' '}
              {Math.floor(selected.index / 3) + 1}, column {(selected.index % 3) + 1}
            </div>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Tile color">
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
                    className={`vx-hit flex w-8 h-8 items-center justify-center border-2 border-line transition-transform duration-75 ${
                      active
                        ? 'translate-y-0.5 outline-2 outline-offset-2 outline-ink'
                        : 'shadow-block-sm hover:-translate-y-px'
                    }`}
                    style={{ backgroundColor: stickerColor(color) }}
                  >
                    {stickerLetters && (
                      <span aria-hidden className={cx('font-mono text-xs font-bold leading-none', stickerLetterClass(color))}>
                        {stickerLetter(color)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <BlockButton
              variant="ghost"
              size="sm"
              onClick={() => onRescanFace(selected.face)}
              icon={<RotateCcw className="w-4 h-4" />}
              className="w-fit -ml-3"
            >
              Rescan the {FACE_LABEL[selected.face].toLowerCase()} face
            </BlockButton>
          </div>
        </div>
      ) : (
        flaggedCount > 0 && (
          <BlockButton
            size="sm"
            onClick={selectNextFlagged}
            icon={<span aria-hidden className="h-3 w-3 border-2 border-line bg-warn" />}
            className="self-center"
          >
            {flaggedCount} {flaggedCount === 1 ? 'tile needs' : 'tiles need'} a look
          </BlockButton>
        )
      )}

      {/* Validity */}
      <div className="flex flex-col gap-3 pt-4 border-t-2 border-line-soft">
        <ul className="flex flex-wrap items-center gap-2" aria-label="Tiles per color">
          {COLORS.map((color) => (
            <li key={color}>
              <Chip
                tone={counts[color] === 9 ? 'neutral' : 'danger'}
                className="font-mono tabular-nums"
                icon={
                  <span
                    aria-hidden
                    className="h-3 w-3 border-2 border-line"
                    style={{ backgroundColor: stickerColor(color) }}
                  />
                }
              >
                {/* The letter names the color, so the count never relies on the swatch alone. */}
                <span aria-hidden>{stickerLetter(color)}</span>
                <span className="sr-only">{color}:</span> {counts[color]}
                {counts[color] !== 9 && <span className="sr-only">, should be 9</span>}
              </Chip>
            </li>
          ))}
        </ul>
        <p role="status" className="flex items-start gap-2 text-sm font-bold text-ink">
          {isValid ? (
            <>
              <StatusIcon tone="ok">
                <CheckCircle2 className="w-4 h-4" />
              </StatusIcon>
              This is a real, solvable cube.
            </>
          ) : (
            <>
              <StatusIcon tone="bad">
                <AlertTriangle className="w-4 h-4" />
              </StatusIcon>
              {firstIssue ? describeIssue(firstIssue, counts) : 'This cube cannot exist yet.'}
            </>
          )}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <BlockButton variant="ghost" size="sm" onClick={() => setConfirmStartOver(true)} className="-ml-3">
          Start over
        </BlockButton>
        {/* One tap used to throw away all six faces and any fixes, next to Confirm. */}
        <Dialog
          open={confirmStartOver}
          onClose={() => setConfirmStartOver(false)}
          title="Scan all six faces again?"
          description="This scan and your fixes are cleared. To redo one face, tap a tile and choose Rescan."
          size="sm"
          footer={
            <>
              <BlockButton variant="ghost" data-autofocus onClick={() => setConfirmStartOver(false)}>
                Keep this scan
              </BlockButton>
              <BlockButton
                variant="danger"
                onClick={() => {
                  setConfirmStartOver(false);
                  onStartOver();
                }}
              >
                Start over
              </BlockButton>
            </>
          }
        />
        <BlockButton
          variant="primary"
          size="lg"
          onClick={handleConfirm}
          disabled={!isValid}
          icon={<Sparkles className="w-4 h-4" />}
        >
          Confirm &amp; solve
        </BlockButton>
      </div>
    </section>
  );
};

/** Icon in a small solid block, so the status never relies on text color alone. */
function StatusIcon({ tone, children }: { tone: 'ok' | 'bad'; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 border-line ${
        tone === 'ok' ? 'bg-leaf text-on-leaf' : 'bg-danger text-on-danger'
      }`}
    >
      {children}
    </span>
  );
}

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
      className={`flex items-start gap-3 p-3 text-sm text-ink border-2 ${
        tone === 'error' ? 'bg-danger-soft border-danger' : 'bg-well border-line-soft'
      }`}
    >
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 border-line ${
          tone === 'error' ? 'bg-danger text-on-danger' : 'bg-panel text-ink'
        }`}
      >
        {icon}
      </span>
      <div className="flex flex-col pt-0.5">{children}</div>
    </div>
  );
}
