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
// F2L
// ---------------------------------------------------------------------------------------------

interface F2LRecognition {
  case: F2LCase;
  /** Clockwise quarter turns of the top that bring the pair to the case's starting position. */
  auf: number;
}

let f2lIndex: Map<string, F2LRecognition> | null = null;

/** Position key -> case and top turn, built by undoing every table algorithm on a solved cube. */
export function f2lRecognitionIndex(): Map<string, F2LRecognition> {
  if (!f2lIndex) {
    f2lIndex = new Map();
    const solved = createSolvedCubeState();
    for (const c of F2L_CASES) {
      for (let auf = 0; auf < 4; auf++) {
        const moves = [...faceTurns('U', auf), ...alg(c.algorithm)];
        const key = f2lPositionKey(applyMoves(solved, invertAlgorithm(moves)));
        if (!f2lIndex.has(key)) f2lIndex.set(key, { case: c, auf });
      }
    }
  }
  return f2lIndex;
}

/** A top turn followed by an algorithm that starts with a top turn, as one top turn. */
function mergeLeadingTopTurn(auf: number, algorithm: readonly Move[]): { setup: Move[]; algorithm: Move[] } {
  const first = algorithm[0];
  if (first && first.kind === 'face' && first.face === 'U') {
    const lead = first.quarterTurns === 1 ? 1 : first.quarterTurns === 2 ? 2 : 3;
    return { setup: faceTurns('U', auf + lead), algorithm: algorithm.slice(1) };
  }
  return { setup: faceTurns('U', auf), algorithm: [...algorithm] };
}

interface PairView {
  /** Quarter turns of `y` that bring this slot to the front-right. */
  turns: number;
  view: CubeState;
  slot: F2LSlot;
  cornerFree: boolean;
  edgeFree: boolean;
}

/** Every unsolved pair, seen with its slot at the front-right. Needs yellow on top. */
function unsolvedPairs(view: CubeState): PairView[] {
  const pairs: PairView[] = [];
  for (let turns = 0; turns < 4; turns++) {
    const v = applyMoves(view, rotations('y', turns));
    const slot: F2LSlot = [v.F[4], v.R[4]];
    if (isF2LSlotSolved(v, FIRST, slot)) continue;
    const corner = findCorner(v, [FIRST, slot[0], slot[1]]).slot;
    const edge = findEdge(v, [slot[0], slot[1]]).slot;
    pairs.push({
      turns,
      view: v,
      slot,
      // "Free" means the table can reach it: in the top layer or in its own slot.
      cornerFree: corner.startsWith('U') || corner === 'DFR',
      edgeFree: edge.startsWith('U') || edge === 'FR',
    });
  }
  return pairs;
}

const freeCount = (p: PairView) => Number(p.cornerFree) + Number(p.edgeFree);

/** Solved pairs count most; below that, how close the best unsolved pair is to a table case. */
function f2lProgress(view: CubeState): number {
  const pairs = unsolvedPairs(view);
  const best = pairs.reduce((max, p) => Math.max(max, freeCount(p)), 0);
  return (4 - pairs.length) * 4 + best;
}

function pairRefs(slot: F2LSlot) {
  return [cornerRef(FIRST, slot[0], slot[1]), edgeRef(slot[0], slot[1])];
}

function planPairFromTable(pairs: PairView[]): StepDraft | null {
  let best: { cost: number; draft: StepDraft } | null = null;
  for (const pair of pairs) {
    if (freeCount(pair) < 2) continue;
    const position = f2lPositionKey(pair.view);
    const found = f2lRecognitionIndex().get(position);
    if (!found) throw new TutorPlanError(`No F2L case for position ${position}`);
    const merged = mergeLeadingTopTurn(found.auf, alg(found.case.algorithm));
    const setupMoves = [...rotations('y', pair.turns), ...merged.setup];
    const cost = setupMoves.length + merged.algorithm.length;
    if (best && best.cost <= cost) continue;
    best = {
      cost,
      draft: {
        caseId: found.case.id,
        caseName: found.case.name,
        setupMoves,
        algorithm: merged.algorithm,
        highlightPieces: pairRefs(pair.slot),
        targetSlot: cornerRef(FIRST, pair.slot[0], pair.slot[1]),
        facts: {
          goal: `Pair up the white-${pair.slot[0]}-${pair.slot[1]} corner with the ${pair.slot[0]}-${pair.slot[1]} edge and put them in their slot at the front-right.`,
          lookFor: `Hold the ${pair.slot[0]} side in front and the ${pair.slot[1]} side on the right. ${describeF2LPosition(position)}`,
          why: 'The top turn lines the two pieces up, then the algorithm joins them and drops them into the slot without disturbing the cross or the pairs already solved.',
        },
      },
    };
  }
  return best ? best.draft : null;
}

