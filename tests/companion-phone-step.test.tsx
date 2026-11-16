// @vitest-environment jsdom
/**
 * Cubyntra - The step on the phone after a scan (move chips, remote playback, solve here)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PhoneStepCard } from '@/components/companion/PhoneStepCard';

afterEach(cleanup);

const step = { method: 'cfop' as const, stepIndex: 3, planId: 'step-x', algorithm: "U R U' R'" };

describe('PhoneStepCard', () => {
  it('shows the method, step and moves, lighting the next move', () => {
    render(<PhoneStepCard step={step} playback={{ playing: false, index: 0, speed: 1 }} onControl={vi.fn()} />);
    expect(screen.getByText('CFOP')).toBeTruthy();
    expect(screen.getByText('Step 4')).toBeTruthy();
    const chips = within(screen.getByRole('list', { name: 'Moves' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['U', 'R', "U'", "R'"]);
    expect(chips[1].getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('status').textContent).toMatch(/^Next: /);
    expect(screen.getByRole('link', { name: 'Solve on this phone' }).getAttribute('href')).toBe('/solve');
  });

  it('drives the laptop twin with play, pause and seeks in wire positions', () => {
    const onControl = vi.fn();
    const { rerender } = render(<PhoneStepCard step={step} playback={{ playing: false, index: -1, speed: 1 }} onControl={onControl} />);
    expect((screen.getByRole('button', { name: 'Previous move' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onControl).toHaveBeenLastCalledWith({ action: 'play' });
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }));
    expect(onControl).toHaveBeenLastCalledWith({ action: 'seek', index: 0 });
    fireEvent.click(within(screen.getByRole('list', { name: 'Moves' })).getAllByRole('button')[2]);
    expect(onControl).toHaveBeenLastCalledWith({ action: 'seek', index: 1 });

    rerender(<PhoneStepCard step={step} playback={{ playing: true, index: 1, speed: 1 }} onControl={onControl} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onControl).toHaveBeenLastCalledWith({ action: 'pause' });

    rerender(<PhoneStepCard step={step} playback={{ playing: false, index: 3, speed: 1 }} onControl={onControl} />);
    expect(screen.getByRole('status').textContent).toMatch(/All moves done/);
    expect((screen.getByRole('button', { name: 'Next move' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
