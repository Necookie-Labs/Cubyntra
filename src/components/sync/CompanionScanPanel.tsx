'use client';

/**
 * Cubyntra - Desktop Progress Panel for a Phone Scan
 * Necookie Labs (c) 2026
 *
 * Shows each face as its photo lands from the phone and whether the desktop could read it.
 */

import React from 'react';
import { useCompanion } from '@/sync/CompanionSyncProvider';
import { FaceScanStatus } from '@/sync/useCompanionSync';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { SCAN_SEQUENCE } from '@/cube/constants';
import { Face } from '@/cube/types';
import { BlockButton, Chip, ChipTone, Panel, ProgressBlocks, cx, stickerColor } from '@/components/ui';
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
}

type Connection = 'ended' | 'reconnecting' | 'phone' | 'waiting';

const CONNECTION_STYLE: Record<Connection, { tone: ChipTone; Icon: typeof Link2; label: string }> = {
  ended: { tone: 'danger', Icon: AlertTriangle, label: 'Pairing ended' },
  reconnecting: { tone: 'warn', Icon: Loader2, label: 'Reconnecting…' },
  phone: { tone: 'leaf', Icon: Link2, label: 'Phone connected' },
  waiting: { tone: 'neutral', Icon: Smartphone, label: 'Waiting for your phone' },
};

const BADGE: Record<FaceScanStatus, string> = {
  accepted: 'bg-leaf text-on-leaf',
  rejected: 'bg-warn text-on-leaf',
  analyzing: 'bg-panel text-ink',
};

export const CompanionScanPanel: React.FC<CompanionScanPanelProps> = ({
  onShowQr,
  onUseWebcam,
  onCancel,
  onNewPairing,
}) => {
  const { mobileConnected, isConnected, sessionEnded, sessionId, faceStatus, faceReasons, lastPhotos } =
    useCompanion();
  const scannedFaces = useCubyntraStore((s) => s.scannedFaces);

  // Older phones send colors instead of photos; count those as read too.
  const statusOf = (face: Face): FaceScanStatus | undefined =>
    faceStatus[face] ?? (scannedFaces[face] ? 'accepted' : undefined);

  const doneCount = SCAN_SEQUENCE.filter((s) => statusOf(s.face) === 'accepted').length;
  const nextStep = SCAN_SEQUENCE.find((s) => statusOf(s.face) !== 'accepted');

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
    <Panel as="section" className="vx-place flex flex-col gap-6 w-full max-w-lg mx-auto lg:mx-0 p-6 pb-8">
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
                : 'Take each photo on your phone. It shows up here within a second and is read on this computer.'}
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
          const status = statusOf(step.face);
          const photo = lastPhotos[step.face];
          const isNext = nextStep?.face === step.face;
          const sticker = stickerColor(step.centerColor);

          return (
            <li key={step.face} className="flex flex-col gap-2">
              <div
                className={cx(
                  'relative aspect-square overflow-hidden border-2 transition-colors duration-100',
                  status === 'accepted'
                    ? 'border-leaf-edge shadow-block-sm'
                    : status === 'rejected'
                    ? 'border-warn-edge shadow-block-sm'
                    : status === 'analyzing' || isNext
                    ? 'border-line shadow-block-sm'
                    : 'border-line-soft'
                )}
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt={`${FACE_LABEL[step.face]} face photo`}
                    className={cx('w-full h-full object-cover', status === 'rejected' && 'opacity-50')}
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-well">
                    <span
                      className={cx('w-8 h-8 border-2', isNext ? 'border-line' : 'border-line-soft opacity-40')}
                      style={{ backgroundColor: sticker }}
                    />
                  </div>
                )}

                {status && (
                  <span
                    className={cx(
                      'absolute top-1 right-1 grid place-items-center w-6 h-6 border-2 border-line',
                      BADGE[status]
                    )}
                  >
                    {status === 'accepted' && <CheckCircle2 className="w-4 h-4" aria-label="Read" />}
                    {status === 'analyzing' && (
                      <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-label="Reading" />
                    )}
                    {status === 'rejected' && <RotateCcw className="w-4 h-4" aria-label="Needs a retake" />}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 border-2 border-line" style={{ backgroundColor: sticker }} />
                <span className={isNext ? 'text-ink font-bold' : 'text-muted'}>{FACE_LABEL[step.face]}</span>
              </div>
              {status === 'rejected' && faceReasons[step.face] && (
                <p className="text-xs leading-snug text-ink bg-warn-soft border-2 border-warn-edge p-1">
                  {faceReasons[step.face]}
                </p>
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
