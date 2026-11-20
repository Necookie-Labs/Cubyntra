/**
 * Cubyntra - Panel
 * Necookie Labs (c) 2026
 *
 * A content card: a rounded face that floats on a soft tinted shadow. `well` is the sunken
 * variant for content inside a card.
 */

import React from 'react';
import { cx } from './cx';

export type PanelTone = 'panel' | 'well';

export interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'aside' | 'article' | 'header' | 'footer' | 'ul';
  tone?: PanelTone;
  /** Inner padding; false for none. */
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
    className={cx(tone === 'panel' ? 'vx-panel' : 'vx-well', padded && (tone === 'panel' ? 'p-5' : 'p-3'), className)}
    {...rest}
  >
    {children}
  </Tag>
);
