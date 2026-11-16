import { describe, expect, it } from 'vitest';
import { CubeColor, CubeState, Move } from '../src/cube/types';
import { COLORS, FACES } from '../src/cube/constants';
import { formatAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { runGuidedSolve } from '../src/tutor';
import { observationOf, verifyCheckpoint } from '../src/tutor/checkpoint';
import { MISTAKE_PRIORS, diagnoseMistake, enumerateMistakes } from '../src/tutor/diagnose';
import { FaceObservation, StepPlan } from '../src/tutor/types';
import { INJECTED_KINDS, injectMistake, sameOnFaces, stateAfter } from './helpers/mistakes';
import { scrambledState, seededRandom } from './helpers/scrambles';

const allFaces = (state: CubeState): FaceObservation[] => FACES.map((face) => observationOf(state, face));
const checkFaces = (plan: StepPlan, state: CubeState): FaceObservation[] =>
  plan.checkpoint.facesToShow.map((face) => observationOf(state, face));

const steps = (method: 'beginner' | 'cfop', n: number) => runGuidedSolve(scrambledState(101, n), method).steps;
const cfop = steps('cfop', 1);
const beginner = steps('beginner', 1);
const f2l = cfop.find((s) => s.stage === 'f2l' && s.algorithm.length >= 6)!;
const moves = (plan: StepPlan) => [...plan.setupMoves, ...plan.algorithm];
const replaceAt = (list: Move[], i: number, notation: string) => [
  ...list.slice(0, i),
  ...parseAlgorithm(notation),
  ...list.slice(i + 1),
];

describe('enumerateMistakes', () => {
  it('lists every kind of slip for a plan, each replayable and described in plain words', () => {
    const repeatPlan = beginner.find((s) => s.facts.repeat && s.facts.repeat.times > 1)!;
    for (const plan of [f2l, repeatPlan]) {
      const candidates = enumerateMistakes(plan);
      const kinds = new Set(candidates.map((c) => c.detail ?? c.kind));
      for (const kind of ['wrong-direction', 'skipped-move', 'doubled-move', 'wrong-face', 'wrong-grip', 'stopped-early']) {
        expect(kinds.has(kind as never), kind).toBe(true);
      }
      expect(kinds.has('extra-repeat' as never)).toBe(Boolean(plan.facts.repeat));
      for (const c of candidates) {
        expect(c.prior).toBeGreaterThan(0);
        expect(c.prior).toBeLessThanOrEqual(1);
        expect(c.description.length).toBeGreaterThan(10);
        // No notation in the text a ten-year-old reads: no lone move letters.
        expect(c.description, c.description).not.toMatch(/(^|[\s"(])[RLUDFBMESrludfbxyz][2']?(?=[\s").,]|$)/);
        if (c.moveIndex !== undefined) {
          expect(c.moveIndex).toBeGreaterThanOrEqual(0);
          expect(c.moveIndex).toBeLessThan(moves(plan).length);
        }
        expect(() => stateAfter(plan, c.performedMoves)).not.toThrow();
      }
    }
  });

  it('says what the student did in words, with the move number counted from one', () => {
    const list = moves(f2l);
    const i = f2l.setupMoves.length; // first move of the algorithm
    const at = enumerateMistakes(f2l).filter((c) => c.moveIndex === i);
    const direction = at.find((c) => c.kind === 'wrong-direction')!;
    expect(direction.description).toMatch(new RegExp(`^Move ${i + 1} is "turn .+"\\. You probably turned it the other way\\.$`));
    expect(formatAlgorithm(direction.performedMoves)).toBe(
      formatAlgorithm(replaceAt(list, i, list[i].quarterTurns === 1 ? `${list[i].notation}'` : list[i].notation[0]))
    );
    expect(at.find((c) => c.kind === 'skipped-move')!.description).toMatch(new RegExp(`^You probably skipped move ${i + 1}: "turn`));
    expect(at.find((c) => c.kind === 'doubled-move')!.description).toContain('You probably did it twice.');
    expect(at.find((c) => c.kind === 'wrong-face')!.description).toMatch(/^At move \d+ you probably did "turn .+"\. It should be "turn .+"\.$/);
  });

  it('labels a slip on a regrip as a grip mistake', () => {
    const regrip = cfop.find((s) => s.setupMoves[0]?.kind === 'rotation')!;
    const first = enumerateMistakes(regrip).filter((c) => c.moveIndex === 0 && !c.detail && c.kind !== 'wrong-face');
    expect(first.length).toBeGreaterThan(0);
    for (const c of first) expect(c.kind).toBe('wrong-grip');
  });

  it('names the grip the student probably started in', () => {
    const grips = enumerateMistakes(f2l).filter((c) => c.kind === 'wrong-grip' && c.description.startsWith('You probably started'));
    expect(grips).toHaveLength(23);
    for (const c of grips) {
      expect(c.description).toContain(`This step starts with ${f2l.grip.top} on top and ${f2l.grip.front} in front.`);
    }
    expect(grips.filter((c) => c.prior === MISTAKE_PRIORS.wrongFront)).toHaveLength(3);
  });
});

