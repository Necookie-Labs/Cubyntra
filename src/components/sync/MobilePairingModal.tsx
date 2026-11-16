'use client';

/**
 * Cubyntra - Mobile Companion QR Pairing Modal
 * Necookie Labs (c) 2026
 */

import React, { useEffect, useRef, useState } from 'react';
import { useCompanion } from '@/sync/CompanionSyncProvider';
import { FACES, CANONICAL_CENTER_COLORS } from '@/cube/constants';
import {
  Smartphone,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Loader2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { BlockButton, Chip, Dialog, IconButton, stickerColor } from '@/components/ui';

interface MobilePairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToWebcam?: () => void;
}

export const MobilePairingModal: React.FC<MobilePairingModalProps> = ({
  isOpen,
  onClose,
  onSwitchToWebcam,
}) => {
  const {
    sessionId,
    qrDataUrl,
    companionUrl,
    availableIps,
    setCustomUrl,
    isCreating,
    mobileConnected,
    error,
    faceStatus,
    initSession,
  } = useCompanion();

  // The session outlives this dialog: closing it must not disconnect the phone, which
  // keeps shooting while the desktop shows progress and, later, the review screen.
  // After a failure, wait for "Try again" rather than retrying in a loop.
  useEffect(() => {
    if (isOpen && !sessionId && !isCreating && !error) void initSession();
  }, [isOpen, sessionId, isCreating, error, initSession]);

  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const linkRef = useRef<HTMLSpanElement>(null);
  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      // Clipboard can be blocked; select the link so it can be copied by hand.
      const range = document.createRange();
      if (linkRef.current) {
        range.selectNodeContents(linkRef.current);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 2000);
  };

  if (!isOpen) return null;

  // Phones only open the camera on https:// pages.
  const insecureLink = companionUrl?.startsWith('http://') ?? false;

  const capturedCount = FACES.filter((f) => faceStatus[f] === 'accepted').length;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      icon={<Smartphone className="w-5 h-5" />}
      title="Scan with your phone"
      description="Point your phone camera at the code to take sharp, glare-free photos. Nothing to install."
      footer={
        <>
          {onSwitchToWebcam && (
            <BlockButton variant="ghost" size="sm" onClick={onSwitchToWebcam} className="mr-auto">
              Switch back to Desktop Webcam
            </BlockButton>
          )}
          <BlockButton onClick={onClose}>Close</BlockButton>
        </>
      }
    >
      {/* QR Code & State Card */}
      <div className="vx-well flex flex-col items-center justify-center gap-4 p-4">
        {isCreating ? (
          <div role="status" className="flex flex-col items-center justify-center py-12 gap-4">
            <span aria-hidden className="vx-loader">
              <span />
              <span />
              <span />
            </span>
            <span className="text-sm text-muted">Making a secure pairing code…</span>
          </div>
        ) : qrDataUrl ? (
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-qr-paper border-2 border-line shadow-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Companion QR Code" className="w-52 h-52 object-contain [image-rendering:pixelated]" />
            </div>

            {/* Status */}
            {mobileConnected ? (
              <Chip tone="solid" icon={<CheckCircle2 className="w-3.5 h-3.5" aria-hidden />}>
                Phone connected. Keep shooting on your phone.
              </Chip>
            ) : (
              <Chip tone="warn" icon={<Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}>
                Waiting for phone to scan...
              </Chip>
            )}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div aria-hidden data-variant="danger" className="vx-block flex h-10 w-10 items-center justify-center pb-1">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <p className="text-sm text-ink max-w-xs">Couldn’t create a pairing code. {error}</p>
            <BlockButton
              variant="primary"
              size="sm"
              onClick={() => void initSession()}
              icon={<RefreshCw className="w-3.5 h-3.5" aria-hidden />}
            >
              Try again
            </BlockButton>
          </div>
        ) : null}

        {insecureLink && (
          <div role="alert" className="flex items-start gap-2 w-full p-3 bg-warn-soft border-2 border-warn-edge text-sm text-ink text-left">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <span>
              The phone camera won’t open on an <span className="font-mono">http://</span> link. Stop the server and
              start it with <span className="font-mono">npm run dev</span> (HTTPS), then open this page again.
            </span>
          </div>
        )}

        {/* Network IP Selector (if multiple interfaces available) */}
        {availableIps && availableIps.length > 0 && (
          <div className="flex flex-col gap-2 w-full pt-3 border-t-2 border-line-soft">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-bold uppercase tracking-wider">Local network IP</span>
              <span>Same Wi-Fi required</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableIps.map((ip) => {
                const isSelected = Boolean(companionUrl?.includes(ip));
                return (
                  <button
                    key={ip}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (!sessionId) return;
                      const proto = typeof window !== 'undefined' ? window.location.protocol : 'http:';
                      const port = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : ':3000';
                      setCustomUrl(`${proto}//${ip}${port}/companion?session=${sessionId}`);
                    }}
                    className={`h-8 px-3 border-2 text-xs font-mono ${
                      isSelected
                        ? 'bg-leaf text-on-leaf border-line font-bold'
                        : 'bg-panel text-muted border-line-soft hover:text-ink hover:border-line'
                    }`}
                  >
                    {ip}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Session Direct Link */}
        {companionUrl && (
          <div className="flex items-center justify-between gap-2 w-full pl-3 pr-1 py-1 bg-panel border-2 border-line-soft text-xs text-muted font-mono">
            <span ref={linkRef} className="truncate max-w-[280px]">
              {companionUrl}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <span role="status" className="text-xs text-ink font-sans font-bold">
                {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Press Ctrl+C' : ''}
              </span>
              <IconButton variant="ghost" size="sm" label="Copy link" onClick={() => void copyLink(companionUrl)}>
                {copyState === 'copied' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </IconButton>
              <a
                href={companionUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open directly in new tab"
                aria-label="Open directly in new tab"
                className="inline-flex h-8 w-8 items-center justify-center hover:bg-well hover:text-ink"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* 6-Face Progress Strip */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-bold uppercase tracking-wider text-muted">Capture progress</span>
          <span className="font-mono font-bold text-ink">{capturedCount} / 6 faces</span>
        </div>

        <ul className="grid grid-cols-6 gap-2">
          {FACES.map((face) => {
            const status = faceStatus[face];
            const color = CANONICAL_CENTER_COLORS[face];

            return (
              <li
                key={face}
                className={`h-16 border-2 flex flex-col items-center justify-center gap-1 ${
                  status === 'accepted'
                    ? 'bg-leaf-soft border-leaf-edge'
                    : status === 'rejected'
                    ? 'bg-warn-soft border-warn-edge'
                    : status === 'analyzing'
                    ? 'bg-panel border-line'
                    : 'bg-panel border-line-soft'
                }`}
              >
                <span aria-hidden className="w-4 h-4 border-2 border-line" style={{ backgroundColor: stickerColor(color) }} />
                <span className="flex items-center gap-1 text-xs font-mono font-bold text-ink">
                  {face}
                  {status === 'accepted' ? (
                    <CheckCircle2 className="w-3 h-3" aria-label="Read" />
                  ) : status === 'analyzing' ? (
                    <Loader2 className="w-3 h-3 animate-spin" aria-label="Reading" />
                  ) : status === 'rejected' ? (
                    <RotateCcw className="w-3 h-3" aria-label="Retake" />
                  ) : (
                    <span className="sr-only">waiting</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
};
