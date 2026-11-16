// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { IconButton } from '@/components/ui/IconButton';

afterEach(cleanup);

describe('IconButton', () => {
  it('uses the label as its accessible name and tooltip', () => {
    render(
      <IconButton label="Reset view">
        <svg />
      </IconButton>
    );
    const button = screen.getByRole('button', { name: 'Reset view' });
    expect(button.getAttribute('title')).toBe('Reset view');
  });

  it('hides the icon itself from assistive technology', () => {
    render(
      <IconButton label="Close">
        <svg data-testid="icon" />
      </IconButton>
    );
    expect(screen.getByTestId('icon').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });

  it('refuses to render without a label', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <IconButton label="  ">
          <svg />
        </IconButton>
      )
    ).toThrow(/label/);
    quiet.mockRestore();
  });
});
