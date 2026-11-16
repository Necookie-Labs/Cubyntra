/**
 * Cubyntra - Trainer Drills
 * Necookie Labs (c) 2026
 *
 * Turns a trainer case into a step plan, so the drill uses exactly what a guided solve uses:
 * the teaching twin plays it, the checkpoint sheet checks it, the coach explains it.
 *
 * The case is set up from a solved cube by undoing its algorithm, then (for cases that start
 * from any turn of the top) turning the top a random 0 to 3 quarter turns. The drill's moves
 * are that top turn undone, then the algorithm (merged into one top turn when the algorithm
 * itself starts with one), and they end on a solved cube. The plan comes from the tutor
 * engine's own `planNextStepIn` with a one-stage method whose goal is a solved cube, so it is
 * replayed and its checkpoint is derived like any other step. Pure: no DOM or React.
 */

import type { CubeColor, Face, Move } from '../cube/types';
import { createSolvedCubeState } from '../cube/constants';
import { gripCenters, viewInGrip, type Grip } from '../cube/grip';
import { applyMoves, invertAlgorithm, isCubeSolved, parseAlgorithm } from '../cube/transforms';
import { getMethod } from '../tutor/api';
import { planNextStepIn } from '../tutor/engine';
import { cornerRef, edgeRef, faceTurns, lastLayerCornerRefs, lastLayerEdgeRefs } from '../tutor/helpers';
import type { MethodDefinition, PieceRef, StepFacts, StepPlan } from '../tutor/types';
import type { TrainerCase } from './trainerSets';

export interface Drill {
  case: TrainerCase;
  /** Quarter turns of the top added to the setup (0 to 3); the drill starts by undoing them. */
  auf: number;
  plan: StepPlan;
}

/** How the student holds the cube for a drill: the case's top color, green in front. */
export function drillGrip(c: TrainerCase): Grip {
  return { top: c.top, front: 'green' };
}

/** A random top turn for cases that start from any turn of the top (0 otherwise). */
export function randomAuf(c: TrainerCase, random: () => number = Math.random): number {
  return c.auf ? Math.min(3, Math.floor(random() * 4)) : 0;
}

/** The undo of the setup's top turn followed by the algorithm, as one move list. */
export function drillMoves(algorithm: readonly Move[], auf: number): { setupMoves: Move[]; algorithm: Move[] } {
  const undo = faceTurns('U', -auf);
  const first = algorithm[0];
  if (undo.length && first && first.kind === 'face' && first.face === 'U') {
    // "U' then U R ..." reads badly: fold the two top turns into one.
    const merged = faceTurns('U', first.quarterTurns - auf);
    return { setupMoves: [], algorithm: [...merged, ...algorithm.slice(1)] };
  }
  return { setupMoves: undo, algorithm: [...algorithm] };
}

function highlightFor(c: TrainerCase, centers: Record<Face, CubeColor>): PieceRef[] {
  const { U, D, F, R, L } = centers;
  switch (c.highlight) {
    case 'last-layer':
      return [...lastLayerCornerRefs(), ...lastLayerEdgeRefs()];
    case 'f2l-pair':
      return [cornerRef(D, F, R), edgeRef(F, R)];
    case 'middle-edge':
      return [edgeRef(F, c.id.endsWith('left') ? L : R)];
    case 'corner':
      return [cornerRef(U, F, R)];
  }
}

const WHY: Record<TrainerCase['highlight'], string> = {
  'last-layer': 'It changes only the top layer and leaves the first two layers exactly as they were.',
  'f2l-pair': 'It joins the corner to its edge and drops the pair into its slot without breaking the cross or the other slots.',
  'middle-edge': 'It moves the edge down into the middle layer and puts the white layer back together.',
  corner: 'Each round of the four moves twists the corner a third of a turn and puts the rest back.',
};

function stageName(c: TrainerCase): string {
  const method = getMethod(c.method, c.lastLayer ? { lastLayer: c.lastLayer } : {});
  return method.stages.find((s) => s.id === c.stage)?.name ?? c.name;
}

/**
 * The step plan for one drill of `c`, starting `auf` quarter turns of the top away from the
 * case's own position. Throws `TutorPlanError` if the case does not replay to a solved cube.
 */
export function buildDrill(c: TrainerCase, auf = 0): Drill {
  const grip = drillGrip(c);
  const centers = gripCenters(grip);
  const algorithm = parseAlgorithm(c.algorithm);
  const solved = viewInGrip(createSolvedCubeState(), grip).state;
  const turns = c.auf ? ((auf % 4) + 4) % 4 : 0;
  const start = applyMoves(solved, [...invertAlgorithm(algorithm), ...faceTurns('U', turns)]);
  const moves = drillMoves(algorithm, turns);
  const facts: StepFacts = {
    goal: `Solve the case "${c.name}" with one algorithm.`,
    lookFor: c.recognition,
    why: WHY[c.highlight],
  };
  const name = stageName(c);
  const definition: MethodDefinition = {
    id: c.method,
    name: `Trainer: ${c.name}`,
    ...(c.lastLayer === 'full' ? { options: { lastLayer: 'full' as const } } : {}),
    stages: [
      {
        id: c.stage,
        name,
        top: c.top,
        isComplete: isCubeSolved,
        progress: () => 0,
        plan: () => ({
          caseId: c.id,
          caseName: c.name,
          setupMoves: moves.setupMoves,
          algorithm: moves.algorithm,
          highlightPieces: highlightFor(c, centers),
          facts,
        }),
        check: { prefer: c.highlight === 'f2l-pair' || c.highlight === 'middle-edge' ? ['F', 'R'] : ['U', 'F'] },
      },
    ],
  };
  const plan = planNextStepIn(definition, start, grip, 0);
  if (!plan) throw new Error(`Drill ${c.id} starts solved`);
  return { case: c, auf: turns, plan };
}
