// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BlockButton } from '@/components/ui/BlockButton';

afterEach(cleanup);

describe('BlockButton', () => {
  it('is a plain button with the secondary variant by default', () => {
    render(<BlockButton>Scan</BlockButton>);
    const button = screen.getByRole('button', { name: 'Scan' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.dataset.variant).toBe('secondary');
    expect(button.className).toContain('vx-block');
  });

  it('carries the variant for the block styles', () => {
    render(<BlockButton variant="danger">Delete</BlockButton>);
    expect(screen.getByRole('button', { name: 'Delete' }).dataset.variant).toBe('danger');
  });

  it('does not fire clicks while disabled', () => {
    const onClick = vi.fn();
    render(
      <BlockButton disabled onClick={onClick}>
        Next
      </BlockButton>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