const EXTRACTIONS = ["R U R'", "R U' R'", "R U2 R'"];

/**
 * No pair has both pieces within reach of the table: one is stuck in another pair's slot.
 * Take it out to the top layer, choosing the top turn so nothing useful is pushed back in.
 */
function planExtraction(view: CubeState, pairs: PairView[]): StepDraft {
  const target = pairs.reduce((best, p) => (freeCount(p) > freeCount(best) ? p : best), pairs[0]);
  const stuckIsCorner = !target.cornerFree;
  const stuckColors: CubeColor[] = stuckIsCorner
    ? [FIRST, target.slot[0], target.slot[1]]
    : [target.slot[0], target.slot[1]];

  const before = f2lProgress(view);
  let best: { gain: number; cost: number; setup: Move[]; algorithm: Move[] } | null = null;
  for (let turns = 0; turns < 4; turns++) {
    const v = applyMoves(view, rotations('y', turns));
    const atFrontRight = stuckIsCorner
      ? findCorner(v, [stuckColors[0], stuckColors[1], stuckColors[2]]).slot === 'DFR'
      : findEdge(v, [stuckColors[0], stuckColors[1]]).slot === 'FR';
    if (!atFrontRight) continue;
    for (let auf = 0; auf < 4; auf++) {
      for (const extraction of EXTRACTIONS) {
        const setup = [...rotations('y', turns), ...faceTurns('U', auf)];
        const algorithm = alg(extraction);
        const gain = f2lProgress(applyMoves(view, [...setup, ...algorithm])) - before;
        const cost = setup.length + algorithm.length;
        if (!best || gain > best.gain || (gain === best.gain && cost < best.cost)) {
          best = { gain, cost, setup, algorithm: [...algorithm] };
        }
      }
    }
  }
  if (!best) throw new TutorPlanError('F2L piece is neither free nor in a slot');

  const piece = stuckIsCorner
    ? cornerRef(stuckColors[0], stuckColors[1], stuckColors[2])
    : edgeRef(stuckColors[0], stuckColors[1]);
  const name = stuckIsCorner ? 'corner' : 'edge';
  return {
    caseId: stuckIsCorner ? 'f2l-extract-corner' : 'f2l-extract-edge',
    caseName: stuckIsCorner ? 'Free a stuck corner' : 'Free a stuck edge',
    setupMoves: best.setup,
    algorithm: best.algorithm,
    highlightPieces: [piece],
    facts: {
      goal: `Bring the ${stuckColors.join('-')} ${name} up to the top layer so it can be paired.`,
      lookFor: `The ${stuckColors.join('-')} ${name} is sitting in the wrong slot. Hold that slot at the front-right.`,
      why: 'Lifting the slot, turning the top and lowering it again swaps the stuck piece for top-layer pieces that are not needed yet.',
    },
  };
}

function planF2L(view: CubeState): StepDraft {
  const pairs = unsolvedPairs(view);
  return planPairFromTable(pairs) ?? planExtraction(view, pairs);
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
  {
    id: 'f2l',
    name: 'First two layers',
    top: LAST,
    isComplete: f2lDone,
    progress: f2lProgress,
    plan: planF2L,
    check: { prefer: ['F', 'R', 'U'] },
  },
];

export const CFOP_METHOD: MethodDefinition = {
  id: 'cfop',
  name: 'CFOP (2-look last layer)',
  stages: STAGES,
};
