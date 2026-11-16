// @vitest-environment jsdom
/**
 * Cubyntra - Phone tap targets of the small controls
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BlockButton, IconButton, StickerGrid, Switch } from '@/components/ui';
import { MoveChips } from '@/components/twin/MoveChips';
import { CaseTiles } from '@/components/learn/CaseTiles';
import { CameraHelp } from '@/components/camera/CameraHelp';
import { parseAlgorithm } from '@/cube/transforms';
import { meetsTapTarget, smallTapTargets } from './helpers/tapTargets';

afterEach(cleanup);

describe('phone tap targets', () => {
  it('globals.css grows block controls and .vx-hit to 44px below the lg breakpoint', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');
    const media = css.slice(css.indexOf('@media (max-width: 1023.98px), (pointer: coarse)'));
    expect(media).toMatch(/:is\(button, a\)\.vx-block::after,\s*\.vx-hit::after\s*\{[^}]*width: max\(100%, 44px\);[^}]*height: max\(100%, 44px\);/);
  });

  it('every small control in the kit meets 44px on a phone', () => {
    render(
      <div>
        <BlockButton size="sm">Small</BlockButton>
        <IconButton label="Close" size="sm">
          <span />
        </IconButton>
        <Switch checked={false} onChange={() => {}} label="Letters" />
        <StickerGrid tiles={Array(9).fill('red')} label="Front" onTileClick={() => {}} />
        <MoveChips moves={parseAlgorithm("R U R'")} current={0} onSelect={() => {}} />
        <CaseTiles cases={[{ id: 'a', name: 'A' }]} cards={{}} label="Cases" onSelect={() => {}} />
        <CameraHelp />
      </div>
    );
    expect(smallTapTargets()).toEqual([]);
  });

  it('flags a control that is too small', () => {
    const { container } = render(<button className="h-8 w-8">x</button>);
    expect(meetsTapTarget(container.querySelector('button')!)).toBe(false);
    expect(smallTapTargets()).toHaveLength(1);
  });
});
