/**
 * Cubyntra - Panel
 * Necookie Labs (c) 2026
 *
 * A large block: cream face, 2px outline, thick bottom edge and a hard 4px shadow.
 * `well` is the sunken variant for content inside a panel.
 */

import React from 'react';
import { cx } from './cx';

export type PanelTone = 'panel' | 'well';

export interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'aside' | 'article' | 'header' | 'footer' | 'ul';
  tone?: PanelTone;
  /** Inner padding on the 8px grid; false for none. */
  padded?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  as: Tag = 'div',
  tone = 'panel',
  padded = true,
  className,
  children,
  ...rest
}) => (
  <Tag
    className={cx(tone === 'panel' ? 'vx-panel' : 'vx-well', padded && (tone === 'panel' ? 'p-4 pb-5' : 'p-3'), className)}
    {...rest}
  >
    {children}
  </Tag>
);
