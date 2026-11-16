/**
 * Cubyntra - Sample coach facts shared by the coach tests.
 */

import { CoachFacts } from '../../src/coach/types';

export const SAMPLE_FACTS: CoachFacts = {
  method: 'cfop',
  stage: 'oll-corners',
  stageName: 'Yellow top',
  caseId: 'oll-corners-sune',
  caseName: 'Sune',
  hintLevel: 2,
  grip: { top: 'yellow', front: 'green' },
  setupMoves: 'U',
  algorithm: "R U R' U R U2 R'",
  goal: 'Turn every top corner so the whole top is yellow.',
  lookFor: 'One yellow corner on top.',
  why: 'The algorithm twists the top corners in place.',
  attempts: [],
};
