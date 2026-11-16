/**
 * Cubyntra - Beginner's Method: Twisting the Yellow Corners
 * Necookie Labs (c) 2026
 *
 * The last stage of the beginner's method, and the detector for a cube that is part-way through
 * it. The corner at the front-right of the top is twisted with rounds of R' D' R D; between
 * corners only the top layer is turned.
 */

import { CubeState, Face } from '../../cube/types';
import { createSolvedCubeState } from '../../cube/constants';
import { centerColors, findRotation } from '../../cube/orientation';
import { findCorner } from '../../cube/pieces';
import { applyMoves, isCubeSolved } from '../../cube/transforms';
import {
  LAST,
  alg,
  cornerRef,
  faceOfColor,
  faceTurns,
  lastCornersInPlace,
  lastLayerCornerRefs,
  lastLayerEdgeRefs,
  layerCorners,
  repeatMoves,
  rotations,
  solvedLastEdges,
} from '../helpers';
import { StepDraft, TutorPlanError } from '../types';

/** One round: swaps and twists the front-right corners of the top and bottom layers. */
export const CORNER_TRIGGER = "R' D' R D";

/**
 * While this stage is under way the two lower layers look scrambled: each pair of R' D' R D
 * rounds twists the front-right top corner and shuffles pieces below, and the shuffle only
 * undoes itself once every corner is done. The lower layers can therefore be in exactly three
 * states: solved, or the shuffle left by a net 2 or 4 rounds.
 */
const LOWER_STICKERS: readonly { face: Face; index: number }[] = [
  ...(['F', 'R', 'B', 'L'] as const).flatMap((face) => [3, 4, 5, 6, 7, 8].map((index) => ({ face, index }))),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => ({ face: 'D' as Face, index })),
];

let shuffles: Face[][] | null = null;

/** For 0, 2 and 4 rounds: the face whose center color each lower sticker shows. */
function lowerShuffles(): Face[][] {
  if (!shuffles) {
    // Any solved cube works as the reference: sticker colors are read back as faces.
    const reference = createSolvedCubeState();
    shuffles = [0, 2, 4].map((rounds) => {
      const after = applyMoves(reference, repeatMoves(alg(CORNER_TRIGGER), rounds));
      return LOWER_STICKERS.map((s) => faceOfColor(reference, after[s.face][s.index]));
    });
  }
  return shuffles;
}

export interface OrientStage {
  /** Quarter turns of `y` from the yellow-on-top view to the grip the stage is being done in. */
  turns: number;
  /** True when the two lower layers are solved (no rounds owed). */
  lowerSolved: boolean;
}

const orientCache = new WeakMap<CubeState, OrientStage | null>();

/**
 * Recognises a cube that is in the last stage: the lower layers are solved or in one of the two
 * shuffles, and after some turn of the top every yellow edge is solved and every yellow corner
 * is in its place. Returns null for any other cube.
 */
export function orientStage(state: CubeState): OrientStage | null {
  if (orientCache.has(state)) return orientCache.get(state)!;
  let result: OrientStage | null = null;
  const yellowFace = faceOfColor(state, LAST);
  if ([1, 3, 5, 7].every((i) => state[yellowFace][i] === LAST)) {
    const rotation = findRotation(centerColors(state), { U: LAST }) ?? [];
    const top = rotation.length ? applyMoves(state, rotation) : state;
    search: for (let turns = 0; turns < 4; turns++) {
      const v = applyMoves(top, rotations('y', turns));
      for (const [k, shuffle] of lowerShuffles().entries()) {
        if (k === 0 && turns > 0) continue; // solved lower layers look the same from every side
        if (!LOWER_STICKERS.every((s, i) => v[s.face][s.index] === v[shuffle[i]][4])) continue;
        const lines = [0, 1, 2, 3].some((quarters) => {
          const turned = applyMoves(v, faceTurns('U', quarters));
          return solvedLastEdges(turned) === 4 && lastCornersInPlace(turned) === 4;
        });
        if (lines) result = { turns, lowerSolved: k === 0 };
        break search;
      }
    }
  }
  orientCache.set(state, result);
  return result;
}

export const yellowCornersUp = (view: CubeState) => [0, 2, 6, 8].filter((i) => view.U[i] === LAST).length;

export function planOrientCorners(view: CubeState): StepDraft {
  const stage = orientStage(view);
  if (!stage) throw new TutorPlanError('Cube is not ready for the last stage');
  const hold = rotations('y', stage.turns);
  const v = applyMoves(view, hold);
  const unit = alg(CORNER_TRIGGER);

  if (yellowCornersUp(v) === 4) {
    const quarters = [1, 2, 3].find((q) => isCubeSolved(applyMoves(v, faceTurns('U', q))));
    if (!quarters) throw new TutorPlanError('Top layer cannot be turned into place');
    return {
      caseId: 'yellow-corners-align',
      caseName: 'Line up the top',
      setupMoves: hold,
      algorithm: faceTurns('U', quarters),
      highlightPieces: [...lastLayerCornerRefs(), ...lastLayerEdgeRefs()],
      facts: {
        goal: 'Turn the top layer until every side is one color.',
        lookFor: 'The whole top is yellow and the rest of the cube is solved. Only the top layer is a turn away.',
        why: 'Turning the top between corners moved it away from the sides; one last turn brings it back.',
      },
    };
  }

  // Turn only the top to bring the next twisted corner to the front-right: nearest first.
  for (const quarters of [0, 1, 3, 2]) {
    const setup = [...hold, ...faceTurns('U', quarters)];
    const ready = applyMoves(view, setup);
    if (ready.U[8] === LAST) continue;
    const corner = layerCorners(LAST).find((c) => findCorner(ready, c).slot === 'UFR')!;
    for (const times of [2, 4]) {
      if (applyMoves(ready, repeatMoves(unit, times)).U[8] !== LAST) continue;
      return {
        caseId: `yellow-corner-twist-${times}`,
        caseName: times === 2 ? 'Twist a corner (2 rounds)' : 'Twist a corner (4 rounds)',
        setupMoves: setup,
        algorithm: repeatMoves(unit, times),
        highlightPieces: [cornerRef(corner[0], corner[1], corner[2])],
        targetSlot: cornerRef(corner[0], corner[1], corner[2]),
        facts: {
          goal: 'Twist the front-right top corner until its yellow sticker faces up.',
          lookFor: stage.lowerSolved
            ? 'Find a top corner whose yellow sticker is not facing up. Turn only the top to bring it to the front-right.'
            : 'The lower layers look scrambled, and that is expected. Do not turn the cube around: turn only the top to bring the next corner without yellow on top to the front-right.',
          why: 'Two rounds twist the corner one way and four rounds the other. The lower layers look mixed up in between and fix themselves when the last corner is done.',
          repeat: { unit: [...unit], times },
        },
      };
    }
  }
  throw new TutorPlanError('No yellow corner can be twisted');
}
