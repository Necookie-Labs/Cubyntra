// @vitest-environment jsdom
/**
 * Cubyntra - Switch, SegmentedControl and StickerGrid
 * Necookie Labs (c) 2026
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SegmentedControl, StickerGrid, Switch, stickerLetter } from '@/components/ui';

afterEach(cleanup);

describe('Switch', () => {
  it('is a labelled, described switch that toggles', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Sticker letters" hint="Adds W Y R O B G" />);
    const control = screen.getByRole('switch', { name: 'Sticker letters' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(control.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles when its label words are clicked', () => {
    const onChange = vi.fn();
    render(<Switch checked onChange={onChange} label="Reduce motion" />);
    fireEvent.click(screen.getByText('Reduce motion'));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ] as const;

  it('is a radiogroup with one checked option and one tab stop', () => {
    render(<SegmentedControl label="Theme" value="dark" options={options} onChange={() => {}} />);
    const radios = screen.getAllByRole('radio');
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('moves the choice with the arrow keys, wrapping round', () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Theme" value="system" options={options} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('light');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('dark');
  });
});

describe('StickerGrid', () => {
  const tiles = ['white', 'yellow', 'red', 'orange', 'blue', 'green', 'white', null, 'red'] as const;

  it('names every tile and shows letters only when asked', () => {
    const { rerender } = render(<StickerGrid tiles={tiles} label="Front face" />);
    expect(screen.getAllByRole('img')).toHaveLength(9);
    expect(screen.getByRole('img', { name: 'row 3 column 2: not read' })).toBeTruthy();
    expect(screen.queryByText('W')).toBeNull();
    rerender(<StickerGrid tiles={tiles} label="Front face" letters />);
    expect(screen.getAllByText('W')).toHaveLength(2);
    expect(stickerLetter('orange')).toBe('O');
    // Light letters on red and blue, dark ones elsewhere, for 4.5:1 on every sticker.
    expect(screen.getAllByText('R')[0].className).toContain('text-sticker-white');
    expect(screen.getByText('B').className).toContain('text-sticker-white');
    expect(screen.getByText('G').className).toContain('text-sticker-core');
  });

  it('makes tiles buttons when they can be corrected', () => {
    const onTileClick = vi.fn();
    render(<StickerGrid tiles={tiles} label="Front face" marked={[2]} onTileClick={onTileClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'row 1 column 3: red, needs a look' }));
    expect(onTileClick).toHaveBeenCalledWith(2);
  });
});
