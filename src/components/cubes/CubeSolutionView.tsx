'use client';

/**
 * Cubyntra - Full-solution walkthrough of a saved cube (`/cubes/[id]`)
 * Necookie Labs (c) 2026
 *
 * The whole solution of one saved cube, step by step, on the 3D twin. The method switch picks
 * the beginner's method, CFOP (with the last-layer setting) or Fewest moves, the computer's
 * Kociemba solution split into parts (see src/app-shell/walkthrough.ts); the choice is
 * remembered per cube. Solutions are worked out in the solver worker, once per method.
 *
 * Phone, top to bottom: header and summary, the twin, the selected step, the list of steps.
 * Desktop: the twin large on the left, everything else in a column on the right, as on /solve.
 * The selected step plays on the twin from its own start state with the usual playback, move
 * chips, "In words" and After preview. "Play all" plays each step to the end and moves on to the
 * next until the cube is solved (pause, resume and stop); with the voice on it names each stage
 * and move as they play. "Copy all moves" puts the whole solution, by stage, on the clipboard.
 * "Ask the coach" under the selected step holds a short conversation about that step; a new
 * step starts a new conversation.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, ClipboardCopy, Pause, Play, RefreshCw, Square } from 'lucide-react';
import { useTutorStore, methodOptionsFor } from '@/stores/useTutorStore';
import { guidedSolveInWorker, solveInWorker } from '@/solver/client';
import type { CubeState } from '@/cube/types';
import { formatAlgorithm } from '@/cube/transforms';
import type { CubeEngine } from '@/three/engine';
import type { LastLayerMode, StepPlan } from '@/tutor/types';
import { SOLUTION_METHODS, type SavedCube, type SolutionMethod } from '@/lib/studentProfile';
import { SOURCE_LABEL, shortDateTime } from '@/lib/savedCubes';
import {
  SOLUTION_LABEL,
  SOLUTION_TITLE,
  buildWalkthrough,
  computerSolutionSteps,
  countLabel,
  solutionText,
  stepMoves,
  type Walkthrough,
  type WalkthroughStep,
} from '@/app-shell/walkthrough';
import { useWakeLock } from '@/app-shell/wakeLock';
import { TeachingTwin } from '@/components/twin/TeachingTwin';
import { BlockButton, Panel, SegmentedControl, cx } from '@/components/ui';
import { BlockLink } from '@/components/shell/BlockLink';
import { Busy, PageContainer } from '@/components/shell/Page';
import { useWalkthroughVoice } from './useWalkthroughVoice';
import { CoachChat } from '@/components/coach/CoachChat';
import { useChatVoice } from '@/components/coach/useChatVoice';
import { useCompanion } from '@/sync/CompanionSyncProvider';

type Result = { status: 'ready'; walkthrough: Walkthrough } | { status: 'error'; message: string };
type AutoPlay = 'off' | 'playing' | 'paused';

/** The solution of `state` by `method`, worked out in the solver worker. */
export async function computeWalkthrough(state: CubeState, method: SolutionMethod, lastLayer: LastLayerMode): Promise<Walkthrough> {
  if (method === 'fewest') {
    const result = await solveInWorker(state);
    if (!result.success) throw new Error(result.error ?? 'The solver found no solution.');
    return buildWalkthrough('fewest', computerSolutionSteps(state, result.moves));
  }
  const options = methodOptionsFor(method, { lastLayer });
  const solve = options ? await guidedSolveInWorker(state, method, undefined, options) : await guidedSolveInWorker(state, method);
  return buildWalkthrough(method, solve.steps);
}

function CubeNotFound() {
  return (
    <PageContainer width="md">
      <Panel role="alert" className="flex flex-col items-start gap-4 p-6">
        <h1 className="text-2xl leading-tight text-ink">Cube not found</h1>
        <p className="max-w-prose text-sm text-muted">
          This cube is not in My cubes. It may have been deleted, or it dropped off the list when newer scans came in.
        </p>
        <BlockLink href="/cubes" variant="primary" icon={<ArrowLeft aria-hidden className="h-4 w-4" />}>
          My cubes
        </BlockLink>
      </Panel>
    </PageContainer>
  );
}

