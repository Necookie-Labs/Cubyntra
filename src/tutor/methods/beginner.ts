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
// 3. White corners (white on top, corners come up from the bottom)
// ---------------------------------------------------------------------------------------------

/** Corners solved count double; a white corner waiting in the bottom layer counts one. */
function whiteCornerProgress(view: CubeState): number {
  const unsolved = FIRST_CORNERS.filter((c) => !isPieceSolved(view, c));
  const waiting = unsolved.some((c) => findCorner(view, c).stickers.some((s) => view[s.face][4] === LAST));
  return (4 - unsolved.length) * 2 + Number(waiting);
}

function cornerDraft(
  corner: [CubeColor, CubeColor, CubeColor],
  kind: 'below' | 'twisted' | 'wrong-slot',
  setupMoves: Move[],
  times: number
): StepDraft {
  const unit = alg(CORNER_TRIGGER);
  const label = corner.join('-');
  const text = {
    below: {
      name: 'Corner below its home',
      goal: `Lift the ${label} corner into its home in the top layer.`,
      lookFor: `The ${label} corner is in the bottom layer. Turn the bottom until it sits right under its home, between the ${corner[1]} and ${corner[2]} centers, and hold it at the front-right.`,
    },
    twisted: {
      name: 'Corner home but twisted',
      goal: `Turn the ${label} corner the right way round without moving it away.`,
      lookFor: `The ${label} corner is in its home but white is not facing up. Hold it at the front-right.`,
    },
    'wrong-slot': {
      name: 'Corner in the wrong home',
      goal: `Take the ${label} corner out of the top layer so it can go to its own home.`,
      lookFor: `The ${label} corner is in the top layer but between the wrong centers. Hold it at the front-right.`,
    },
  }[kind];
  return {
    caseId: `white-corner-${kind}`,
    caseName: text.name,
    setupMoves,
    algorithm: repeatMoves(unit, times),
    highlightPieces: [cornerRef(corner[0], corner[1], corner[2])],
    targetSlot: kind === 'wrong-slot' ? undefined : cornerRef(corner[0], corner[1], corner[2]),
    facts: {
      goal: text.goal,
      lookFor: text.lookFor,
      why: 'Each round of these four turns swaps the front-right corners of the top and bottom and twists them, while the white cross comes back every time.',
      repeat: { unit: [...unit], times },
    },
  };
}

function planWhiteCorners(view: CubeState): StepDraft {
  const unit = alg(CORNER_TRIGGER);
  const solving = new Cheapest();
  const extracting = new Cheapest();
  for (const corner of FIRST_CORNERS) {
    if (isPieceSolved(view, corner)) continue;
    for (let turns = 0; turns < 4; turns++) {
      const hold = rotations('y', turns);
      const v = applyMoves(view, hold);
      const slot = findCorner(v, corner).slot;
      const homeAtFrontRight = corner.includes(v.F[4]) && corner.includes(v.R[4]);

      if (slot.startsWith('D') && homeAtFrontRight) {
        for (let quarters = 0; quarters < 4; quarters++) {
          const setup = [...hold, ...faceTurns('D', quarters)];
          const below = applyMoves(view, setup);
          if (findCorner(below, corner).slot !== 'DFR') continue;
          for (const times of [1, 3, 5]) {
            if (!isPieceSolved(applyMoves(below, repeatMoves(unit, times)), corner)) continue;
            solving.offer(setup.length + 4 * times, () => cornerDraft(corner, 'below', setup, times));
          }
        }
      } else if (slot === 'UFR' && homeAtFrontRight) {
        for (const times of [2, 4]) {
          if (!isPieceSolved(applyMoves(v, repeatMoves(unit, times)), corner)) continue;
          solving.offer(hold.length + 4 * times, () => cornerDraft(corner, 'twisted', hold, times));
        }
      } else if (slot === 'UFR') {
        extracting.offer(hold.length + 4, () => cornerDraft(corner, 'wrong-slot', hold, 1));
      }
    }
  }
  const draft = solving.get() ?? extracting.get();
  if (!draft) throw new TutorPlanError('No white corner can be placed');
  return draft;
}

