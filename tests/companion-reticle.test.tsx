// @vitest-environment jsdom
/**
 * Cubyntra - Phone reticle: letters on stickers when the setting is on
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CompanionReticle } from '@/components/companion/CompanionReticle';

afterEach(cleanup);

describe('CompanionReticle', () => {
  const live = ['red', null, 'blue', null, null, null, null, null, 'yellow'] as const;

  it('puts the color letter on the center and on every live tile when letters are on', () => {
    const { container } = render(<CompanionReticle tone="idle" expectedColor="green" liveColors={[...live]} letters />);
    expect(container.textContent).toBe('RBGY');
  });

  it('shows swatches only when letters are off', () => {
    const { container } = render(<CompanionReticle tone="idle" expectedColor="green" liveColors={[...live]} />);
    expect(container.textContent).toBe('');
  });
});
