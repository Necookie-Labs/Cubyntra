/**
 * Cubyntra - Student profile schema v4 (saved cubes), the migration from v3 and the saved-cube ops
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_SAVED_CUBES,
  MAX_STUDENT_BYTES,
  STUDENT_PROFILE_VERSION,
  defaultStudentProfile,
  migrateProfileV3,
  parseStudentProfile,
  type SavedCube,
  type StudentProfile,
} from '../src/lib/studentProfile';
import { applyProfileOps, parseProfileOps } from '../src/lib/profileOps';
import { createSolvedCubeState } from '../src/cube/constants';
import { sampleProfile } from './helpers/studentProfile';
import { scrambledState } from './helpers/scrambles';

function cube(id: string, minute: number, patch: Partial<SavedCube> = {}): SavedCube {
  return {
    id,
    name: `Scan ${id}`,
    state: scrambledState(minute + 1, 20),
    scannedAt: new Date(Date.UTC(2026, 10, 19, 14, minute)).toISOString(),
    source: 'webcam',
    ...patch,
  };
}

/** The profile after the ops, as the server keeps it: merged, then validated. */
function serverApply(profile: StudentProfile, ops: Parameters<typeof applyProfileOps>[1]) {
  return parseStudentProfile(JSON.parse(JSON.stringify(applyProfileOps(profile, ops))));
}

describe('student profile v4 (saved cubes)', () => {
  it('is version 4 or later with no saved cubes by default', () => {
    expect(STUDENT_PROFILE_VERSION).toBeGreaterThanOrEqual(4);
    expect(defaultStudentProfile().savedCubes).toEqual([]);
  });

  it('migrates a version 3 profile, keeping everything it had', () => {
    const v3 = { ...JSON.parse(JSON.stringify(sampleProfile())), version: 3 };
    delete v3.savedCubes;
    const parsed = parseStudentProfile(v3);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.profile.version).toBe(STUDENT_PROFILE_VERSION);
    expect(parsed.profile.savedCubes).toEqual([]);
    expect(parsed.profile.currentSolve).toEqual(v3.currentSolve);
    expect(parsed.profile.settings).toEqual(v3.settings);
  });

  it('migrates a version 1 profile all the way', () => {
    const v1 = {
      version: 1,
      name: 'Sam',
      settings: { methodDefault: 'cfop', plainLanguage: true, stickerLetters: false, reducedMotion: false, theme: 'system' },
      palette: null,
      currentSolve: null,
      stats: { solvesCompleted: 1, stepsCompleted: 2, checkpointsPassed: 2, lastSolveAt: null },
    };
    const parsed = parseStudentProfile(v1);
    expect(parsed.ok && parsed.profile.version).toBe(STUDENT_PROFILE_VERSION);
    expect(parsed.ok && parsed.profile.savedCubes).toEqual([]);
  });

  it('leaves other versions alone when migrating', () => {
    const current = defaultStudentProfile();
    expect(migrateProfileV3(current)).toBe(current);
    expect(migrateProfileV3(null)).toBeNull();
  });

  it('round-trips saved cubes, with and without a remembered method', () => {
    const profile = { ...sampleProfile(), savedCubes: [cube('b', 2, { lastMethod: 'fewest' }), cube('a', 1, { source: 'phone' })] };
    const parsed = parseStudentProfile(JSON.parse(JSON.stringify(profile)));
    expect(parsed.ok && parsed.profile).toEqual(profile);
  });

  const base = defaultStudentProfile();
  const broken = createSolvedCubeState();
  broken.U[0] = 'yellow';
  it.each([
    ['a cube that is not a real cube', [cube('a', 1, { state: broken })]],
    ['a cube with a missing face', [{ ...cube('a', 1), state: { ...cube('a', 1).state, F: undefined } }]],
    ['an empty name', [cube('a', 1, { name: '   ' })]],
    ['a name over 40 characters', [cube('a', 1, { name: 'x'.repeat(41) })]],
    ['an unknown source', [{ ...cube('a', 1), source: 'scanner' }]],
    ['an unknown method', [{ ...cube('a', 1), lastMethod: 'roux' }]],
    ['a bad id', [cube('a b', 1)]],
    ['a bad date', [cube('a', 1, { scannedAt: 'yesterday' })]],
    ['two cubes with one id', [cube('a', 1), cube('a', 2)]],
    ['too many cubes', Array.from({ length: MAX_SAVED_CUBES + 1 }, (_, i) => cube(`c${i}`, i))],
    ['not a list', { a: cube('a', 1) }],
  ])('rejects %s', (_name, savedCubes) => {
    expect(parseStudentProfile({ ...base, savedCubes }).ok).toBe(false);
  });

  it('keeps a full list well inside the profile size cap', () => {
    const profile = { ...sampleProfile(), savedCubes: Array.from({ length: MAX_SAVED_CUBES }, (_, i) => cube(`cube-${i}`, i, { name: 'x'.repeat(40) })) };
    expect(parseStudentProfile(JSON.parse(JSON.stringify(profile))).ok).toBe(true);
    // Saved cubes take under a quarter of the cap, leaving the rest to the trainer and timer.
    expect(JSON.stringify(profile.savedCubes).length).toBeLessThan(MAX_STUDENT_BYTES / 4);
  });
});

