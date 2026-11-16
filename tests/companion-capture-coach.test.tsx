// @vitest-environment jsdom
/**
 * Cubyntra - First-run photo coach is a proper modal
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CaptureCoach } from '@/components/companion/CaptureCoach';

afterEach(cleanup);

describe('CaptureCoach', () => {
  it('takes focus, keeps Tab inside, skips on Escape and gives focus back', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onDone = vi.fn();
    const { unmount } = render(<CaptureCoach onDone={onDone} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
    // The main button is the last stop; Tab wraps to the first (Skip).
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onDone).toHaveBeenCalledOnce();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
