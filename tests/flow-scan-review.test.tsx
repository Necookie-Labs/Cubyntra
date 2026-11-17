// @vitest-environment jsdom
/**
 * Cubyntra - Scan review: Start over asks first (user-flow audit)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createSolvedCubeState } from '@/cube/constants';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { ScanReview } from '@/components/review/ScanReview';

afterEach(cleanup);

describe('scan review', () => {
  it('asks before throwing away all six faces', () => {
    useCubyntraStore.setState({
      cubeState: createSolvedCubeState(),
      resolution: null,
      validationResult: { valid: true, issues: [] } as never,
      pendingFaces: {},
    });
    const onStartOver = vi.fn();
    render(<ScanReview onRescanFace={() => {}} onConfirmed={() => {}} onStartOver={onStartOver} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    const dialog = screen.getByRole('dialog', { name: 'Scan all six faces again?' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep this scan' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep this scan' }));
    expect(onStartOver).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Start over' }));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });
});
