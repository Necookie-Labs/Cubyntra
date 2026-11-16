import { createSolvedCubeState } from '../../src/cube/constants';
import { defaultStudentProfile, type StudentProfile } from '../../src/lib/studentProfile';

/** A valid profile with a CFOP solve in progress. */
export function sampleProfile(): StudentProfile {
  const now = new Date('2026-11-17T10:00:00Z').toISOString();
  return {
    ...defaultStudentProfile(),
    name: 'Sam',
    currentSolve: {
      method: 'cfop',
      state: createSolvedCubeState(),
      grip: { top: 'yellow', front: 'green' },
      stepIndex: 3,
      attempts: [{ result: 'mismatch', mistakes: ['wrong-direction'] }, { result: 'matched' }],
      startedAt: now,
      updatedAt: now,
    },
  };
}
