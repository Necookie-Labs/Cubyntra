/**
 * Cubyntra - CFOP Method (2-look last layer)
 * Necookie Labs (c) 2026
 *
 * White stays on the bottom from start to finish. Stages: cross (shortest solution by search),
 * F2L (one pair per step, from the 41-case table), 2-look OLL (yellow cross, then yellow
 * corners), 2-look PLL (corners, then edges) and a last turn of the top.
 *
 * Cases are recognised by construction, never by hand-written patterns: the F2L index is built
 * by undoing each table algorithm on a solved cube, and last-layer cases are found by trying
 * each table algorithm on a copy and keeping the one that reaches the stage goal.
 */

import { CubeColor, CubeState, Move } from '../../cube/types';
import { createSolvedCubeState } from '../../cube/constants';
import {
  F2LSlot,
  findCorner,
  findEdge,
  isCrossSolved,
  isF2LSlotSolved,
  isLayerSolved,
  isMiddleLayerSolved,
  isPieceSolved,
} from '../../cube/pieces';
import { applyMoves, invertAlgorithm, isCubeSolved } from '../../cube/transforms';
import { F2LCase, F2L_CASES, describeF2LPosition, f2lPositionKey } from '../cases/f2l';
import { LastLayerCase, OLL_CORNER_CASES, OLL_EDGE_CASES } from '../cases/oll2look';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from '../cases/pll2look';
import { crossDistance, solveCross } from '../crossSearch';
import {
  FIRST,
  LAST,
  SIDES,
  alg,
  cornerRef,
  edgeRef,
  faceTurns,
  lastLayerCornerRefs,
  lastLayerEdgeRefs,
  lastLayerTurnsUntil,
  orientedLastCorners,
  orientedLastEdges,
  rotations,
  solvedLastCorners,
} from '../helpers';
import { MethodDefinition, StageDefinition, StepDraft, TutorPlanError } from '../types';

// ---------------------------------------------------------------------------------------------
// Detectors. Each one includes every earlier stage, so the first false one is the current stage.
// ---------------------------------------------------------------------------------------------

const crossDone = (s: CubeState) => isCrossSolved(s, FIRST);
const f2lDone = (s: CubeState) => isLayerSolved(s, FIRST) && isMiddleLayerSolved(s, FIRST);
const ollEdgesDone = (s: CubeState) => f2lDone(s) && orientedLastEdges(s) === 4;
const ollCornersDone = (s: CubeState) => ollEdgesDone(s) && orientedLastCorners(s) === 4;
const pllCornersDone = (s: CubeState) =>
  ollCornersDone(s) && lastLayerTurnsUntil(s, (t) => solvedLastCorners(t) === 4) >= 0;
const pllEdgesDone = (s: CubeState) => ollCornersDone(s) && lastLayerTurnsUntil(s, isCubeSolved) >= 0;

// ---------------------------------------------------------------------------------------------
// Cross
// ---------------------------------------------------------------------------------------------

function planCross(view: CubeState): StepDraft {
  const algorithm = solveCross(view);
  const unsolved = SIDES.filter((side) => !isPieceSolved(view, [FIRST, side]));
  return {
    caseId: 'cross',
    caseName: `Cross in ${algorithm.length} ${algorithm.length === 1 ? 'turn' : 'turns'}`,
    setupMoves: [],
    algorithm,
    highlightPieces: unsolved.map((side) => edgeRef(FIRST, side)),
    facts: {
      goal: 'Build the white cross on the bottom, with each white edge touching its own side color.',
      lookFor: 'Find the four edges that have a white sticker. They are the only pieces that matter in this step.',
      why: 'These turns are the shortest way to bring all four white edges home at once.',
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------------------------

const noProgress = () => 0;

const STAGES: StageDefinition[] = [
  {
    id: 'cross',
    name: 'White cross',
    top: LAST,
    isComplete: crossDone,
    progress: (view) => 8 - crossDistance(view),
    plan: planCross,
    check: { prefer: ['D', 'F', 'R'] },
  },
];

export const CFOP_METHOD: MethodDefinition = {
  id: 'cfop',
  name: 'CFOP (2-look last layer)',
  stages: STAGES,
};
