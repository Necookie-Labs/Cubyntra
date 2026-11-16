/**
 * Cubyntra - Method Descriptions for the UI
 * Necookie Labs (c) 2026
 *
 * What the home screen and the solve header say about each method. Stage names mirror the
 * tutor engine's (tests/app-method-info.test.ts keeps them in step) so the UI does not have to
 * load the whole engine to draw a progress bar.
 */

import type { MethodId } from '@/tutor/types';

export interface MethodInfo {
  id: MethodId;
  name: string;
  summary: string;
  detail: string;
  stages: readonly { id: string; name: string }[];
}

export const METHOD_INFO: Readonly<Record<MethodId, MethodInfo>> = {
  beginner: {
    id: 'beginner',
    name: "Beginner's method",
    summary: 'Layer by layer, with a few short moves to remember.',
    detail: 'The best first method. Each step is small and the twin shows every turn.',
    stages: [
      { id: 'daisy', name: 'Daisy' },
      { id: 'white-cross', name: 'White cross' },
      { id: 'white-corners', name: 'White corners' },
      { id: 'middle-edges', name: 'Middle layer' },
      { id: 'yellow-cross', name: 'Yellow cross' },
      { id: 'yellow-edges', name: 'Yellow edges' },
      { id: 'yellow-corners-position', name: 'Place the yellow corners' },
      { id: 'yellow-corners-orient', name: 'Twist the yellow corners' },
    ],
  },
  cfop: {
    id: 'cfop',
    name: 'CFOP',
    summary: 'What speedcubers use: cross, four pairs, then the last layer.',
    detail: 'More to learn and fewer moves. Good once the beginner’s method feels easy.',
    stages: [
      { id: 'cross', name: 'White cross' },
      { id: 'f2l', name: 'First two layers' },
      { id: 'oll-edges', name: 'Yellow cross' },
      { id: 'oll-corners', name: 'Yellow top' },
      { id: 'pll-corners', name: 'Top corners' },
      { id: 'pll-edges', name: 'Top edges' },
      { id: 'auf', name: 'Final turn' },
    ],
  },
};

export const METHOD_IDS: readonly MethodId[] = ['beginner', 'cfop'];

/** Names of CFOP's one-look last-layer stages, used when the full last layer is switched on. */
export const FULL_LAST_LAYER_STAGES: readonly { id: string; name: string }[] = [
  { id: 'oll', name: 'Yellow top in one look' },
  { id: 'pll', name: 'Top layer in one look' },
];

/**
 * The stages a method runs through with the given last-layer setting, in the tutor engine's
 * order, so stage indices from plans and progress line up with these names.
 */
export function methodStages(
  method: MethodId,
  lastLayer: '2-look' | 'full' | undefined = '2-look'
): readonly { id: string; name: string }[] {
  const stages = METHOD_INFO[method].stages;
  if (method !== 'cfop' || lastLayer !== 'full') return stages;
  const byId = (id: string) => stages.find((s) => s.id === id)!;
  return [byId('cross'), byId('f2l'), ...FULL_LAST_LAYER_STAGES, byId('auf')];
}
