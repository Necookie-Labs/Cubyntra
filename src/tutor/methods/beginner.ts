/**
 * Cubyntra - Beginner's Method (layer by layer)
 * Necookie Labs (c) 2026
 *
 * The teaching flow, with the grip each stage is done in:
 *   1. daisy                    yellow on top   four white petals around the yellow center
 *   2. white-cross              yellow on top   match each petal to its side, turn it down
 *   3. white-corners            WHITE on top    the finished cross is on top; corners come up
 *                                               from below with R' D' R D
 *   4. middle-edges             yellow on top   the flip: white goes to the bottom for good
 *   5. yellow-cross             yellow on top   F R U R' U' F'
 *   6. yellow-edges             yellow on top   R U R' U R U2 R' U
 *   7. yellow-corners-position  yellow on top   U R U' L' U R' U' L
 *   8. yellow-corners-orient    yellow on top   R' D' R D, turning only the top in between
 *
 * A regrip is never its own step: it is the first setup move of the step that needs it.
 * Planners find their moves by trying the stage's one or two standard sequences on a copy of
 * the cube, so a plan is right by construction and the engine's replay check confirms it.
 */

import { CubeColor, CubeState, Face, Move } from '../../cube/types';
import {
  f2lSlots,
  findCorner,
  findEdge,
  isCrossSolved,
  isLayerSolved,
  isMiddleLayerSolved,
  isPieceSolved,
} from '../../cube/pieces';
import { applyMoves, isCubeSolved } from '../../cube/transforms';
import { edgeCoord, shortestEdgeSequence } from '../edgeCoords';
import {
  FIRST,
  LAST,
  SIDES,
  alg,
  cornerRef,
  edgeRef,
  faceOfColor,
  faceTurns,
  lastCornersInPlace,
  lastLayerCornerRefs,
  lastLayerEdgeRefs,
  layerCorners,
  orientedLastEdges,
  repeatMoves,
  rotations,
  solvedLastEdges,
} from '../helpers';
import { MethodDefinition, StageDefinition, StepDraft, TutorPlanError } from '../types';
import { CORNER_TRIGGER, orientStage, planOrientCorners, yellowCornersUp } from './orientCorners';

const FIRST_CORNERS = layerCorners(FIRST);
const MIDDLE_EDGES = f2lSlots(FIRST);

