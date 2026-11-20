// @vitest-environment jsdom
/**
 * Cubyntra - Trainer screen (mocked twin and camera)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { defaultStudentProfile } from '@/lib/studentProfile';
import { trainerSet } from '@/learn/trainerSets';

vi.mock('@/components/twin/TeachingTwin', () => ({
  TeachingTwin: (props: { plan: { caseId: string } | null; movesHidden?: boolean }) => (
    <section aria-label="Teaching twin" data-case={props.plan?.caseId} data-moves-hidden={String(props.movesHidden)} />
  ),
}));

const { useTutorStore } = await import('@/stores/useTutorStore');
const { TrainerView } = await import('@/components/trainer/TrainerView');

const twinCase = () => screen.getByRole('region', { name: 'Teaching twin' }).getAttribute('data-case');

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => new Response(String(init?.body ?? '{}')))
  );
  useTutorStore.setState({ token: 'secret', profile: defaultStudentProfile(), profileStatus: 'ready' });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Trainer', () => {
  it('opens on the first beginner case with its name and algorithm hidden', () => {
    render(<TrainerView />);
    expect(screen.getByRole('heading', { level: 1, name: 'Trainer' })).toBeTruthy();
    const first = trainerSet('beginner').cases[0];
    expect(twinCase()).toBe(first.id);
    expect(screen.getByRole('heading', { name: 'Which case is this?' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Teaching twin' }).getAttribute('data-moves-hidden')).toBe('true');
    expect(screen.getByLabelText('Setup moves').textContent).toBe("D' R' D R");
    expect(screen.queryByLabelText('Algorithm')).toBeNull();
  });

  it('reveals the name, the recognition and the algorithm on request', () => {
    render(<TrainerView />);
    const first = trainerSet('beginner').cases[0];
    fireEvent.click(screen.getByRole('button', { name: 'Show the name' }));
    expect(screen.getByRole('heading', { name: first.name })).toBeTruthy();
    expect(screen.getByText(first.recognition)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show the algorithm' }));
    expect(screen.getByLabelText('Algorithm').textContent).toBe(first.algorithm);
    expect(screen.getByRole('region', { name: 'Teaching twin' }).getAttribute('data-moves-hidden')).toBe('false');
  });

  it('records Got it and Missed it, moves on, and brings the missed case back', () => {
    render(<TrainerView />);
    const ids = trainerSet('beginner').cases.map((c) => c.id);
    fireEvent.click(screen.getByRole('button', { name: 'Missed it' }));
    expect(useTutorStore.getState().profile.trainer.cards[ids[0]]).toMatchObject({ box: 1, missed: 1 });
    expect(twinCase()).toBe(ids[1]);
    expect(screen.getByRole('heading', { name: 'Which case is this?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(twinCase()).toBe(ids[0]);
    expect(screen.getByText('This session: 1 got, 1 missed')).toBeTruthy();
  });

  it('switches sets, saves the choice and filters by group', () => {
    render(<TrainerView />);
    const picker = screen.getByRole('radiogroup', { name: 'Algorithm set' });
    fireEvent.click(within(picker).getByRole('radio', { name: /Full PLL/ }));
    expect(useTutorStore.getState().profile.trainer.set).toBe('pll');
    expect(twinCase()).toBe('pll-aa');
    const filter = screen.getByRole('group', { name: 'Filter by group' });
    fireEvent.click(within(filter).getByRole('button', { name: 'G perms' }));
    expect(twinCase()).toBe('pll-ga');
    expect(within(screen.getByRole('list', { name: 'Cases in Full PLL' })).getAllByRole('button')).toHaveLength(4);
  });

  it('drills a case picked from the grid', () => {
    render(<TrainerView />);
    const grid = screen.getByRole('list', { name: "Cases in Beginner's algorithms" });
    fireEvent.click(within(grid).getByRole('button', { name: /Twist a yellow corner/ }));
    expect(twinCase()).toBe('yellow-corner-twist-2');
  });

  it('checks a drill with the camera sheet and counts a match as got it', async () => {
    vi.useFakeTimers();
    try {
      render(<TrainerView />);
      fireEvent.click(screen.getByRole('button', { name: 'Check with the camera' }));
      const dialog = screen.getByRole('dialog', { name: 'Show me your cube' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'It matches' }));
      expect(screen.getByRole('dialog', { name: 'Case solved' })).toBeTruthy();
      await act(async () => {
        vi.advanceTimersByTime(2_000);
      });
      const first = trainerSet('beginner').cases[0].id;
      expect(useTutorStore.getState().profile.trainer.cards[first]).toMatchObject({ box: 2, seen: 1 });
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the coach on request', () => {
    render(<TrainerView />);
    expect(screen.queryByRole('heading', { name: 'Coach' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show the coach' }));
    expect(screen.getByRole('heading', { name: 'Coach' })).toBeTruthy();
  });
});
