// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Toast } from '@/components/ui/Toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Toast', () => {
  it('announces itself politely, or as an alert for danger', () => {
    const { rerender } = render(
      <Toast open onDismiss={() => {}} title="Saved" duration={0} />
    );
    expect(screen.getByRole('status').textContent).toContain('Saved');
    rerender(<Toast open onDismiss={() => {}} tone="danger" title="Camera blocked" duration={0} />);
    expect(screen.getByRole('alert').textContent).toContain('Camera blocked');
  });

  it('dismisses itself after the duration', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast open onDismiss={onDismiss} title="Hi" duration={3000} />);
    act(() => vi.advanceTimersByTime(2999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('stays until dismissed when duration is 0', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast open onDismiss={onDismiss} title="Sticky" duration={0} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    render(<Toast open={false} onDismiss={() => {}} title="Hidden" />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