describe('saved-cube operations', () => {
  it('adds newest first, and adding the same id again changes nothing', () => {
    let profile = applyProfileOps(defaultStudentProfile(), [{ op: 'addSavedCube', cube: cube('a', 1) }]);
    profile = applyProfileOps(profile, [{ op: 'addSavedCube', cube: cube('b', 5) }]);
    const again = applyProfileOps(profile, [{ op: 'addSavedCube', cube: { ...cube('a', 1), name: 'Changed' } }]);
    expect(again).toBe(profile);
    expect(profile.savedCubes.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('keeps the list newest first whatever order adds arrive in (two devices)', () => {
    const profile = applyProfileOps(defaultStudentProfile(), [
      { op: 'addSavedCube', cube: cube('mid', 5) },
      { op: 'addSavedCube', cube: cube('new', 9) },
      { op: 'addSavedCube', cube: cube('old', 1) },
    ]);
    expect(profile.savedCubes.map((c) => c.id)).toEqual(['new', 'mid', 'old']);
  });

  it('drops the oldest past the cap', () => {
    const ops = Array.from({ length: MAX_SAVED_CUBES + 3 }, (_, i) => ({ op: 'addSavedCube' as const, cube: cube(`c${i}`, i) }));
    const result = serverApply(defaultStudentProfile(), ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.savedCubes).toHaveLength(MAX_SAVED_CUBES);
    expect(result.profile.savedCubes[0].id).toBe(`c${MAX_SAVED_CUBES + 2}`);
    expect(result.profile.savedCubes.some((c) => c.id === 'c0' || c.id === 'c2')).toBe(false);
  });

  it('renames, remembers the method and deletes by id; a gone cube is left alone', () => {
    const start = applyProfileOps(defaultStudentProfile(), [
      { op: 'addSavedCube', cube: cube('a', 1) },
      { op: 'addSavedCube', cube: cube('b', 2) },
    ]);
    const result = serverApply(start, [
      { op: 'renameSavedCube', id: 'a', name: '  Tricky one  ' },
      { op: 'setSavedCubeMethod', id: 'a', method: 'cfop' },
      { op: 'deleteSavedCube', id: 'b' },
      { op: 'renameSavedCube', id: 'b', name: 'Too late' },
      { op: 'deleteSavedCube', id: 'missing' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.savedCubes).toEqual([{ ...cube('a', 1), name: 'Tricky one', lastMethod: 'cfop' }]);
  });

  it('merges a rename on one device with an add on another', () => {
    const server = applyProfileOps(defaultStudentProfile(), [{ op: 'addSavedCube', cube: cube('a', 1) }]);
    const merged = applyProfileOps(server, [
      { op: 'addSavedCube', cube: cube('b', 3) },
      { op: 'renameSavedCube', id: 'a', name: 'First' },
    ]);
    expect(merged.savedCubes.map((c) => [c.id, c.name])).toEqual([
      ['b', 'Scan b'],
      ['a', 'First'],
    ]);
  });

  it('fails validation on the server for an invalid cube or a long name', () => {
    const broken = createSolvedCubeState();
    broken.F[4] = 'white';
    expect(serverApply(defaultStudentProfile(), [{ op: 'addSavedCube', cube: cube('a', 1, { state: broken }) }]).ok).toBe(false);
    const withCube = applyProfileOps(defaultStudentProfile(), [{ op: 'addSavedCube', cube: cube('a', 1) }]);
    expect(serverApply(withCube, [{ op: 'renameSavedCube', id: 'a', name: 'x'.repeat(41) }]).ok).toBe(false);
    expect(serverApply(withCube, [{ op: 'renameSavedCube', id: 'a', name: ' ' }]).ok).toBe(false);
  });

  it('checks the envelope of each operation', () => {
    expect(parseProfileOps({ ops: [{ op: 'addSavedCube', cube: cube('a', 1) }] }).ok).toBe(true);
    expect(parseProfileOps({ ops: [{ op: 'addSavedCube', cube: 'a' }] }).ok).toBe(false);
    expect(parseProfileOps({ ops: [{ op: 'addSavedCube', cube: { name: 'no id' } }] }).ok).toBe(false);
    expect(parseProfileOps({ ops: [{ op: 'renameSavedCube', id: 'a' }] }).ok).toBe(false);
    expect(parseProfileOps({ ops: [{ op: 'setSavedCubeMethod', id: 'a', method: 'roux' }] }).ok).toBe(false);
    expect(parseProfileOps({ ops: [{ op: 'setSavedCubeMethod', id: 'a', method: 'fewest' }] }).ok).toBe(true);
    expect(parseProfileOps({ ops: [{ op: 'deleteSavedCube' }] }).ok).toBe(false);
  });
});
