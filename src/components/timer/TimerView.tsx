'use client';

/**
 * Cubyntra - Solve timer
 * Necookie Labs (c) 2026
 *
 * A scramble (notation and the twin), then the pad: tap to start the 15-second inspection, hold
 * until the pad turns green, let go to start, tap to stop. Space does the same on a keyboard (and
 * Enter on the focused pad); Escape cancels. The 8 s and 12 s calls show on the pad; starting late adds +2 or makes a DNF
 * (WCA rules, `src/learn/timer.ts`). Best single, ao5 and ao12 come from the saved history.
 */

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { formatAlgorithm, parseAlgorithm } from '@/cube/transforms';
import { generateScramble, scrambledState } from '@/learn/scramble';
import {
  INITIAL_TIMER,
  bestAverage,
  bestSingle,
  currentAverage,
  formatAverage,
  formatSolve,
  formatTime,
  inspectionCue,
  inspectionSecondsLeft,
  timerReducer,
  type InspectionCue,
  type TimerEvent,
  type TimerMachine,
} from '@/learn/timer';
import type { Penalty } from '@/learn/types';
import { useTutorStore } from '@/stores/useTutorStore';
import { CubeVisualizer } from '@/components/cube/CubeVisualizer';
import { BlockButton, Chip, Panel, cx } from '@/components/ui';
import { PageContainer, PageHeader, PageSection } from '@/components/shell/Page';

const noSubscription = () => () => {};
const noScramble = () => null;
let testScramble: string | null = null;

/** Lets tests start every visit from a known scramble (null: random again). */
export function setFirstScrambleForTests(scramble: string | null): void {
  testScramble = scramble;
}

/**
 * The first scramble of this visit: a new random one each time the timer opens, drawn in the
 * browser only (the server, and so hydration, shows none) and kept for the life of the screen.
 */
function useFirstScramble(): string | null {
  const [box] = useState<{ value: string | null }>(() => ({ value: null }));
  const read = useCallback(() => (box.value ??= testScramble ?? formatAlgorithm(generateScramble())), [box]);
  return useSyncExternalStore(noSubscription, read, noScramble);
}

const CUE_TEXT: Record<InspectionCue, string> = {
  none: 'Inspecting',
  '8s': '8 seconds',
  '12s': '12 seconds',
  'plus-two': 'Start now: +2',
  dnf: 'DNF',
};

const PAD_TONE: Record<TimerMachine['phase'], string> = {
  idle: 'bg-panel',
  inspecting: 'bg-well',
  holding: 'bg-warn-soft',
  armed: 'bg-success',
  running: 'bg-panel',
  stopping: 'bg-panel',
};

/** True for elements that use Space themselves. */
function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button, a, input, select, textarea, [role="radio"]'));
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="vx-panel flex flex-col gap-1 p-4">
      <span className="font-mono text-2xl font-bold tabular-nums text-ink">{value}</span>
      <span className="text-xs font-bold text-muted">{label}</span>
    </div>
  );
}

