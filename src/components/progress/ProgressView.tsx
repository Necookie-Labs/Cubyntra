'use client';

/**
 * Cubyntra - Progress
 * Necookie Labs (c) 2026
 *
 * The progress world: one small voxel island per method (a meadow for the beginner's method,
 * sand for CFOP) with a block on every stage mastered, the day streak with the last four weeks,
 * the algorithm collection from the trainer, and the running totals. Mastery is defined in
 * `src/learn/mastery.ts`: 3 of the newest 5 times through a stage without a level-3 hint.
 */

import React, { useSyncExternalStore } from 'react';
import { Flame } from 'lucide-react';
import { useTutorStore } from '@/stores/useTutorStore';
import { METHOD_INFO } from '@/app-shell/methodInfo';
import {
  MASTERY_NEEDED,
  MASTERY_WINDOW,
  currentStreak,
  localDay,
  longestStreak,
  recentDays,
  stageKey,
  stageStatus,
  type StageStatus,
} from '@/learn/mastery';
import { setProgress } from '@/learn/leitner';
import { TRAINER_SETS } from '@/learn/trainerSets';
import type { HintUse } from '@/learn/types';
import type { MethodId } from '@/tutor/types';
import { BlockLink } from '@/components/shell/BlockLink';
import { PageContainer, PageHeader, PageSection } from '@/components/shell/Page';
import { CaseTiles } from '@/components/learn/CaseTiles';
import { Chip, Panel, cx } from '@/components/ui';
import { VoxelWorld, type Biome, type WorldStage } from './VoxelWorld';

/** CFOP's full last-layer stages, shown on the CFOP island once that setting is used. */
const FULL_LAST_LAYER = [
  { id: 'oll', name: 'Yellow top in one look' },
  { id: 'pll', name: 'Top layer in one look' },
];

const noSubscription = () => () => {};
const readToday = () => localDay(new Date());

const STATUS_WORD: Record<StageStatus, string> = { mastered: 'Mastered', started: 'Practising', new: 'Not started' };

function goodRuns(records: readonly HintUse[] | undefined): number {
  return (records ?? []).slice(-MASTERY_WINDOW).filter((h) => h < 3).length;
}

