'use client';

/**
 * Cubyntra - Desktop Progress Panel for a Phone Scan
 * Necookie Labs (c) 2026
 *
 * Shows each face's colors as the phone reads it. The phone does the reading; only colors reach
 * this computer (ADR-015).
 */

import React from 'react';
import { useCompanion } from '@/sync/CompanionSyncProvider';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { SCAN_SEQUENCE } from '@/cube/constants';
import { Face } from '@/cube/types';
import { BlockButton, Chip, ChipTone, Panel, ProgressBlocks, cx, stickerColor, stickerLetter, stickerLetterClass } from '@/components/ui';
import { useTutorStore } from '@/stores/useTutorStore';
import { AlertTriangle, Camera, CheckCircle2, Link2, Loader2, QrCode, RotateCcw, Smartphone } from 'lucide-react';

const FACE_LABEL: Record<Face, string> = {
  U: 'Top',
  F: 'Front',
  R: 'Right',
  B: 'Back',
  L: 'Left',
  D: 'Bottom',
};

interface CompanionScanPanelProps {
  onShowQr: () => void;
  onUseWebcam: () => void;
  /** End the phone scan and return to the start screen. */
  onCancel: () => void;
  /** Start a new pairing (new QR code) after the old one ended. */
  onNewPairing: () => void;
  /** Drop one face's reading and send the phone back to that face (a color came out wrong). */
  onRescanFace?: (face: Face) => void;
}

type Connection = 'ended' | 'reconnecting' | 'phone' | 'waiting';

const CONNECTION_STYLE: Record<Connection, { tone: ChipTone; Icon: typeof Link2; label: string }> = {
  ended: { tone: 'danger', Icon: AlertTriangle, label: 'Pairing ended' },
  reconnecting: { tone: 'warn', Icon: Loader2, label: 'Reconnecting…' },
  phone: { tone: 'success', Icon: Link2, label: 'Phone connected' },
  waiting: { tone: 'neutral', Icon: Smartphone, label: 'Waiting for your phone' },
};

