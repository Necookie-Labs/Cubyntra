// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProgressBlocks, progressBlockStates } from '@/components/ui/ProgressBlocks';

afterEach(cleanup);

describe('progressBlockStates', () => {
  it('fills done blocks and marks the next one current', () => {
    expect(progressBlockStates(4, 2)).toEqual(['filled', 'filled', 'current', 'empty']);
  });

  it('has no current block once everything is done', () => {
    expect(progressBlockStates(3, 3)).toEqual(['filled', 'filled', 'filled']);
  });

  it('accepts an explicit current block', () => {
    expect(progressBlockStates(3, 0, 2)).toEqual(['empty', 'empty', 'current']);
  });

  it('clamps out-of-range counts', () => {
    expect(progressBlockStates(2, 9)).toEqual(['filled', 'filled']);
    expect(progressBlockStates(2, -1)).toEqual(['current', 'empty']);
    expect(progressBlockStates(-3, 1)).toEqual([]);
  });
});

describe('ProgressBlocks', () => {
  it('is announced as a progressbar with the count', () => {
    render(<ProgressBlocks total={6} done={2} label="Faces scanned" />);
    const bar = screen.getByRole('progressbar', { name: 'Faces scanned' });
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
    expect(bar.getAttribute('aria-valuemax')).toBe('6');
    expect(bar.getAttribute('aria-valuetext')).toBe('2 of 6');
    expect(bar.querySelectorAll('[data-state="current"]')).toHaveLength(1);
  });
});