function Island({
  method,
  biome,
  biomeName,
  stages,
  records,
}: {
  method: MethodId;
  biome: Biome;
  biomeName: string;
  stages: readonly { id: string; name: string }[];
  records: Readonly<Record<string, readonly HintUse[]>>;
}) {
  const info = METHOD_INFO[method];
  const world: WorldStage[] = stages.map((s) => ({ ...s, status: stageStatus(records[stageKey(method, s.id)]) }));
  const mastered = world.filter((s) => s.status === 'mastered').length;
  const titleId = `island-${method}`;
  return (
    <Panel as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 id={titleId} className="text-lg leading-tight text-ink">
            {info.name}
          </h3>
          <span className="text-xs font-bold text-muted">{biomeName}</span>
        </div>
        <Chip tone={mastered === world.length ? 'solid' : mastered > 0 ? 'leaf' : 'neutral'}>
          {mastered} of {world.length} mastered
        </Chip>
      </div>
      <div className="flex justify-center px-2 py-2">
        <VoxelWorld stages={world} biome={biome} label={`${info.name}: ${mastered} of ${world.length} stages mastered`} />
      </div>
      <ol aria-label={`${info.name} stages`} className="flex flex-col divide-y-2 divide-line-soft border-t-2 border-line-soft">
        {world.map((stage, i) => (
          <li key={stage.id} className="flex items-center gap-3 py-2 text-sm">
            <span
              aria-hidden
              className={cx(
                'flex h-6 w-6 shrink-0 items-center justify-center border-2 font-mono text-xs font-bold',
                stage.status === 'mastered'
                  ? 'border-line bg-leaf text-on-leaf'
                  : stage.status === 'started'
                    ? 'border-line bg-leaf-soft text-ink'
                    : 'border-line-soft bg-well text-muted'
              )}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 text-ink">{stage.name}</span>
            <span className="shrink-0 text-xs font-bold text-muted">
              {stage.status === 'started'
                ? `${STATUS_WORD.started} ${Math.min(MASTERY_NEEDED, goodRuns(records[stageKey(method, stage.id)]))}/${MASTERY_NEEDED}`
                : STATUS_WORD[stage.status]}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function StreakCalendar({ days, today }: { days: readonly string[]; today: string }) {
  const active = new Set(days);
  const shown = recentDays(today, 28);
  return (
    <ol aria-label="The last four weeks" className="grid w-fit grid-cols-7 gap-1.5">
      {shown.map((day) => {
        const on = active.has(day);
        return (
          <li key={day}>
            <span
              role="img"
              aria-label={`${day}: ${on ? 'practised' : 'no practice'}`}
              title={day}
              className={cx(
                'block h-6 w-6 border-2',
                on ? 'border-line bg-leaf shadow-[inset_0_-3px_0_0_var(--vx-leaf-edge)]' : 'border-line-soft bg-well',
                day === today && 'outline-2 outline-offset-1 outline-ink'
              )}
            />
          </li>
        );
      })}
    </ol>
  );
}

function Summary({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="vx-well flex flex-col gap-1 p-3">
      <span className="font-display text-3xl leading-none text-ink">{value}</span>
      <span className="text-xs font-bold text-muted">{label}</span>
    </div>
  );
}

export function ProgressView() {
  const stats = useTutorStore((s) => s.profile.stats);
  const cards = useTutorStore((s) => s.profile.trainer.cards);
  const lastLayer = useTutorStore((s) => s.profile.settings.lastLayer);
  const today = useSyncExternalStore(noSubscription, readToday, () => null);

  const records = stats.stages;
  const showFull = lastLayer === 'full' || FULL_LAST_LAYER.some((s) => records[stageKey('cfop', s.id)]?.length);
  const cfopStages = showFull ? [...METHOD_INFO.cfop.stages, ...FULL_LAST_LAYER] : METHOD_INFO.cfop.stages;
  const allStages = [
    ...METHOD_INFO.beginner.stages.map((s) => stageKey('beginner', s.id)),
    ...cfopStages.map((s) => stageKey('cfop', s.id)),
  ];
  const blocks = allStages.filter((key) => stageStatus(records[key]) === 'mastered').length;
  const streak = today ? currentStreak(stats.activeDays, today) : 0;
  const learned = TRAINER_SETS.reduce((sum, set) => sum + setProgress({ turn: 0, cards, set: null }, set.cases.map((c) => c.id)).learned, 0);
  const caseTotal = TRAINER_SETS.reduce((sum, set) => sum + set.cases.length, 0);

  return (
    <PageContainer width="xl" className="gap-10">
      <PageHeader title="Progress" lede="A block for every stage you master. Everything is saved on this laptop." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary value={`${blocks}/${allStages.length}`} label="Blocks placed" />
        <Summary value={streak} label={streak === 1 ? 'Day in a row' : 'Days in a row'} />
        <Summary value={learned} label="Cases learned" />
        <Summary value={stats.solvesCompleted} label="Solves" />
      </div>

      <PageSection title="Your world">
        <p className="max-w-prose text-sm text-muted">
          A stage is mastered when {MASTERY_NEEDED} of your last {MASTERY_WINDOW} times through it needed no “Show the
          moves” hint. Asking what to look for or why it works is fine.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <Island method="beginner" biome="meadow" biomeName="Meadow" stages={METHOD_INFO.beginner.stages} records={records} />
          <Island method="cfop" biome="sand" biomeName="Sand" stages={cfopStages} records={records} />
        </div>
      </PageSection>

      <PageSection title="Streak">
        <Panel className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex items-center gap-4">
            <span aria-hidden data-variant={streak > 0 ? 'primary' : 'secondary'} className="vx-block flex h-14 w-14 items-center justify-center pb-1">
              <Flame className="h-6 w-6" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-display text-3xl leading-none text-ink">
                {streak} {streak === 1 ? 'day' : 'days'}
              </p>
              <p className="text-xs text-muted">
                Longest: {longestStreak(stats.activeDays)}. A finished solve or a trainer case counts for the day.
              </p>
            </div>
          </div>
          {today && <StreakCalendar days={stats.activeDays} today={today} />}
        </Panel>
      </PageSection>

      <PageSection
        title="Algorithm collection"
        aside={
          <BlockLink href="/trainer" size="sm" variant="ghost">
            Open the trainer
          </BlockLink>
        }
      >
        <p className="text-sm text-muted">
          {learned} of {caseTotal} cases learned. A case is learned once you get it right twice in a row in the trainer.
        </p>
        <ul className="grid gap-3 md:grid-cols-2">
          {TRAINER_SETS.map((set) => {
            const ids = set.cases.map((c) => c.id);
            const progress = setProgress({ turn: 0, cards, set: null }, ids);
            return (
              <li key={set.id} className="vx-well flex flex-col gap-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-ink">{set.name}</span>
                  <span className="font-mono text-xs text-muted">
                    {progress.learned}/{progress.total}
                  </span>
                </div>
                <CaseTiles cases={set.cases} cards={cards} label={`${set.name} cases`} size="sm" />
              </li>
            );
          })}
        </ul>
      </PageSection>

      <PageSection title="Totals">
        <div className="grid grid-cols-3 gap-3">
          <Summary value={stats.stepsCompleted} label="Steps done" />
          <Summary value={stats.checkpointsPassed} label="Checks passed" />
          <Summary value={stats.solvesCompleted} label="Solves" />
        </div>
      </PageSection>
    </PageContainer>
  );
}