const METHOD_OPTIONS = SOLUTION_METHODS.map((value) => ({ value, label: SOLUTION_LABEL[value] }));

function StepList({
  walkthrough,
  selected,
  onSelect,
}: {
  walkthrough: Walkthrough;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  // Set by the arrow keys: the newly selected step takes the focus once it is the Tab stop.
  const focusNext = useRef(false);
  const last = walkthrough.steps.length - 1;

  useEffect(() => {
    const button = buttons.current[selected];
    button?.scrollIntoView?.({ block: 'nearest' });
    if (focusNext.current) {
      focusNext.current = false;
      button?.focus();
    }
  }, [selected]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next =
      e.key === 'ArrowDown' ? Math.min(last, selected + 1)
      : e.key === 'ArrowUp' ? Math.max(0, selected - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    if (next === selected) return;
    focusNext.current = true;
    onSelect(next);
  };

  const item = ({ plan, index, turns }: WalkthroughStep) => {
    const moves = stepMoves(plan);
    const current = index === selected;
    return (
      <li key={index}>
        <button
          ref={(el) => {
            buttons.current[index] = el;
          }}
          type="button"
          tabIndex={current ? 0 : -1}
          aria-current={current ? 'step' : undefined}
          aria-label={`Step ${index + 1}: ${plan.caseName}. ${turns} ${turns === 1 ? 'move' : 'moves'}: ${formatAlgorithm(moves)}`}
          onClick={() => onSelect(index)}
          className={cx(
            'vx-hit flex w-full flex-col gap-1.5 rounded-lg border-2 p-3 pb-3.5 text-left transition-colors',
            current
              ? 'border-primary border-b-primary-edge bg-primary-soft shadow-[inset_0_-2px_0_0_var(--vx-primary-edge)]'
              : 'border-line-soft border-b-raised-edge bg-raised shadow-[inset_0_-2px_0_0_var(--vx-raised-edge)] hover:bg-well'
          )}
        >
          <span className="flex w-full items-baseline justify-between gap-2 text-xs font-bold text-muted">
            <span className="text-ink">Step {index + 1}</span>
            <span>
              {turns} {turns === 1 ? 'move' : 'moves'}
            </span>
          </span>
          <span className="text-sm text-ink">{plan.caseName}</span>
          <span aria-hidden className="flex flex-wrap gap-1">
            {moves.map((move, i) => (
              <span key={i} className="rounded-sm border border-line-soft bg-well px-1.5 font-mono text-xs leading-5 text-ink">
                {move.notation}
              </span>
            ))}
          </span>
        </button>
      </li>
    );
  };

  return (
    <section aria-labelledby="steps-title" className="flex flex-col gap-3">
      <h2 id="steps-title" className="text-lg leading-tight text-ink">
        All steps
      </h2>
      <p className="text-xs text-muted">Pick a step, or use the arrow keys in the list.</p>
      <ol onKeyDown={onKeyDown} className="flex flex-col gap-4 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
        {walkthrough.stages.map((stage) => (
          <li key={`${stage.stage}-${stage.number}`} className="flex flex-col gap-2">
            <h3 id={`stage-${stage.number}`} className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold text-ink">
              <span>
                Stage {stage.number + 1}: {stage.stageName}
              </span>
              <span className="text-xs font-normal text-muted">{countLabel(stage.turns, stage.steps.length)}</span>
            </h3>
            <ol aria-labelledby={`stage-${stage.number}`} className="flex flex-col gap-2">
              {stage.steps.map(item)}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SolutionWalkthrough({ cube }: { cube: SavedCube }) {
  const settings = useTutorStore((s) => s.profile.settings);
  const token = useTutorStore((s) => s.token);
  const chatVoice = useChatVoice(useCompanion());
  const setSavedCubeMethod = useTutorStore((s) => s.setSavedCubeMethod);
  const lastLayer = settings.lastLayer;
  const [method, setMethod] = useState<SolutionMethod>(cube.lastMethod ?? settings.methodDefault);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [selectedRaw, setSelected] = useState(0);
  const [auto, setAuto] = useState<AutoPlay>('off');
  const [finished, setFinished] = useState(false);
  const [engine, setEngine] = useState<CubeEngine | null>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  const key = method === 'cfop' ? `cfop-${lastLayer}` : method;
  const result = results[key];
  const walkthrough = result?.status === 'ready' ? result.walkthrough : null;
  const steps = walkthrough?.steps ?? [];
  const selected = Math.min(selectedRaw, Math.max(0, steps.length - 1));
  const step = steps[selected] ?? null;
  const plan = step?.plan ?? null;

  // The cube's state for the worker; a new copy of the same cube (a profile reload) is not a new
  // solution.
  const stateRef = useRef(cube.state);
  useEffect(() => {
    stateRef.current = cube.state;
  });

  useEffect(() => {
    if (results[key]) return;
    let live = true;
    computeWalkthrough(stateRef.current, method, lastLayer).then(
      (w) => live && setResults((r) => ({ ...r, [key]: { status: 'ready', walkthrough: w } })),
      (error: unknown) => {
        console.warn('[Cubyntra] Working out the solution failed:', error);
        if (live) {
          setResults((r) => ({
            ...r,
            [key]: { status: 'error', message: 'The solution could not be worked out. Try again, or pick another method.' },
          }));
        }
      }
    );
    return () => {
      live = false;
    };
  }, [key, method, lastLayer, results]);

  // Play all: the latest values for the twin's callbacks.
  const autoRef = useRef<AutoPlay>(auto);
  const changeAuto = useCallback((next: AutoPlay) => {
    autoRef.current = next;
    setAuto(next);
  }, []);
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  });

  /** A step played to the end: during Play all, go on to the next one, or finish. */
  const onStepPlayed = useCallback(
    (played: StepPlan) => {
      if (autoRef.current !== 'playing') return;
      const all = stepsRef.current;
      const index = all.findIndex((s) => s.plan === played);
      if (index >= 0 && index < all.length - 1) {
        setSelected(index + 1);
      } else {
        changeAuto('off');
        setFinished(true);
      }
    },
    [changeAuto]
  );

  // During Play all every step starts playing once the twin shows it (the twin loads the step
  // in its own effect, which runs before this one).
  useEffect(() => {
    if (auto !== 'playing' || !engine || !plan) return;
    void engine.playback.play();
  }, [auto, plan, engine]);

  // The twin's own pause (or a step forward or back) pauses Play all too.
  useEffect(() => {
    const playback = engine?.playback;
    if (!playback) return;
    let prev = playback.getSnapshot();
    return playback.subscribe((next) => {
      if (autoRef.current === 'playing' && prev.playing && !next.playing && next.moves === prev.moves && next.index < next.total) {
        changeAuto('paused');
      }
      prev = next;
    });
  }, [engine, changeAuto]);

  useWalkthroughVoice(engine?.playback ?? null, plan, auto === 'playing');
  useWakeLock(auto === 'playing');

  const select = (index: number) => {
    changeAuto('off');
    setFinished(false);
    setSelected(index);
  };

  const switchMethod = (next: SolutionMethod) => {
    if (next === method) return;
    changeAuto('off');
    setFinished(false);
    setSelected(0);
    setCopy('idle');
    setMethod(next);
    setSavedCubeMethod(cube.id, next);
  };

  const playAll = () => {
    if (finished || (plan && selected === steps.length - 1 && engine?.playback.getSnapshot().index === stepMoves(plan).length)) {
      setSelected(0);
    }
    setFinished(false);
    changeAuto('playing');
  };

  const pause = () => {
    changeAuto('paused');
    engine?.playback.pause();
  };

  const stop = () => {
    changeAuto('off');
    engine?.playback.pause();
  };

  const copyAll = async () => {
    if (!walkthrough) return;
    try {
      await navigator.clipboard.writeText(solutionText(walkthrough, cube.name));
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };

  const retry = () =>
    setResults((r) => {
      const rest = { ...r };
      delete rest[key];
      return rest;
    });

  const stageOf = useMemo(() => {
    const map = new Map<number, { number: number; count: number }>();
    for (const stage of walkthrough?.stages ?? []) {
      for (const s of stage.steps) map.set(s.index, { number: stage.number, count: walkthrough!.stages.length });
    }
    return map;
  }, [walkthrough]);

  const loading = !result;
  const stage = step ? stageOf.get(step.index) : undefined;
  const last = selected === steps.length - 1;
  const liveMessage = finished
    ? 'Solved. Every step has been played.'
    : auto === 'playing' && step
      ? `Playing all steps: step ${selected + 1} of ${steps.length}.`
      : auto === 'paused'
        ? 'Play all is paused.'
        : '';

  return (
    <PageContainer width="xl" className="gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8">
      <header className="flex flex-col gap-3 lg:col-start-2 lg:row-start-1">
        <BlockLink href="/cubes" variant="ghost" size="sm" className="self-start" icon={<ArrowLeft aria-hidden className="h-4 w-4" />}>
          My cubes
        </BlockLink>
        <div className="flex flex-col gap-1">
          <h1 className="break-words text-3xl font-black leading-tight tracking-tight text-ink">{cube.name}</h1>
          <p className="text-sm text-muted">
            <time dateTime={cube.scannedAt}>{shortDateTime(new Date(cube.scannedAt))}</time> · {SOURCE_LABEL[cube.source]}
          </p>
        </div>
        <SegmentedControl label="Solution" value={method} options={METHOD_OPTIONS} onChange={switchMethod} />
        {method === 'fewest' && (
          <p className="text-xs leading-relaxed text-muted">
            A computer solution: the short sequence the solver found, not a method a person follows. Good for checking, hard to learn from.
          </p>
        )}
        {method === 'cfop' && (
          <p className="text-xs text-muted">{lastLayer === 'full' ? 'Full last layer (one OLL, one PLL).' : '2-look last layer.'} Change it in Settings.</p>
        )}
        {walkthrough && (
          <section aria-label="Summary" className="vx-well flex flex-col gap-2 p-3">
            <p className="text-sm text-ink">
              <span className="font-display text-2xl font-black leading-none">{walkthrough.totalTurns}</span> moves ·{' '}
              <span className="font-display text-2xl font-black leading-none">{walkthrough.steps.length}</span> steps
            </p>
            <ul aria-label="Moves per stage" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              {walkthrough.stages.map((s) => (
                <li key={`${s.stage}-${s.number}`}>
                  {s.stageName}: {s.turns}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <BlockButton size="sm" variant="ghost" onClick={() => void copyAll()} icon={<ClipboardCopy aria-hidden className="h-4 w-4" />}>
                Copy all moves
              </BlockButton>
              <span role="status" className="text-xs text-muted">
                {copy === 'copied' ? 'Copied, grouped by stage.' : copy === 'failed' ? 'Could not copy: the browser blocked the clipboard.' : ''}
              </span>
            </div>
          </section>
        )}
      </header>

      <div
        aria-busy={loading}
        className="relative flex flex-col lg:sticky lg:top-8 lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:min-h-[560px]"
      >
        <TeachingTwin
          plan={plan}
          plainLanguage={settings.plainLanguage}
          stickerLetters={settings.stickerLetters}
          onStepPlayed={onStepPlayed}
          onEngineChange={setEngine}
          movesHidden={!plan}
          className="flex-1"
        />
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-panel">
            <Busy label={`Working out the ${SOLUTION_TITLE[method]} solution`} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
        {result?.status === 'error' && (
          <Panel role="alert" className="flex flex-col gap-4 p-6">
            <div className="flex items-start gap-3">
              <span aria-hidden data-variant="danger" className="vx-block flex h-11 w-11 shrink-0 items-center justify-center pb-0.5">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <p className="text-sm text-ink">{result.message}</p>
            </div>
            <BlockButton variant="primary" className="self-start" onClick={retry} icon={<RefreshCw aria-hidden className="h-4 w-4" />}>
              Try again
            </BlockButton>
          </Panel>
        )}

        {walkthrough && steps.length === 0 && (
          <Panel role="status" className="p-6 text-sm text-ink">
            This cube is already solved: there is nothing to walk through.
          </Panel>
        )}

        {step && plan && (
          <Panel as="section" aria-labelledby="step-title" className="flex flex-col gap-3">
            <p className="flex flex-wrap justify-between gap-2 text-xs font-bold text-muted">
              <span>
                Stage {(stage?.number ?? 0) + 1} of {stage?.count ?? 1}
              </span>
              <span className="font-mono">
                Step {selected + 1} of {steps.length}
              </span>
            </p>
            <div className="flex flex-col gap-1">
              <h2 id="step-title" className="text-2xl leading-tight text-ink">
                {plan.stageName}
              </h2>
              <p className="text-sm text-muted">{plan.caseName}</p>
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              <div>
                <dt className="text-xs font-bold text-muted">Goal</dt>
                <dd className="text-ink">{plan.facts.goal}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-muted">What to look for</dt>
                <dd className="text-ink">{plan.facts.lookFor}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-muted">Why it works</dt>
                <dd className="text-ink">{plan.facts.why}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 pt-1">
              <BlockButton
                size="sm"
                disabled={selected === 0}
                onClick={() => select(selected - 1)}
                icon={<ChevronLeft aria-hidden className="h-4 w-4" />}
              >
                Previous step
              </BlockButton>
              <BlockButton size="sm" disabled={last} onClick={() => select(selected + 1)} icon={<ChevronRight aria-hidden className="h-4 w-4" />}>
                Next step
              </BlockButton>
              {auto === 'playing' ? (
                <BlockButton size="sm" variant="primary" onClick={pause} icon={<Pause aria-hidden className="h-4 w-4" />}>
                  Pause all
                </BlockButton>
              ) : (
                <BlockButton
                  size="sm"
                  variant="primary"
                  disabled={!engine}
                  onClick={auto === 'paused' ? () => changeAuto('playing') : playAll}
                  icon={<Play aria-hidden className="h-4 w-4" />}
                >
                  {auto === 'paused' ? 'Resume all' : 'Play all'}
                </BlockButton>
              )}
              {auto !== 'off' && (
                <BlockButton size="sm" variant="ghost" onClick={stop} icon={<Square aria-hidden className="h-4 w-4" />}>
                  Stop
                </BlockButton>
              )}
            </div>
            {finished && <p className="text-sm font-bold text-ink">Solved! That is the whole solution.</p>}
            <p role="status" className="sr-only">
              {liveMessage}
            </p>
            <CoachChat plan={plan} token={token} voice={chatVoice} collapsible className="border-t-2 border-line-soft pt-3" />
          </Panel>
        )}
      </div>

      {walkthrough && steps.length > 0 && (
        <div className="lg:col-start-2 lg:row-start-3">
          <StepList walkthrough={walkthrough} selected={selected} onSelect={select} />
        </div>
      )}
    </PageContainer>
  );
}

export function CubeSolutionView({ id }: { id: string }) {
  const cube = useTutorStore((s) => s.profile.savedCubes.find((c) => c.id === id) ?? null);
  const profileStatus = useTutorStore((s) => s.profileStatus);
  if (profileStatus === 'idle' || profileStatus === 'loading') {
    return (
      <PageContainer width="md">
        <h1 className="sr-only">Cube solution</h1>
        <Busy label="Loading your cube" />
      </PageContainer>
    );
  }
  if (!cube) return <CubeNotFound />;
  return <SolutionWalkthrough key={cube.id} cube={cube} />;
}
