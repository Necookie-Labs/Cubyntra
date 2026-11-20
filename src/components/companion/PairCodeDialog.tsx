'use client';

/**
 * Cubyntra - Type-a-code pairing on the phone
 * Necookie Labs (c) 2026
 *
 * For when the QR code cannot be scanned: the student types the six characters shown on the
 * computer and the phone trades them for the pairing (`POST /api/session/pair`).
 */

import React, { useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { BlockButton, Dialog } from '@/components/ui';
import { PairingCredentials, isPairingCredentials } from '@/sync/pairingLink';
import { PAIRING_CODE_LENGTH, isPairingCode, normalizePairingCode } from '@/sync/pairingCode';

interface PairCodeDialogProps {
  open: boolean;
  onClose: () => void;
  onPaired: (creds: PairingCredentials) => void;
}

export const PairCodeDialog: React.FC<PairCodeDialogProps> = ({ open, onClose, onPaired }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const code = normalizePairingCode(value);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPairingCode(code) || busy) {
      setError(`The code is ${PAIRING_CODE_LENGTH} letters and numbers, like ABC-234.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/session/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      const creds = { sessionId: data.sessionId, secret: data.secret, token: data.token };
      if (res.ok && isPairingCredentials(creds)) {
        setValue('');
        onPaired(creds);
        return;
      }
      setError(
        res.status === 429
          ? 'Too many tries. Wait a minute, then try again.'
          : data.error || 'That code did not work. Check the code on your computer.'
      );
    } catch {
      setError('Could not reach your computer. Check that both are on the same Wi-Fi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      icon={<Link2 className="w-5 h-5" />}
      title="Link to your computer"
      description="Type the code shown under the QR code on your computer."
      initialFocusRef={inputRef}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="pair-code" className="text-xs font-bold uppercase tracking-wider text-muted">
          Pairing code
        </label>
        <input
          id="pair-code"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          maxLength={9}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'pair-code-error' : undefined}
          className="h-12 rounded-md px-3 border-2 border-line bg-well text-ink font-mono text-2xl tracking-widest uppercase"
        />
        {error && (
          <p id="pair-code-error" role="alert" className="rounded-md text-sm text-ink bg-warn-soft border-2 border-warn-edge p-3">
            {error}
          </p>
        )}
        <BlockButton type="submit" variant="primary" disabled={busy}>
          {busy ? 'Linking…' : 'Link'}
        </BlockButton>
      </form>
    </Dialog>
  );
};
