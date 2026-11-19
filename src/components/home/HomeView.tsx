'use client';

/**
 * Cubyntra - Home
 * Necookie Labs (c) 2026
 *
 * Continue the solve in progress, pick a method, glance at progress. One primary action per
 * state: "Continue" when a solve is saved, otherwise "Scan my cube". Once a method is mastered
 * a graduation card suggests the next one (`graduationSuggestion` in src/learn/mastery.ts).
 */

import React, { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, GraduationCap, ScanLine, Shuffle, Smartphone, Target, Timer } from 'lucide-react';
import { BlockButton, Chip, Dialog, Panel, ProgressBlocks, cx } from '@/components/ui';
import { BlockLink } from '@/components/shell/BlockLink';
import { PageContainer, PageHeader, PageSection } from '@/components/shell/Page';
import { methodOptionsFor, useTutorStore } from '@/stores/useTutorStore';
import { METHOD_IDS, METHOD_INFO, methodStages } from '@/app-shell/methodInfo';
import { useStageProgress } from '@/app-shell/useStageProgress';
import { demoCube } from '@/app-shell/demoCube';
import { summarizeProgress } from '@/app-shell/progressSummary';
import { graduationSuggestion, localDay, type GraduationSuggestion } from '@/learn/mastery';
import type { MethodId } from '@/tutor/types';

const noSubscription = () => () => {};
const readToday = () => localDay(new Date());

const GRADUATION: Record<Exclude<GraduationSuggestion, null>, { title: string; body: string; action: string }> = {
  'try-cfop': {
    title: 'Ready for CFOP',
    body: 'You have mastered every stage of the beginner’s method. CFOP solves the cube in fewer moves. You start with the 2-look last layer: four short steps you mostly know already.',
    action: 'Switch to CFOP',
  },
  'full-last-layer': {
    title: 'Ready for the full last layer',
    body: 'You have mastered the 2-look last layer. The full version finishes the cube in two steps instead of four, with 57 OLL and 21 PLL cases to learn. Practise them in the trainer as you go.',
    action: 'Use the full last layer',
  },
};

function GraduationCard() {
  const settings = useTutorStore((s) => s.profile.settings);
  const stages = useTutorStore((s) => s.profile.stats.stages);
  const updateSettings = useTutorStore((s) => s.updateSettings);
  const [dismissed, setDismissed] = useState<GraduationSuggestion>(null);
  const suggestion = graduationSuggestion({ stages, methodDefault: settings.methodDefault, lastLayer: settings.lastLayer });
  if (!suggestion || dismissed === suggestion) return null;
  const text = GRADUATION[suggestion];

  const accept = () =>
    updateSettings(suggestion === 'try-cfop' ? { methodDefault: 'cfop', lastLayer: '2-look' } : { lastLayer: 'full' });

  return (
    <Panel as="section" aria-labelledby="graduation-title" className="vx-place flex flex-col gap-4 p-6 pb-7 sm:flex-row sm:items-start">
      <span aria-hidden data-variant="primary" className="vx-block flex h-12 w-12 shrink-0 items-center justify-center pb-1">
        <GraduationCap className="h-6 w-6" />
      </span>
      <div className="flex flex-col gap-3">
        <h2 id="graduation-title" className="text-2xl leading-tight text-ink">
          {text.title}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted">{text.body}</p>
        <div className="flex flex-wrap items-center gap-3">
          <BlockButton variant="primary" onClick={accept}>
            {text.action}
          </BlockButton>
          {suggestion === 'full-last-layer' && (
            <BlockLink href="/trainer" icon={<Target aria-hidden className="h-4 w-4" />}>
              Open the trainer
            </BlockLink>
          )}
          <BlockButton variant="ghost" onClick={() => setDismissed(suggestion)}>
            Not yet
          </BlockButton>
        </div>
      </div>
    </Panel>
  );
}

