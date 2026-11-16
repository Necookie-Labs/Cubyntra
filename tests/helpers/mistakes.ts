/**
 * Cubyntra - Injected Student Mistakes for Checkpoint Tests
 *
 * Builds what a student who slipped would have done, without using the diagnosis code: each
 * mistake is written here by hand on the plan's move list, so the tests compare two
 * independent descriptions of the same slip.
 */

import { CubeState, Move } from '../../src/cube/types';
import { OPPOSITE_FACES } from '../../src/cube/constants';
import { viewInGrip } from '../../src/cube/grip';
import { applyMoves, invertMove, parseMove } from '../../src/cube/transforms';
import { FaceObservation, StepPlan } from '../../src/tutor/types';
import { observeFace } from '../../src/tutor/checkpoint';
import { readFaceFromContext } from '../../src/vision/checkpointCapture';
import { StudentPalette } from '../../src/vision/palette';
import { CubeFaceOptions, contextFor, renderCubeFace } from './syntheticCube';

export const INJECTED_KINDS = [
  'wrong-direction',
  'skipped-move',
  'doubled-move',
  'wrong-face',
  'wrong-grip',
  'stopped-early',
  'extra-repeat',
] as const;

export type InjectedKind = (typeof INJECTED_KINDS)[number];

export interface InjectedMistake {
  kind: InjectedKind;
  /** Index into setup + algorithm where the slip happened, when it has one. */
  moveIndex?: number;
  /** Everything the student did, from the plan's start state and grip. */
  moves: Move[];
  /** The cube afterwards, held the way the plan's `gripAfter` says. */
  state: CubeState;
}

const pick = <T>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length)];

/** The cube after `moves` from the plan's start, turned so its centers match `gripAfter`. */
export function stateAfter(plan: StepPlan, moves: readonly Move[]): CubeState {
  return viewInGrip(applyMoves(plan.startState, moves), plan.gripAfter).state;
}

function build(plan: StepPlan, kind: InjectedKind, random: () => number): Omit<InjectedMistake, 'state' | 'kind'> | null {
  const moves = [...plan.setupMoves, ...plan.algorithm];
  const turnIndexes = moves.map((m, i) => (m.kind === 'rotation' ? -1 : i)).filter((i) => i >= 0);
  const quarterIndexes = turnIndexes.filter((i) => moves[i].quarterTurns !== 2);
  const replaceAt = (i: number, ...replacement: Move[]) => [...moves.slice(0, i), ...replacement, ...moves.slice(i + 1)];

  switch (kind) {
    case 'wrong-direction': {
      if (!quarterIndexes.length) return null;
      const i = pick(quarterIndexes, random);
      return { moveIndex: i, moves: replaceAt(i, invertMove(moves[i])) };
    }
    case 'skipped-move': {
      const i = pick(turnIndexes, random);
      return { moveIndex: i, moves: replaceAt(i) };
    }
    case 'doubled-move': {
      if (!quarterIndexes.length) return null;
      const i = pick(quarterIndexes, random);
      return { moveIndex: i, moves: replaceAt(i, moves[i], moves[i]) };
    }
    case 'wrong-face': {
      const faceIndexes = turnIndexes.filter((i) => moves[i].kind === 'face');
      if (!faceIndexes.length) return null;
      const i = pick(faceIndexes, random);
      const move = moves[i];
      if (move.kind !== 'face') return null;
      const suffix = move.notation.slice(1);
      // Either the mirror-image turn of the opposite side, or two layers instead of one.
      const mirrored = suffix === '2' ? '2' : suffix === "'" ? '' : "'";
      const notation = random() < 0.5 ? `${OPPOSITE_FACES[move.face]}${mirrored}` : `${move.face.toLowerCase()}${suffix}`;
      return { moveIndex: i, moves: replaceAt(i, parseMove(notation)) };
    }
    case 'wrong-grip': {
      const regrips = moves.filter((m) => m.kind === 'rotation').length;
      if (regrips > 0 && random() < 0.5) {
        // Forgot to regrip: every whole-cube turn of the setup is left out.
        return { moveIndex: 0, moves: moves.filter((m) => m.kind !== 'rotation') };
      }
      // Started with the wrong side in front.
      return { moveIndex: 0, moves: [parseMove(pick(['y', "y'", 'y2'], random)), ...moves] };
    }
    case 'stopped-early': {
      const repeat = plan.facts.repeat;
      if (repeat && repeat.times > 1) {
        const done = 1 + Math.floor(random() * (repeat.times - 1));
        const length = plan.setupMoves.length + done * repeat.unit.length;
        return { moveIndex: length, moves: moves.slice(0, length) };
      }
      if (moves.length < 2) return null;
      const length = 1 + Math.floor(random() * (moves.length - 1));
      return { moveIndex: length, moves: moves.slice(0, length) };
    }
    case 'extra-repeat': {
      const repeat = plan.facts.repeat;
      if (!repeat) return null;
      return { moves: [...moves, ...repeat.unit] };
    }
  }
}

/**
 * One mistake of the given kind at a random place in the plan, or null when the plan has no
 * place for it or the slip happens to leave the cube exactly as the plan expects.
 */
export function injectMistake(plan: StepPlan, kind: InjectedKind, random: () => number): InjectedMistake | null {
  const built = build(plan, kind, random);
  if (!built) return null;
  const state = stateAfter(plan, built.moves);
  if (JSON.stringify(state) === JSON.stringify(plan.expectedState)) return null;
  return { kind, ...built, state };
}

/** True when two cubes show the same stickers on every listed face. */
export function sameOnFaces(a: CubeState, b: CubeState, faces: readonly string[]): boolean {
  return faces.every((face) => a[face as keyof CubeState].join() === b[face as keyof CubeState].join());
}

/**
 * Photographs the plan's checkpoint faces of `state` and reads them with the real pipeline:
 * synthetic image, tile sampling, glare measure, palette classification.
 */
export function photographCheckpoint(
  plan: StepPlan,
  state: CubeState,
  palette: StudentPalette | null,
  options: CubeFaceOptions = {},
  faces: readonly FaceObservation['face'][] = plan.checkpoint.facesToShow
): FaceObservation[] {
  return faces.map((face, i) => {
    const lighting = { ...options.lighting, seed: (options.lighting?.seed ?? 7) * 31 + i };
    const image = renderCubeFace(state, face, { ...options, lighting });
    return observeFace(face, readFaceFromContext(contextFor(image), image.width, image.height, palette).stickers);
  });
}
