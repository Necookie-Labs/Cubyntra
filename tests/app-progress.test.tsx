// @vitest-environment jsdom
/**
 * Cubyntra - Progress screen: the voxel world, streak and algorithm collection
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { defaultStudentProfile, type StudentProfile } from '@/lib/studentProfile';
import { localDay, recentDays } from '@/learn/mastery';
import { useTutorStore } from '@/stores/useTutorStore';
import { ProgressView } from '@/components/progress/ProgressView';

function withProgress(): StudentProfile {
  const base = defaultStudentProfile();
  const today = localDay(new Date());
  return {
    ...base,
    stats: {
      ...base.stats,
      stages: {
        'beginner/daisy': [0, 0, 1],
        'beginner/white-cross': [3, 0],
        'cfop/cross': [0, 2, 2, 3],
      },
      activeDays: recentDays(today, 3),
    },
    trainer: {
      turn: 3,
      set: 'oll',
      cards: { 'oll-01': { box: 3, due: 9, seen: 2, missed: 0 }, 'pll-aa': { box: 1, due: 4, seen: 1, missed: 1 } },
    },
  };
}

beforeEach(() => {
  useTutorStore.setState({ token: null, profile: defaultStudentProfile(), profileStatus: 'ready' });
});
afterEach(cleanup);

describe('Progress', () => {
  it('places a block for each mastered stage on its method island', () => {
    useTutorStore.setState({ profile: withProgress() });
    const { container } = render(<ProgressView />);
    expect(screen.getByRole('heading', { level: 1, name: 'Progress' })).toBeTruthy();
    expect(screen.getByRole('img', { name: "Beginner's method: 1 of 8 stages mastered" })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'CFOP: 1 of 7 stages mastered' })).toBeTruthy();
    expect(container.querySelectorAll('[data-status="mastered"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-status="started"]')).toHaveLength(1);
    expect(screen.getByText('2/15')).toBeTruthy();

    const beginner = within(screen.getByRole('list', { name: "Beginner's method stages" }));
    expect(beginner.getByText('Daisy').parentElement?.textContent).toMatch(/Mastered/);
    expect(beginner.getByText('White cross').parentElement?.textContent).toMatch(/Practising 1\/3/);
    expect(beginner.getByText('White corners').parentElement?.textContent).toMatch(/Not started/);
  });

  it('adds the one-look stages to the CFOP island with the full last layer', () => {
    const profile = withProgress();
    profile.settings.lastLayer = 'full';
    useTutorStore.setState({ profile });
    render(<ProgressView />);
    expect(screen.getByRole('img', { name: 'CFOP: 1 of 9 stages mastered' })).toBeTruthy();
    expect(screen.getByText('Top layer in one look')).toBeTruthy();
  });

  it('shows the streak and the last four weeks', () => {
    useTutorStore.setState({ profile: withProgress() });
    render(<ProgressView />);
    expect(screen.getByText('3 days')).toBeTruthy();
    const calendar = screen.getByRole('list', { name: 'The last four weeks' });
    expect(within(calendar).getAllByRole('img')).toHaveLength(28);
    expect(within(calendar).getAllByRole('img', { name: /: practised/ })).toHaveLength(3);
  });

  it('lists the algorithm collection from the trainer', () => {
    useTutorStore.setState({ profile: withProgress() });
    render(<ProgressView />);
    expect(screen.getByText(/1 of 142 cases learned/)).toBeTruthy();
    const oll = screen.getByRole('list', { name: 'Full OLL cases' });
    expect(within(oll).getAllByRole('img')).toHaveLength(57);
    expect(within(oll).getByRole('img', { name: 'OLL 1 (Runway): learned' })).toBeTruthy();
  });

  it('starts empty for a new student', () => {
    render(<ProgressView />);
    expect(screen.getByText('0/15')).toBeTruthy();
    expect(screen.getByText('0 days')).toBeTruthy();
  });
});