/** Keeps the cheapest candidate; earlier candidates win ties, which keeps plans deterministic. */
class Cheapest {
  private best: { cost: number; draft: StepDraft } | null = null;
  offer(cost: number, draft: () => StepDraft): void {
    if (!this.best || cost < this.best.cost) this.best = { cost, draft: draft() };
  }
  get(): StepDraft | null {
    return this.best ? this.best.draft : null;
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Daisy
// ---------------------------------------------------------------------------------------------

/** A white edge is fine for the daisy when it is a petal (white on the yellow face) or already home. */
function isPetalOrHome(state: CubeState, side: CubeColor): boolean {
  const whiteSticker = findEdge(state, [FIRST, side]).stickers[0];
  return state[whiteSticker.face][4] === LAST || isPieceSolved(state, [FIRST, side]);
}

const daisyCount = (state: CubeState) => SIDES.filter((side) => isPetalOrHome(state, side)).length;

/** Home coordinates of the bottom edges below F, L, R and B (see ../edgeCoords). */
const BOTTOM_HOME: Record<'F' | 'L' | 'R' | 'B', number> = { F: 16, L: 18, R: 20, B: 22 };
const SIDE_FACES = ['F', 'R', 'B', 'L'] as const;

const DAISY_NAMES: Record<string, string> = {
  top: 'Petal from the top layer',
  middle: 'Petal from the middle layer',
  'bottom-down': 'Petal from the bottom, white down',
  'bottom-side': 'Petal from the bottom, white sideways',
};

function planDaisy(view: CubeState): StepDraft {
  const sides = SIDE_FACES.map((face) => view[face][4]);
  const homes = SIDE_FACES.map((face) => BOTTOM_HOME[face]);
  const start = sides.map((side) => edgeCoord(view, [FIRST, side]));
  // Coordinates 0, 2, 4, 6 are the top-layer spots with the tracked (white) sticker facing up.
  const fine = (coord: number, i: number) => (coord < 8 && coord % 2 === 0) || coord === homes[i];
  const count = (coords: readonly number[]) => coords.filter(fine).length;

  const moves = shortestEdgeSequence(start, (coords) => count(coords) > count(start), 6);
  if (!moves) throw new TutorPlanError('No short way to add a petal to the daisy');

  const after = applyMoves(view, moves);
  const placed = sides.filter((side, i) => !fine(start[i], i) && isPetalOrHome(after, side));
  const from = start[sides.indexOf(placed[0])];
  const layer = from < 8 ? 'top' : from < 16 ? 'middle' : from % 2 === 0 ? 'bottom-down' : 'bottom-side';
  const where: Record<string, string> = {
    top: 'in the top layer with white facing sideways',
    middle: 'in the middle layer',
    'bottom-down': 'on the bottom with white facing down',
    'bottom-side': 'in the bottom layer with white facing sideways',
  };

  // Leading top turns only make room; everything from the first other turn is the real work.
  const lead = moves.findIndex((m) => !(m.kind === 'face' && m.face === 'U'));
  const split = lead < 0 ? 0 : lead;
  return {
    caseId: `daisy-${layer}`,
    caseName: DAISY_NAMES[layer],
    setupMoves: moves.slice(0, split),
    algorithm: moves.slice(split),
    highlightPieces: placed.map((side) => edgeRef(FIRST, side)),
    targetSlot: { kind: 'center', colors: [LAST] },
    facts: {
      goal: 'Put a white edge next to the yellow center with its white sticker facing up, like a flower petal.',
      lookFor: `The white-${placed[0]} edge is ${where[layer]}.`,
      why: 'Turning the side the edge is on brings it up to the top. The top is turned first if a petal is already in the way.',
    },
  };
}

// ---------------------------------------------------------------------------------------------
// 2. White cross (from the daisy)
// ---------------------------------------------------------------------------------------------

/** A top turn moves stickers from the front to the left, then back, then right. */
const TOP_TURN_ORDER: readonly Face[] = ['F', 'L', 'B', 'R'];

function planWhiteCross(view: CubeState): StepDraft {
  const cheapest = new Cheapest();
  for (const side of SIDES) {
    if (isPieceSolved(view, [FIRST, side])) continue;
    const edge = findEdge(view, [FIRST, side]);
    if (edge.stickers[0].face !== 'U') throw new TutorPlanError(`White-${side} edge is not a petal`);
    const target = faceOfColor(view, side);
    const quarters = (TOP_TURN_ORDER.indexOf(target) - TOP_TURN_ORDER.indexOf(edge.stickers[1].face) + 4) % 4;
    const setupMoves = faceTurns('U', quarters);
    cheapest.offer(setupMoves.length, () => ({
      caseId: 'white-cross-petal',
      caseName: 'Send a petal home',
      setupMoves,
      algorithm: faceTurns(target, 2),
      highlightPieces: [edgeRef(FIRST, side)],
      targetSlot: edgeRef(FIRST, side),
      facts: {
        goal: `Move the white-${side} petal down to the white face, under the ${side} center.`,
        lookFor: `Find the petal whose side sticker is ${side}. Turn the top until that sticker sits above the ${side} center.`,
        why: 'A half turn of that side carries the petal straight down to the white face without moving the other petals.',
      },
    }));
  }
  const draft = cheapest.get();
  if (!draft) throw new TutorPlanError('White cross has no petal left to place');
  return draft;
}

// ---------------------------------------------------------------------------------------------
// Detectors. Each one includes every earlier stage; all of them count a cube that is part-way
// through the last stage as having finished the stages before it.
// ---------------------------------------------------------------------------------------------

const lastStage = (s: CubeState) => orientStage(s) !== null;
const daisyDone = (s: CubeState) => daisyCount(s) === 4 || lastStage(s);
const whiteCrossDone = (s: CubeState) => isCrossSolved(s, FIRST) || lastStage(s);
const whiteCornersDone = (s: CubeState) => isLayerSolved(s, FIRST) || lastStage(s);
const firstTwoLayers = (s: CubeState) => isLayerSolved(s, FIRST) && isMiddleLayerSolved(s, FIRST);
const middleEdgesDone = (s: CubeState) => firstTwoLayers(s) || lastStage(s);
const yellowCrossDone = (s: CubeState) => (firstTwoLayers(s) && orientedLastEdges(s) === 4) || lastStage(s);
const yellowEdgesDone = (s: CubeState) => (firstTwoLayers(s) && solvedLastEdges(s) === 4) || lastStage(s);
const cornersPlaced = (s: CubeState) =>
  (firstTwoLayers(s) && solvedLastEdges(s) === 4 && lastCornersInPlace(s) === 4) || lastStage(s);

const STAGES: StageDefinition[] = [
  {
    id: 'daisy',
    name: 'Daisy',
    top: LAST,
    isComplete: daisyDone,
    progress: daisyCount,
    plan: planDaisy,
    check: { prefer: ['U'] },
  },
  {
    id: 'white-cross',
    name: 'White cross',
    top: LAST,
    isComplete: whiteCrossDone,
    progress: (view) => SIDES.filter((side) => isPieceSolved(view, [FIRST, side])).length,
    plan: planWhiteCross,
    check: { prefer: ['F', 'R', 'L', 'B', 'D'] },
  },
];

export const BEGINNER_METHOD: MethodDefinition = {
  id: 'beginner',
  name: "Beginner's method",
  stages: STAGES,
};
