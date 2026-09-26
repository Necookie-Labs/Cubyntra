'use client';

/**
 * Cubyntra - Mobile Companion QR Pairing Modal
 * Necookie Labs (c) 2026
 */

import React, { useEffect } from 'react';
import { useCompanionSync } from '@/sync/useCompanionSync';
import { FACES, COLOR_HEX, CANONICAL_CENTER_COLORS, FACE_NAMES } from '@/cube/constants';
import { Smartphone, QrCode, CheckCircle2, Copy, ExternalLink, X, RefreshCw, Sparkles } from 'lucide-react';

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
    capturedFaces,
    initSession,
    disconnect,
  } = useCompanionSync(false);

  useEffect(() => {
    if (isOpen) {
      initSession();
    } else {
      disconnect();
    }
  }, [isOpen, initSession, disconnect]);

  if (!isOpen) return null;

  const capturedCount = Object.keys(capturedFaces).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#111318] border border-neutral-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-5 text-neutral-100 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Subtle accent glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Mobile Companion Scanner
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Zero Install
                </span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Scan the QR code with your phone camera to capture sharp, glare-free photos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code & State Card */}
        <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-[#0a0b0e] border border-neutral-800/80 gap-3">
          {isCreating ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
              <span className="text-xs font-mono text-neutral-400">Generating secure pairing session...</span>
            </div>
          ) : qrDataUrl ? (
            <div className="relative group flex flex-col items-center">
              <div className="p-3 bg-white rounded-2xl shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="Companion QR Code"
                  className="w-52 h-52 rounded-lg object-contain"
                />
              </div>

              {/* Status Overlay Badge */}
              <div className="mt-3 flex items-center justify-center gap-2">
                {mobileConnected ? (
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-xs font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Phone Connected! Scanning in progress...
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-300 text-xs font-mono">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    Waiting for phone to scan...
                  </div>
                )}
              </div>
            </div>
          ) : error ? (
            <div className="text-xs text-rose-400 py-6 font-mono text-center">
              Error initializing session: {error}
            </div>
          ) : null}

          {/* Network IP Selector (if multiple interfaces available) */}
          {availableIps && availableIps.length > 0 && (
            <div className="flex flex-col gap-1.5 w-full pt-2 border-t border-neutral-800/60">
              <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                <span>LOCAL NETWORK IP:</span>
                <span className="text-neutral-500">Same Wi-Fi required</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableIps.map((ip) => {
                  const isSelected = companionUrl?.includes(ip);
                  return (
                    <button
                      key={ip}
                      type="button"
                      onClick={() => {
                        if (!sessionId) return;
                        const proto = typeof window !== 'undefined' ? window.location.protocol : 'http:';
                        const port = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : ':3000';
                        setCustomUrl(`${proto}//${ip}${port}/companion?session=${sessionId}`);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all ${
                        isSelected
                          ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 font-bold shadow-sm'
                          : 'bg-neutral-900/80 text-neutral-400 border-neutral-800 hover:text-white'
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
            <div className="flex items-center justify-between gap-2 w-full px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-neutral-400 font-mono">
              <span className="truncate max-w-[280px]">{companionUrl}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(companionUrl)}
                  title="Copy URL"
                  className="p-1 hover:text-white transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <a
                  href={companionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open directly in new tab"
                  className="p-1 hover:text-sky-400 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* 6-Face Progress Strip */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
            <span>CAPTURE PROGRESS</span>
            <span className="text-white font-bold">{capturedCount} / 6 FACES</span>
          </div>

          <div className="grid grid-cols-6 gap-2">
            {FACES.map((face) => {
              const isCaptured = capturedFaces[face] !== undefined;
              const color = CANONICAL_CENTER_COLORS[face];
              const hex = COLOR_HEX[color];

              return (
                <div
                  key={face}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                    isCaptured
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400'
                      : 'bg-neutral-900/60 border-neutral-800 text-neutral-500'
                  }`}
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full border border-black/30 shadow-sm"
                    style={{ backgroundColor: hex }}
                  />
                  <span className="text-[11px] font-mono font-bold">{face}</span>
                  {isCaptured ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <span className="text-[9px] text-neutral-600 font-mono">WAIT</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
          {onSwitchToWebcam ? (
            <button
              type="button"
              onClick={onSwitchToWebcam}
              className="text-xs text-neutral-400 hover:text-white transition-colors underline underline-offset-4"
            >
              Switch back to Desktop Webcam
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