function ContinueCard() {
  const solve = useTutorStore((s) => s.profile.currentSolve);
  const abandonSolve = useTutorStore((s) => s.abandonSolve);
  const lastLayer = useTutorStore((s) => s.profile.settings.lastLayer);
  const options = solve ? methodOptionsFor(solve.method, { lastLayer }) : undefined;
  const progress = useStageProgress(solve?.state ?? null, solve?.method ?? null, options);
  const [confirming, setConfirming] = useState(false);
  if (!solve) return null;
  const info = METHOD_INFO[solve.method];
  const stages = methodStages(solve.method, options?.lastLayer);
  const stageName = progress && !progress.done ? stages[progress.stageIndex]?.name : null;

  return (
    <Panel as="section" aria-labelledby="continue-title" className="vx-place flex flex-col gap-4 p-6 pb-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chip tone="leaf">In progress</Chip>
        <span className="font-mono text-xs text-muted">Step {solve.stepIndex + 1}</span>
      </div>
      <div className="flex flex-col gap-1">
        <h2 id="continue-title" className="text-2xl leading-tight text-ink">
          {info.name}
        </h2>
        <p className="text-sm text-muted">{stageName ? `Working on: ${stageName}` : 'Your cube is saved where you left it.'}</p>
      </div>
      {progress && (
        <ProgressBlocks
          total={stages.length}
          done={progress.done ? stages.length : progress.stageIndex}
          label={`${info.name} stages done`}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <BlockLink href="/solve" variant="primary" size="lg" icon={<ArrowRight aria-hidden className="h-5 w-5" />}>
          Continue
        </BlockLink>
        <BlockButton variant="ghost" onClick={() => setConfirming(true)}>
          Discard this solve
        </BlockButton>
      </div>
      {/* One click used to throw the saved solve away for good. */}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Discard this solve?"
        description="Your place in this solve is lost. Your progress, mastery and streak stay."
        size="sm"
        footer={
          <>
            <BlockButton variant="ghost" data-autofocus onClick={() => setConfirming(false)}>
              Keep it
            </BlockButton>
            <BlockButton
              variant="danger"
              onClick={() => {
                setConfirming(false);
                abandonSolve();
              }}
            >
              Discard
            </BlockButton>
          </>
        }
      />
    </Panel>
  );
}

function MethodPicker() {
  const method = useTutorStore((s) => s.profile.settings.methodDefault);
  const updateSettings = useTutorStore((s) => s.updateSettings);

  return (
    <div role="radiogroup" aria-labelledby="section-method" className="grid gap-4 sm:grid-cols-2">
      {METHOD_IDS.map((id) => {
        const info = METHOD_INFO[id];
        const active = id === method;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => updateSettings({ methodDefault: id })}
            className={cx(
              'vx-hit flex flex-col items-start gap-3 border-2 border-line p-4 pb-5 text-left shadow-[inset_0_-4px_0_0_var(--vx-panel-edge),4px_4px_0_0_var(--vx-shadow)]',
              active ? 'bg-leaf-soft' : 'bg-panel hover:bg-well'
            )}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="font-display text-xl leading-none text-ink">{info.name}</span>
              <span
                aria-hidden
                className={cx('h-5 w-5 border-2 border-line', active ? 'bg-leaf shadow-[inset_0_-3px_0_0_var(--vx-leaf-edge)]' : 'bg-well')}
              />
            </span>
            <span className="text-sm font-bold text-ink">{info.summary}</span>
            <span className="text-sm text-muted">{info.detail}</span>
            <span className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted">
              <span aria-hidden className="flex gap-1">
                {info.stages.map((s) => (
                  <span key={s.id} className="h-2 w-2 border border-line-soft bg-well" />
                ))}
              </span>
              {info.stages.length} stages
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="vx-well flex flex-col gap-1 p-3">
      <span className="font-display text-3xl leading-none text-ink">{value}</span>
      <span className="text-xs font-bold text-muted">{label}</span>
    </div>
  );
}

const PRACTICE = [
  { href: '/trainer', label: 'Trainer', blurb: 'Drill the cases you miss.', Icon: Target },
  { href: '/timer', label: 'Timer', blurb: 'Time solves with inspection.', Icon: Timer },
  { href: '/pair', label: 'Pair phone', blurb: 'Use your phone as the camera.', Icon: Smartphone },
] as const;

export function HomeView() {
  const router = useRouter();
  const name = useTutorStore((s) => s.profile.name);
  const profile = useTutorStore((s) => s.profile);
  const today = useSyncExternalStore(noSubscription, readToday, () => null);
  const summary = summarizeProgress(profile, today);
  const hasSolve = useTutorStore((s) => s.profile.currentSolve !== null);
  const method = useTutorStore((s) => s.profile.settings.methodDefault);
  const startSolve = useTutorStore((s) => s.startSolve);

  const tryDemo = (m: MethodId) => {
    void startSolve(demoCube(), m, { demo: true });
    router.push('/solve');
  };

  return (
    <PageContainer width="lg" className="gap-10">
      <PageHeader
        eyebrow={name ? `Hi, ${name}` : 'Cubyntra'}
        title={hasSolve ? 'Ready when you are.' : 'Let’s solve your cube.'}
        lede="Scan your cube, pick a method, and the twin shows every turn. After each step the camera checks you are on track."
      />

      <ContinueCard />

      <GraduationCard />

      <PageSection title="Method" aside={<span className="text-xs text-muted">You can switch any time</span>}>
        <MethodPicker />
        {!hasSolve && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <BlockLink href="/scan" variant="primary" size="lg" icon={<ScanLine aria-hidden className="h-5 w-5" />}>
              Scan my cube
            </BlockLink>
            <BlockButton variant="ghost" icon={<Shuffle aria-hidden className="h-4 w-4" />} onClick={() => tryDemo(method)}>
              Try a demo cube
            </BlockButton>
          </div>
        )}
      </PageSection>

      <PageSection
        title="Progress"
        aside={
          <BlockLink href="/progress" variant="ghost" size="sm">
            See all
          </BlockLink>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={`${summary.blocks}/${summary.totalBlocks}`} label="Stages mastered" />
          <Stat value={summary.streak ?? 0} label={summary.streak === 1 ? 'Day in a row' : 'Days in a row'} />
          <Stat value={summary.casesLearned} label="Cases learned" />
          <Stat value={profile.stats.solvesCompleted} label="Solves" />
        </div>
      </PageSection>

      <PageSection title="More">
        <ul className="grid gap-3 sm:grid-cols-3">
          {PRACTICE.map(({ href, label, blurb, Icon }) => (
            <li key={href}>
              <BlockLink
                href={href}
                className="h-auto w-full justify-start gap-3 whitespace-normal px-3 py-3 pb-4 text-left"
                icon={<Icon aria-hidden className="h-5 w-5 shrink-0" />}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm">{label}</span>
                  <span className="text-xs font-normal text-muted">{blurb}</span>
                </span>
              </BlockLink>
            </li>
          ))}
        </ul>
      </PageSection>

      <p className="border-t-2 border-line-soft pt-4 text-xs leading-relaxed text-muted">
        Camera images never leave the device that took them; a paired phone sends only the colors it
        read. Your profile and the coach’s usage log stay on this computer. With the AI coach on,
        short descriptions of each step (never pictures) go to Anthropic.
      </p>
    </PageContainer>
  );
}