export function TimerView() {
  const history = useTutorStore((s) => s.profile.timer.history);
  const letters = useTutorStore((s) => s.profile.settings.stickerLetters);
  const { addTimerSolve, setLastTimerPenalty, deleteLastTimerSolve } = useTutorStore.getState();

  const initial = useFirstScramble();
  const [override, setOverride] = useState<string | null>(null);
  const scramble = override ?? initial;
  const [machine, setMachine] = useState<TimerMachine>(INITIAL_TIMER);
  const [now, setNow] = useState(0);
  const machineRef = useRef(machine);
  const scrambleRef = useRef(scramble);
  useEffect(() => {
    scrambleRef.current = scramble;
  }, [scramble]);

  const send = useCallback(
    (event: TimerEvent) => {
      const before = machineRef.current;
      const next = timerReducer(before, event);
      if (next === before) return;
      machineRef.current = next;
      setMachine(next);
      if ('at' in event) setNow(event.at);
      if (next.result && next.result !== before.result) {
        addTimerSolve({
          ms: next.result.ms,
          penalty: next.result.penalty,
          at: new Date().toISOString(),
          scramble: scrambleRef.current ?? '',
        });
        setOverride(formatAlgorithm(generateScramble()));
      }
    },
    [addTimerSolve]
  );

  // Ticks while inspecting or solving: the clock on screen, arming and the 17-second DNF.
  const active = machine.phase !== 'idle' && machine.phase !== 'stopping';
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const loop = () => {
      send({ type: 'tick', at: performance.now() });
      setNow(performance.now());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active, send]);

  // Space holds and releases like the pad; Escape cancels.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        send({ type: 'cancel' });
        return;
      }
      if (e.code !== 'Space' || isControl(e.target)) return;
      e.preventDefault();
      if (!e.repeat) send({ type: 'press', at: performance.now() });
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isControl(e.target)) return;
      e.preventDefault();
      send({ type: 'release', at: performance.now() });
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [send]);

  const { phase } = machine;
  const inspecting = phase === 'inspecting' || phase === 'holding' || phase === 'armed';
  const elapsedInspection = inspecting && machine.inspectionStart !== null ? Math.max(0, now - machine.inspectionStart) : 0;
  const cue = inspectionCue(elapsedInspection);
  const last = history[history.length - 1] ?? null;

  let big: string;
  let caption: string;
  if (phase === 'running' && machine.startedAt !== null) {
    big = formatTime(now - machine.startedAt);
    caption = 'Tap or press space to stop';
  } else if (inspecting) {
    big = cue === 'plus-two' || cue === 'dnf' ? CUE_TEXT[cue] : String(inspectionSecondsLeft(elapsedInspection));
    caption = phase === 'armed' ? 'Let go to start' : phase === 'holding' ? 'Keep holding…' : 'Hold to get ready';
  } else {
    big = machine.result ? formatSolve(machine.result) : '0.00';
    caption = machine.result ? 'Tap to inspect the next scramble' : 'Tap or press space to start inspecting';
  }

  const togglePenalty = (penalty: Penalty) => {
    if (!last) return;
    setLastTimerPenalty(last.penalty === penalty ? 'none' : penalty);
  };

  const best = bestSingle(history);
  const recent = history.slice(-12).reverse();
  const state = scramble ? scrambledState(parseAlgorithm(scramble)) : null;

  return (
    <PageContainer width="lg" className="gap-8">
      <PageHeader
        title="Timer"
        lede="Fifteen seconds to look, then solve. Hold until the pad turns green, let go to start."
      />

      <Panel as="section" aria-labelledby="scramble-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="scramble-title" className="text-lg leading-tight text-ink">
            Scramble
          </h2>
          <BlockButton
            size="sm"
            variant="ghost"
            disabled={phase !== 'idle'}
            icon={<RefreshCw aria-hidden className="h-4 w-4" />}
            onClick={() => setOverride(formatAlgorithm(generateScramble()))}
          >
            New scramble
          </BlockButton>
        </div>
        <p aria-label="Scramble moves" className="vx-well min-h-12 rounded-md p-3 font-mono text-base font-bold leading-relaxed text-ink">
          {scramble ?? ' '}
        </p>
        <p className="text-sm text-muted">White on top, green in front.</p>
        {state && (
          <CubeVisualizer state={state} stickerLetters={letters} showControls={false} className="h-56 sm:h-64" />
        )}
      </Panel>

      <div
        role="button"
        tabIndex={0}
        aria-label="Timer pad"
        aria-describedby="timer-caption"
        data-phase={phase}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          send({ type: 'press', at: performance.now() });
        }}
        onPointerUp={() => send({ type: 'release', at: performance.now() })}
        onPointerCancel={() => send({ type: 'release', at: performance.now() })}
        // Enter works the pad like Space when it has focus (Space works anywhere on the page).
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (!e.repeat) send({ type: 'press', at: performance.now() });
        }}
        onKeyUp={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          send({ type: 'release', at: performance.now() });
        }}
        className={cx(
          'flex min-h-[280px] cursor-pointer touch-none flex-col items-center justify-center gap-4 rounded-2xl border-2 border-line p-6 text-center shadow-block transition-colors duration-100 select-none sm:min-h-[320px]',
          PAD_TONE[phase]
        )}
      >
        {inspecting && (
          <Chip tone={cue === 'none' ? 'neutral' : cue === '8s' ? 'success' : cue === 'dnf' ? 'danger' : 'warn'}>
            {CUE_TEXT[cue]}
          </Chip>
        )}
        <p
          aria-live={phase === 'running' ? 'off' : 'polite'}
          className={cx(
            'font-mono font-bold tabular-nums leading-none',
            phase === 'armed' ? 'text-on-success' : 'text-ink',
            big.length > 6 ? 'text-5xl sm:text-6xl' : 'text-7xl sm:text-8xl'
          )}
        >
          {big}
        </p>
        <p id="timer-caption" className={cx('text-sm font-bold', phase === 'armed' ? 'text-on-success' : 'text-muted')}>
          {caption}
        </p>
      </div>

      {last && phase === 'idle' && (
        <div role="group" aria-label="Last solve" className="-mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm text-muted">
            Last solve <span className="font-mono font-bold text-ink">{formatSolve(last)}</span>
          </span>
          <BlockButton size="sm" aria-pressed={last.penalty === '+2'} onClick={() => togglePenalty('+2')}>
            +2
          </BlockButton>
          <BlockButton size="sm" aria-pressed={last.penalty === 'DNF'} onClick={() => togglePenalty('DNF')}>
            DNF
          </BlockButton>
          <BlockButton size="sm" variant="ghost" icon={<Trash2 aria-hidden className="h-4 w-4" />} onClick={deleteLastTimerSolve}>
            Delete
          </BlockButton>
        </div>
      )}

      <PageSection title="Personal bests">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBlock label="Best single" value={best === null ? '–' : formatTime(best)} />
          <StatBlock label="Best ao5" value={formatAverage(bestAverage(history, 5))} />
          <StatBlock label="Current ao5" value={formatAverage(currentAverage(history, 5))} />
          <StatBlock label="Current ao12" value={formatAverage(currentAverage(history, 12))} />
        </div>
        <p className="text-xs text-muted">
          An average drops the best and the worst solve. One DNF is dropped as the worst; two make the average a DNF.
        </p>
      </PageSection>

      <PageSection title="Recent solves" aside={<span className="font-mono text-xs text-muted">{history.length} saved</span>}>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">Your times appear here.</p>
        ) : (
          <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {recent.map((solve, i) => (
              <li
                key={`${solve.at}-${i}`}
                className={cx(
                  'flex flex-col gap-0.5 rounded-md border-2 p-2.5',
                  i === 0 ? 'border-line bg-panel' : 'border-line-soft bg-well'
                )}
              >
                <span className="font-mono text-xs text-muted">#{history.length - i}</span>
                <span className="font-mono text-base font-bold tabular-nums text-ink">{formatSolve(solve)}</span>
              </li>
            ))}
          </ol>
        )}
      </PageSection>
    </PageContainer>
  );
}