describe('diagnoseMistake with the whole cube in view', () => {
  it('finds every single slip of every kind, at every seed, as the top diagnosis', () => {
    const random = seededRandom(7);
    let checked = 0;
    for (const plan of [...cfop, ...beginner]) {
      for (const kind of INJECTED_KINDS) {
        const injected = injectMistake(plan, kind, random);
        if (!injected) continue;
        const diagnosis = diagnoseMistake(plan, allFaces(injected.state));
        const top = diagnosis.likelyMistakes[0];
        expect(top, `${plan.caseId} ${kind}`).toBeDefined();
        expect(top.resultingState, `${plan.caseId} ${kind}`).toEqual(injected.state);
        expect(stateAfter(plan, top.performedMoves)).toEqual(injected.state);
        expect(top.contradictions).toBe(0);
        // With all six faces shown no other cube looks the same.
        expect(diagnosis.confident).toBe(true);
        expect(diagnosis.showNext).toBeUndefined();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it('names the kind and the move when only one slip leads to that cube', () => {
    const list = moves(f2l);
    const i = f2l.setupMoves.length + 2;
    const flipped = replaceAt(list, i, list[i].quarterTurns === 1 ? `${list[i].notation}'` : list[i].notation[0]);
    const top = diagnoseMistake(f2l, allFaces(stateAfter(f2l, flipped))).likelyMistakes[0];
    expect(top.kind).toBe('wrong-direction');
    expect(top.moveIndex).toBe(i);
    expect(top.description).toContain(`Move ${i + 1} is`);
    expect(top.confidence).toBeGreaterThan(0.9);
  });

  it('ranks by score, keeps to topK and returns only mistakes that fit', () => {
    const random = seededRandom(11);
    const injected = injectMistake(f2l, 'skipped-move', random)!;
    for (const topK of [1, 3, 5]) {
      const { likelyMistakes } = diagnoseMistake(f2l, checkFaces(f2l, injected.state), { topK });
      expect(likelyMistakes.length).toBeGreaterThan(0);
      expect(likelyMistakes.length).toBeLessThanOrEqual(topK);
      likelyMistakes.forEach((m, k) => {
        expect(m.contradictions).toBe(0);
        expect(sameOnFaces(m.resultingState, injected.state, f2l.checkpoint.facesToShow)).toBe(true);
        if (k > 0) expect(m.score).toBeLessThanOrEqual(likelyMistakes[k - 1].score);
        expect(m.confidence).toBeGreaterThanOrEqual(0);
        expect(m.confidence).toBeLessThanOrEqual(1);
      });
      expect(likelyMistakes.reduce((sum, m) => sum + m.confidence, 0)).toBeLessThanOrEqual(1.001);
    }
  });

  it('never offers the cube the plan expects as a mistake', () => {
    for (const plan of cfop) {
      const { likelyMistakes } = diagnoseMistake(plan, checkFaces(plan, plan.expectedState), { topK: 50 });
      for (const m of likelyMistakes) expect(m.resultingState).not.toEqual(plan.expectedState);
    }
  });

  it('finds two slips in one step when no single slip fits', () => {
    const list = moves(f2l);
    const a = f2l.setupMoves.length;
    const b = list.length - 1;
    const twice = [...list.slice(0, a), ...list.slice(a + 1, b), ...parseAlgorithm(`${list[b].notation[0]}2`)];
    const state = stateAfter(f2l, twice);
    const diagnosis = diagnoseMistake(f2l, allFaces(state));
    const top = diagnosis.likelyMistakes[0];
    expect(top.resultingState).toEqual(state);
    expect(top.kind).toBe('other');
    expect(top.detail).toBe('two-mistakes');
    expect(top.moveIndex).toBe(a);
    expect(top.description).toMatch(/^Two things probably went wrong\./);
  });

  it('returns nothing for a cube no slip explains, and for a scan with nothing readable', () => {
    const unrelated = scrambledState(999, 5);
    const rehomed = Object.fromEntries(
      FACES.map((f) => [f, unrelated[f].map((c, i) => (i === 4 ? f2l.expectedState[f][4] : c))])
    ) as unknown as CubeState;
    expect(diagnoseMistake(f2l, allFaces(rehomed))).toEqual({ likelyMistakes: [], confident: false });

    const blurry = FACES.map((face) => observationOf(f2l.expectedState, face, 0.1));
    expect(diagnoseMistake(f2l, blurry)).toEqual({ likelyMistakes: [], confident: false });
    expect(diagnoseMistake(f2l, [])).toEqual({ likelyMistakes: [], confident: false });
  });
});

describe('diagnoseMistake with only the checkpoint faces in view', () => {
  it('is not confident when different cubes look the same, and says which face would settle it', () => {
    const random = seededRandom(23);
    let ambiguous = 0;
    let settled = 0;
    for (const plan of [...cfop, ...beginner]) {
      for (const kind of INJECTED_KINDS) {
        const injected = injectMistake(plan, kind, random);
        if (!injected) continue;
        const shown = checkFaces(plan, injected.state);
        if (verifyCheckpoint(plan, shown).status !== 'mismatch') continue;
        const diagnosis = diagnoseMistake(plan, shown, { topK: 100 });
        const top = diagnosis.likelyMistakes[0];
        expect(top, `${plan.caseId} ${kind}`).toBeDefined();
        // The injected cube is among those tied at the top: same stickers on the shown faces.
        expect(sameOnFaces(top.resultingState, injected.state, plan.checkpoint.facesToShow)).toBe(true);

        if (diagnosis.confident) {
          expect(top.resultingState).toEqual(injected.state);
          expect(diagnosis.showNext).toBeUndefined();
          continue;
        }
        const lookAlikes = diagnosis.likelyMistakes.filter((m) =>
          sameOnFaces(m.resultingState, top.resultingState, plan.checkpoint.facesToShow)
        );
        if (lookAlikes.length < 2) continue; // not confident for lack of belief, not for a tie
        ambiguous++;
        if (!diagnosis.showNext) continue;
        expect(plan.checkpoint.facesToShow).not.toContain(diagnosis.showNext);
        const more = [...shown, observationOf(injected.state, diagnosis.showNext)];
        const again = diagnoseMistake(plan, more, { topK: 100 });
        const stillTied = again.likelyMistakes.filter((m) =>
          sameOnFaces(m.resultingState, injected.state, [...plan.checkpoint.facesToShow, diagnosis.showNext!])
        );
        expect(stillTied.length).toBeLessThan(lookAlikes.length);
        if (again.confident) settled++;
      }
    }
    expect(ambiguous).toBeGreaterThan(0);
    expect(settled).toBeGreaterThan(0);
  });

  it('does not count an unclear sticker against a mistake', () => {
    const random = seededRandom(31);
    const injected = injectMistake(f2l, 'wrong-direction', random)!;
    const face = f2l.checkpoint.facesToShow[0];
    const wrong: CubeColor = COLORS.find((c) => c !== injected.state[face][0])!;
    const shown = checkFaces(f2l, injected.state).map((o) =>
      o.face === face
        ? { ...o, stickers: o.stickers.map((s, i) => (i === 0 ? { color: wrong, confidence: 0.2 } : s)) }
        : o
    );
    const top = diagnoseMistake(f2l, shown).likelyMistakes[0];
    expect(top.contradictions).toBe(0);
    expect(sameOnFaces(top.resultingState, injected.state, f2l.checkpoint.facesToShow)).toBe(true);

    // The same wrong tile read clearly is a contradiction: that cube no longer fits.
    const clear = shown.map((o) =>
      o.face === face ? { ...o, stickers: o.stickers.map((s, i) => (i === 0 ? { ...s, confidence: 1 } : s)) } : o
    );
    for (const m of diagnoseMistake(f2l, clear, { topK: 100 }).likelyMistakes) {
      expect(m.resultingState[face][0]).toBe(wrong);
    }
  });
});
