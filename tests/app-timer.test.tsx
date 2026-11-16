// @vitest-environment jsdom
/**
 * Cubyntra - Timer screen (mocked twin and clock)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { defaultStudentProfile } from '@/lib/studentProfile';
import type { TimerSolve } from '@/learn/types';

vi.mock('@/components/cube/CubeVisualizer', () => ({
  CubeVisualizer: () => <div data-testid="twin" />,
}));

const { useTutorStore } = await import('@/stores/useTutorStore');
const { TimerView, setFirstScrambleForTests } = await import('@/components/timer/TimerView');

let clock = 0;
const frames: FrameRequestCallback[] = [];
const frame = () =>
  act(() => {
    for (const cb of frames.splice(0)) cb(clock);
  });
const pad = () => screen.getByRole('button', { name: 'Timer pad' });
const at = (ms: number) => {
  clock = ms;
};

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  // Animation frames run only when the test calls frame(), after moving the clock.
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => new Response(String(init?.body ?? '{}'))));
  setFirstScrambleForTests("R U R' U'");
  useTutorStore.setState({ token: 'secret', profile: defaultStudentProfile(), profileStatus: 'ready' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const solve = (seconds: number, penalty: TimerSolve['penalty'] = 'none'): TimerSolve => ({
  ms: seconds * 1000,
  penalty,
  at: '2026-11-17T10:00:00.000Z',
  scramble: 'R',
});

describe('Timer', () => {
  it('shows the scramble as notation and on the twin', () => {
    render(<TimerView />);
    expect(screen.getByLabelText('Scramble moves').textContent).toBe("R U R' U'");
    expect(screen.getByTestId('twin')).toBeTruthy();
  });

  it('inspects, arms on a hold, times the solve and saves it with its scramble', () => {
    render(<TimerView />);
    fireEvent.pointerDown(pad());
    fireEvent.pointerUp(pad());
    expect(pad().getAttribute('data-phase')).toBe('inspecting');
    expect(screen.getByText('Hold to get ready')).toBeTruthy();
    at(9_000);
    fireEvent.pointerDown(pad());
    expect(pad().getAttribute('data-phase')).toBe('holding');
    // A space press (any later event) after the hold time arms it.
    at(9_400);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(pad().getAttribute('data-phase')).toBe('armed');
    expect(screen.getByText('8 seconds')).toBeTruthy();
    fireEvent.pointerUp(pad());
    expect(pad().getAttribute('data-phase')).toBe('running');
    at(21_745);
    fireEvent.pointerDown(pad());
    fireEvent.pointerUp(pad());
    expect(pad().getAttribute('data-phase')).toBe('idle');
    const history = useTutorStore.getState().profile.timer.history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ ms: 12_340, penalty: 'none', scramble: "R U R' U'" });
    expect(screen.getByLabelText('Scramble moves').textContent).not.toBe("R U R' U'");
  });

  it('records a +2 when the solve starts between 15 and 17 seconds, and edits the last solve', () => {
    render(<TimerView />);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    fireEvent.keyUp(window, { code: 'Space', key: ' ' });
    at(12_000);
    frame();
    expect(screen.getByText('12 seconds')).toBeTruthy();
    at(15_200);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    at(15_600);
    frame();
    expect(pad().getAttribute('data-phase')).toBe('armed');
    expect(screen.getByText('Let go to start')).toBeTruthy();
    fireEvent.keyUp(window, { code: 'Space', key: ' ' });
    at(25_600);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    fireEvent.keyUp(window, { code: 'Space', key: ' ' });
    expect(useTutorStore.getState().profile.timer.history[0]).toMatchObject({ ms: 10_000, penalty: '+2' });
    const last = screen.getByRole('group', { name: 'Last solve' });
    expect(within(last).getByText('12.00+')).toBeTruthy();
    fireEvent.click(within(last).getByRole('button', { name: 'DNF' }));
    expect(useTutorStore.getState().profile.timer.history[0].penalty).toBe('DNF');
    fireEvent.click(within(last).getByRole('button', { name: 'DNF' }));
    expect(useTutorStore.getState().profile.timer.history[0].penalty).toBe('none');
    fireEvent.click(within(last).getByRole('button', { name: 'Delete' }));
    expect(useTutorStore.getState().profile.timer.history).toHaveLength(0);
  });

  it('makes the solve a DNF when inspection reaches 17 seconds', () => {
    render(<TimerView />);
    fireEvent.pointerDown(pad());
    fireEvent.pointerUp(pad());
    at(17_000);
    frame();
    expect(pad().getAttribute('data-phase')).toBe('idle');
    expect(useTutorStore.getState().profile.timer.history[0]).toMatchObject({ penalty: 'DNF' });
  });

  it('cancels inspection with Escape', () => {
    render(<TimerView />);
    fireEvent.pointerDown(pad());
    fireEvent.pointerUp(pad());
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(pad().getAttribute('data-phase')).toBe('idle');
    expect(useTutorStore.getState().profile.timer.history).toHaveLength(0);
  });

  it('shows best single, ao5 and ao12 from the saved history', () => {
    const history = [10, 11, 12, 13, 30, 9, 9, 9, 9, 9, 9, 9].map((s) => solve(s));
    useTutorStore.setState({ profile: { ...defaultStudentProfile(), timer: { history } } });
    render(<TimerView />);
    const value = (label: string) => screen.getByText(label).previousElementSibling?.textContent;
    expect(value('Best single')).toBe('9.00');
    expect(value('Current ao5')).toBe('9.00');
    expect(value('Current ao12')).toBe('10.00');
    expect(value('Best ao5')).toBe('9.00');
    expect(screen.getByText('12 saved')).toBeTruthy();
  });
});
