// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MoveChips, moveChipState } from '@/components/twin/MoveChips';
import { parseAlgorithm } from '@/cube/transforms';
import { moveName } from '@/cube/moveNames';

afterEach(cleanup);

const moves = parseAlgorithm("R U R' U2");

describe('moveChipState', () => {
  it('splits moves into done, current and upcoming', () => {
    expect([0, 1, 2, 3].map((i) => moveChipState(i, 2))).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(moveChipState(3, 4)).toBe('done');
  });
});

describe('MoveChips', () => {
  it('renders one chip per move, named in plain language', () => {
    render(<MoveChips moves={moves} current={0} />);
    const list = screen.getByRole('list', { name: 'Moves' });
    const chips = within(list).getAllByRole('listitem');
    expect(chips.map((c) => c.textContent)).toEqual(['R', 'U', "R'", 'U2']);
    expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual(moves.map(moveName));
    expect(screen.getByLabelText('Turn the right side up')).toBeTruthy();
  });

  it('highlights the current chip and dims the finished ones', () => {
    render(<MoveChips moves={moves} current={2} />);
    const chips = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(chips.map((c) => c.dataset.state)).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(chips[2].getAttribute('aria-current')).toBe('step');
    expect(chips.filter((c) => c.hasAttribute('aria-current'))).toHaveLength(1);
    expect(chips[0].className).toContain('text-muted');
    expect(chips[2].className).toContain('bg-primary');
  });

  it('marks everything done once the algorithm has finished', () => {
    render(<MoveChips moves={moves} current={4} defaultPlainLanguage />);
    const chips = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(chips.every((c) => c.dataset.state === 'done')).toBe(true);
    expect(screen.getByText('All moves done')).toBeTruthy();
  });

  it('spells the current move out in words when the toggle is on', () => {
    render(<MoveChips moves={moves} current={1} />);
    const toggle = screen.getByRole('button', { name: 'In words' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText(moveName(moves[1]))).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(moveName(moves[1]))).toBeTruthy();
  });

  it('can hide the toggle', () => {
    render(<MoveChips moves={moves} current={1} plainLanguageToggle={false} />);
    expect(screen.queryByRole('button', { name: 'In words' })).toBeNull();
  });

  it('makes chips buttons when selectable', () => {
    const onSelect = vi.fn();
    render(<MoveChips moves={moves} current={0} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: moveName(moves[3]) }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });
});
