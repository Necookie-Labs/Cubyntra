/**
 * Cubyntra - Tutor Engine Public API
 * Necookie Labs (c) 2026
 */

export * from './types';
export { METHODS, currentStage, getMethod, planNextStep, progress, runGuidedSolve } from './api';
export {
  MAX_GUIDED_STEPS,
  STAGE_SPAN,
  currentStageIn,
  planNextStepIn,
  progressIn,
  runGuidedSolveIn,
} from './engine';
export { F2L_CASES, describeF2LPosition, f2lPositionKey } from './cases/f2l';
export type { F2LCase, F2LGroup } from './cases/f2l';
export { OLL_CORNER_CASES, OLL_EDGE_CASES } from './cases/oll2look';
export type { LastLayerCase } from './cases/oll2look';
export { PLL_CORNER_CASES, PLL_EDGE_CASES } from './cases/pll2look';
export { OLL_CASES } from './cases/oll';
export type { OllCase, OllGroup } from './cases/oll';
export { PLL_CASES } from './cases/pll';
export type { PllCase, PllGroup } from './cases/pll';
export { crossDistance, solveCross } from './crossSearch';
export { countTurns } from './helpers';
export { CASE_IDS, CFOP_FULL_CASE_IDS, allCaseIds, caseIdsByStage, caseIdsOf } from './caseIds';
export {
  MIN_STICKER_CONFIDENCE,
  applyTileEdits,
  confirmManually,
  describeFace,
  observationOf,
  observeFace,
  verifyCheckpoint,
} from './checkpoint';
export type { CheckpointOptions, TileEdit } from './checkpoint';
export { MISTAKE_PRIORS, diagnoseMistake, enumerateMistakes } from './diagnose';
export type { DiagnoseOptions, MistakeCandidate } from './diagnose';
export { MAX_CORRECTIVE_TURNS, correctivePlanFrom, decideRecovery, replanFromScan, resumeFrom } from './recovery';
export type { Recovery, RecoveryOptions, ResumePlan, ScanReplan } from './recovery';