// ---------------------------------------------------------------------------------------------
// 4. Middle-layer edges
// ---------------------------------------------------------------------------------------------

const MIDDLE_RIGHT = "U R U' R' U' F' U F";
const MIDDLE_LEFT = "U' L' U L U F U' F'";

/** Edges solved count double; a middle edge waiting in the top layer counts one. */
function middleEdgeProgress(view: CubeState): number {
  const unsolved = MIDDLE_EDGES.filter(([a, b]) => !isPieceSolved(view, [a, b]));
  const waiting = unsolved.some(([a, b]) => findEdge(view, [a, b]).stickers.some((s) => view[s.face][4] === LAST));
  return (4 - unsolved.length) * 2 + Number(waiting);
}

function planMiddleEdges(view: CubeState): StepDraft {
  const solving = new Cheapest();
  const extracting = new Cheapest();
  for (const [a, b] of MIDDLE_EDGES) {
    if (isPieceSolved(view, [a, b])) continue;
    const label = `${a}-${b}`;
    const inTop = findEdge(view, [a, b]).slot.startsWith('U');
    for (let quarters = 0; quarters < 4; quarters++) {
      for (let turns = 0; turns < 4; turns++) {
        if (!inTop && quarters > 0) continue;
        const setup = [...rotations('y', turns), ...faceTurns('U', quarters)];
        const v = applyMoves(view, setup);
        const slot = findEdge(v, [a, b]).slot;

        if (inTop && slot === 'UF' && v.F[1] === v.F[4]) {
          const goesRight = v.U[7] === v.R[4];
          const algorithm = alg(goesRight ? MIDDLE_RIGHT : MIDDLE_LEFT);
          if (!isPieceSolved(applyMoves(v, algorithm), [a, b])) continue;
          const sideName = goesRight ? 'right' : 'left';
          solving.offer(setup.length + algorithm.length, () => ({
            caseId: `middle-edge-${sideName}`,
            caseName: `Middle edge to the ${sideName}`,
            setupMoves: setup,
            algorithm: [...algorithm],
            highlightPieces: [edgeRef(a, b)],
            targetSlot: edgeRef(a, b),
            facts: {
              goal: `Drop the ${label} edge from the top layer into the middle layer on the ${sideName}.`,
              lookFor: `Find the ${label} edge in the top layer (no yellow on it). Turn the top until its side sticker matches the center below it and hold that side in front. Its top sticker matches the ${sideName} center.`,
              why: `The edge is moved away from the ${sideName}, the ${sideName} slot comes up to collect it, and the white corner underneath is put back.`,
            },
          }));
        } else if (!inTop && slot === 'FR') {
          const algorithm = alg(MIDDLE_RIGHT);
          extracting.offer(setup.length + algorithm.length, () => ({
            caseId: 'middle-edge-extract',
            caseName: 'Free a stuck middle edge',
            setupMoves: setup,
            algorithm: [...algorithm],
            highlightPieces: [edgeRef(a, b)],
            facts: {
              goal: `Bring the ${label} edge up to the top layer so it can be put in properly.`,
              lookFor: `The ${label} edge is in the middle layer but in the wrong place or flipped. Hold it at the front-right.`,
              why: 'Putting a top-layer edge into this slot pushes the stuck edge out to the top.',
            },
          }));
        }
      }
    }
  }
  const draft = solving.get() ?? extracting.get();
  if (!draft) throw new TutorPlanError('No middle edge can be placed');
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
  {
    id: 'white-corners',
    name: 'White corners',
    top: FIRST,
    isComplete: whiteCornersDone,
    progress: whiteCornerProgress,
    plan: planWhiteCorners,
    check: { prefer: ['U', 'F', 'R'] },
  },
  {
    id: 'middle-edges',
    name: 'Middle layer',
    top: LAST,
    isComplete: middleEdgesDone,
    progress: middleEdgeProgress,
    plan: planMiddleEdges,
    check: { prefer: ['F', 'R', 'L'] },
  },
];

export const BEGINNER_METHOD: MethodDefinition = {
  id: 'beginner',
  name: "Beginner's method",
  stages: STAGES,
};