export const CompanionScanPanel: React.FC<CompanionScanPanelProps> = ({
  onShowQr,
  onUseWebcam,
  onCancel,
  onNewPairing,
  onRescanFace,
}) => {
  const { mobileConnected, isConnected, sessionEnded, sessionId } = useCompanion();
  const scannedFaces = useCubyntraStore((s) => s.scannedFaces);
  const letters = useTutorStore((s) => s.profile.settings.stickerLetters);

  const isRead = (face: Face) => Boolean(scannedFaces[face]);
  const doneCount = SCAN_SEQUENCE.filter((s) => isRead(s.face)).length;
  const nextStep = SCAN_SEQUENCE.find((s) => !isRead(s.face));

  // A stream that has not opened yet is "waiting", not "reconnecting".
  const connection: Connection = sessionEnded
    ? 'ended'
    : sessionId && !isConnected && mobileConnected
    ? 'reconnecting'
    : mobileConnected
    ? 'phone'
    : 'waiting';
  const style = CONNECTION_STYLE[connection];
  const StatusIcon = style.Icon;

  return (
    <Panel as="section" className="vx-place flex flex-col gap-6 w-full max-w-lg mx-auto lg:mx-0 p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Chip
            tone={style.tone}
            role="status"
            className="w-fit"
            icon={
              <StatusIcon
                aria-hidden
                className={cx('w-3 h-3', connection === 'reconnecting' && 'animate-spin motion-reduce:animate-none')}
              />
            }
          >
            {style.label}
          </Chip>
          <h2 className="text-2xl leading-tight text-ink">Scanning with your phone</h2>
          {connection === 'ended' ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-ink leading-relaxed">
                This pairing expired or the server restarted, so your phone can no longer reach this computer.
                Make a new QR code and scan it with your phone to carry on.
              </p>
              <BlockButton variant="primary" size="sm" onClick={onNewPairing} icon={<QrCode className="w-4 h-4" />}>
                New QR code
              </BlockButton>
            </div>
          ) : (
            <p className="text-sm text-muted leading-relaxed">
              {connection === 'reconnecting'
                ? 'The connection dropped. Reconnecting on its own; keep your phone on this page.'
                : 'Your phone reads each face and sends only its colors here. No photos leave your phone.'}
            </p>
          )}
        </div>
        <BlockButton size="sm" onClick={onShowQr} icon={<QrCode className="w-4 h-4" />}>
          Show QR
        </BlockButton>
      </header>

      <div className="flex items-center gap-3">
        <ProgressBlocks total={6} done={doneCount} label="Faces read" className="flex-1" />
        <span className="text-sm font-mono font-bold text-ink tabular-nums">{doneCount}/6</span>
      </div>

      <ol className="grid grid-cols-3 gap-4">
        {SCAN_SEQUENCE.map((step) => {
          const scanned = scannedFaces[step.face];
          const isNext = nextStep?.face === step.face;
          const sticker = stickerColor(step.centerColor);

          return (
            <li key={step.face} className="flex flex-col gap-2">
              <div
                className={cx(
                  'relative aspect-square overflow-hidden rounded-xl border-2 border-b-4 transition-colors duration-100',
                  scanned
                    ? 'border-success border-b-success-edge shadow-block-sm'
                    : isNext
                    ? 'border-primary border-b-primary-edge shadow-block-sm'
                    : 'border-line-soft'
                )}
              >
                {scanned ? (
                  <div
                    role="img"
                    aria-label={`${FACE_LABEL[step.face]} face colors: ${scanned.stickers.join(', ')}`}
                    className="grid grid-cols-3 gap-0.5 w-full h-full p-1 bg-sticker-core"
                  >
                    {scanned.stickers.map((color, i) => (
                      <span key={i} className="grid place-items-center rounded-xs" style={{ backgroundColor: stickerColor(color) }}>
                        {letters && (
                          <span aria-hidden className={cx('font-mono text-xs font-bold leading-none', stickerLetterClass(color))}>
                            {stickerLetter(color)}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={cx('w-full h-full grid place-items-center', isNext ? 'bg-primary-soft' : 'bg-well')}>
                    <span
                      className={cx('w-8 h-8 rounded-sm border-2', isNext ? 'border-sticker-core' : 'border-line-soft opacity-40')}
                      style={{ backgroundColor: sticker }}
                    />
                  </div>
                )}

                {scanned && (
                  <span className="absolute top-1.5 right-1.5 grid place-items-center w-6 h-6 rounded-full border-2 border-success-edge bg-success text-on-success">
                    <CheckCircle2 className="w-4 h-4" aria-label="Read" />
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span aria-hidden className="w-3 h-3 rounded-full border-2 border-sticker-core" style={{ backgroundColor: sticker }} />
                <span className={isNext ? 'text-ink font-bold' : 'text-muted'}>{FACE_LABEL[step.face]}</span>
              </div>

              {scanned && onRescanFace && (
                <BlockButton
                  variant="ghost"
                  size="sm"
                  onClick={() => onRescanFace(step.face)}
                  aria-label={`Rescan the ${FACE_LABEL[step.face].toLowerCase()} face`}
                  icon={<RotateCcw aria-hidden className="w-4 h-4" />}
                  className="self-start"
                >
                  Rescan
                </BlockButton>
              )}
            </li>
          );
        })}
      </ol>

      <footer className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t-2 border-line-soft">
        <p className="flex items-center gap-2 text-xs text-muted min-w-0">
          <Smartphone className="w-4 h-4 shrink-0 text-ink" />
          <span className="truncate">
            {nextStep ? (
              <>
                Next on your phone: <span className="text-ink font-bold">{FACE_LABEL[nextStep.face]}</span>{' '}
                ({nextStep.centerColor} center)
              </>
            ) : (
              'All six faces read'
            )}
          </span>
        </p>
        <div className="shrink-0 flex items-center gap-2">
          <BlockButton variant="ghost" size="sm" onClick={onUseWebcam} icon={<Camera className="w-4 h-4" />}>
            Use webcam
          </BlockButton>
          <BlockButton size="sm" onClick={onCancel}>
            Cancel
          </BlockButton>
        </div>
      </footer>
    </Panel>
  );
};
