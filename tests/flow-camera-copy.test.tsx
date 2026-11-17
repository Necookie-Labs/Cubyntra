// @vitest-environment jsdom
/**
 * Cubyntra - Camera errors and scanner labels in plain words (user-flow audit)
 * Necookie Labs (c) 2026
 *
 * A blocked, missing or busy camera tells the student what to do next in words the screen
 * actually shows ("Try again", "demo cube"), and the scan's demo button is labelled on phones.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { formatCameraError } from '@/vision/camera';
import { CameraScanner } from '@/components/camera/CameraScanner';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const JARGON = /mock|initiali[sz]ation|hardware|constraints|device was detected|Unavailable/i;

describe('camera error copy', () => {
  it.each(['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError'])(
    '%s says what to do next, without jargon',
    (name) => {
      const message = formatCameraError(new DOMException('raw', name)).message;
      expect(message).not.toMatch(JARGON);
      expect(message).toMatch(/Try again|another camera|demo cube/);
    }
  );
});

describe('scanner', () => {
  it('shows a blocked camera in sentence case with a labelled demo cube button', async () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => Promise.reject(new DOMException('no', 'NotAllowedError'))) },
    });
    render(<CameraScanner onBack={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'The camera didn’t open' })).toBeTruthy();
    expect(screen.getByText(/The camera is blocked for this page/)).toBeTruthy();
    // The scan's own demo button has visible text, not just an icon (it was hidden on phones).
    const demo = screen.getByRole('button', { name: 'Demo cube' });
    expect(demo.textContent).toContain('Demo cube');
    expect(screen.queryByText(/Use Scramble|No Cube Detected/)).toBeNull();
    expect(screen.getByRole('button', { name: 'No cube in the grid yet' })).toBeTruthy();
    // Both labelled buttons do not fit one 390px row: the row wraps instead of scrolling sideways.
    expect(screen.getByTestId('scan-actions').className).toMatch(/\bflex-wrap\b/);
    expect(screen.getByRole('button', { name: 'No cube in the grid yet' }).className).toMatch(/\bmin-w-0\b/);
  });
});
