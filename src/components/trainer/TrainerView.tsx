'use client';

/**
 * Cubyntra - Algorithm trainer
 * Necookie Labs (c) 2026
 *
 * One case at a time: set it up on a solved cube, name it, solve it, then say how it went
 * (Got it / Missed it) or let the camera check it. Missed cases come back within two drills,
 * known ones much later (Leitner boxes, `src/learn/leitner.ts`). The name, the algorithm and the
 * coach stay hidden until the student asks for them, so the drill really is recognition first.
 *
 * Phone: set picker, the twin, then the drill card. Desktop: the twin on the left, the drill on
 * the right, the case grid under both.
 */

import React, { useState } from 'react';
import { Camera, Check, Eye, ListOrdered, MessageSquare, RotateCcw, X } from 'lucide-react';
import { formatAlgorithm, invertAlgorithm } from '@/cube/transforms';
import type { FaceObservation } from '@/tutor/types';
import { applyTileEdits, type TileEdit } from '@/tutor/checkpoint';
import { checkCheckpoint, confirmCheckpointByHand, type CheckpointOutcome } from '@/app-shell/checkpointAdapter';
import { TRAINER_SETS, trainerSet, type TrainerCase } from '@/learn/trainerSets';
import { buildDrill, randomAuf, type Drill } from '@/learn/drill';
import { nextCase, setProgress } from '@/learn/leitner';
import type { TrainerSetId } from '@/learn/types';
import { useTutorStore } from '@/stores/useTutorStore';
import { TeachingTwin } from '@/components/twin/TeachingTwin';
import { CoachPanel } from '@/components/solve/CoachPanel';
import { CheckpointSheetView } from '@/components/solve/CheckpointSheet';
import { CaseLegend, CaseTiles, caseLevel } from '@/components/learn/CaseTiles';
import { BlockButton, Chip, Panel, cx } from '@/components/ui';
import { PageContainer, PageHeader } from '@/components/shell/Page';

const ALL = '__all__';

const LEVEL_LABEL = { new: 'New', drilling: 'Drilling', learned: 'Learned', solid: 'Known well' } as const;

interface DrillSlot {
  key: string;
  drill: Drill;
}

interface Session {
  got: number;
  missed: number;
}

function SetPicker({ value, onChange }: { value: TrainerSetId; onChange: (id: TrainerSetId) => void }) {
  const cards = useTutorStore((s) => s.profile.trainer.cards);
  return (
    <div role="radiogroup" aria-label="Algorithm set" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {TRAINER_SETS.map((set) => {
        const active = set.id === value;
        const { learned, total } = setProgress({ turn: 0, cards, set: null }, set.cases.map((c) => c.id));
        return (
          <button
            key={set.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(set.id)}
            className={cx(
              'flex min-h-[88px] flex-col items-start justify-between gap-2 border-2 border-line p-3 pb-4 text-left shadow-[inset_0_-4px_0_0_var(--vx-panel-edge),4px_4px_0_0_var(--vx-shadow)]',
              active ? 'bg-leaf-soft' : 'bg-panel hover:bg-well'
            )}
          >
            <span className="text-sm font-bold leading-tight text-ink">{set.name}</span>
            <span className="flex w-full flex-col gap-1">
              <span aria-hidden className="block h-2 w-full border-2 border-line bg-well">
                <span className="block h-full bg-leaf" style={{ width: `${(learned / total) * 100}%` }} />
              </span>
              <span className="font-mono text-xs text-muted">
                {learned}/{total} learned
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GroupFilter({
  groups,
  value,
  onChange,
}: {
  groups: readonly string[];
  value: string;
  onChange: (group: string) => void;
}) {
  if (groups.length < 2) return null;
  return (
    <div role="group" aria-label="Filter by group" className="flex flex-wrap gap-2">
      {[ALL, ...groups].map((g) => (
        <BlockButton
          key={g}
          size="sm"
          variant={g === value ? 'primary' : 'secondary'}
          aria-pressed={g === value}
          onClick={() => onChange(g)}
        >
          {g === ALL ? 'All' : g}
        </BlockButton>
      ))}
    </div>
  );
}

/** One numbered row of the drill card. */
function DrillStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-line bg-well font-mono text-xs font-bold text-ink"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <h3 className="font-sans text-sm font-bold text-ink">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function Notation({ moves, label }: { moves: string; label: string }) {
  return (
    <p aria-label={label} className="vx-well break-words p-2 font-mono text-sm font-bold leading-relaxed text-ink">
      {moves}
    </p>
  );
}

export function TrainerView() {
  const token = useTutorStore((s) => s.token);
  const settings = useTutorStore((s) => s.profile.settings);
  const palette = useTutorStore((s) => s.profile.palette);
  const savedSet = useTutorStore((s) => s.profile.trainer.set);
  const cards = useTutorStore((s) => s.profile.trainer.cards);
  const { answerTrainerCase, setTrainerSet } = useTutorStore.getState();

  const [chosenSet, setChosenSet] = useState<TrainerSetId | null>(null);
  const setId = chosenSet ?? savedSet ?? 'beginner';
  const set = trainerSet(setId);
  const [groupChoice, setGroupChoice] = useState<{ set: TrainerSetId; group: string }>({ set: setId, group: ALL });
  const group = groupChoice.set === setId && set.groups.includes(groupChoice.group) ? groupChoice.group : ALL;
  const pool = set.cases.filter((c) => group === ALL || c.group === group);
  const key = `${setId}|${group}`;

  // The first drill of a set is planned during render without a random top turn, so the server
  // and the browser draw the same cube; later drills get their random turn from a click.
  const firstDrill = (): DrillSlot => {
    const trainer = useTutorStore.getState().profile.trainer;
    const id = nextCase(trainer, pool.map((c) => c.id)) ?? pool[0].id;
    return { key, drill: buildDrill(pool.find((c) => c.id === id)!, 0) };
  };
  const [slot, setSlot] = useState<DrillSlot>(firstDrill);
  const [revealName, setRevealName] = useState(false);
  const [revealMoves, setRevealMoves] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [check, setCheck] = useState<'closed' | 'checking' | 'celebrate'>('closed');
  const [observations, setObservations] = useState<FaceObservation[]>([]);
  const [outcome, setOutcome] = useState<CheckpointOutcome | null>(null);
  const [session, setSession] = useState<Session>({ got: 0, missed: 0 });

  const resetDrillUi = () => {
    setRevealName(false);
    setRevealMoves(false);
    setCoachOpen(false);
    setCheck('closed');
    setObservations([]);
    setOutcome(null);
  };

  // A new set or group starts with its own first drill (state adjusted during render).
  if (slot.key !== key) {
    setSlot(firstDrill());
    resetDrillUi();
  }

  const { drill } = slot;
  const c: TrainerCase = drill.case;
  const plan = drill.plan;
  const setup = formatAlgorithm(invertAlgorithm([...plan.setupMoves, ...plan.algorithm]));
  const card = cards[c.id];

  const show = (next: TrainerCase) => {
    setSlot({ key, drill: buildDrill(next, randomAuf(next)) });
    resetDrillUi();
  };

  const answer = (correct: boolean) => {
    answerTrainerCase(c.id, correct);
    setSession((s) => (correct ? { ...s, got: s.got + 1 } : { ...s, missed: s.missed + 1 }));
    const trainer = useTutorStore.getState().profile.trainer;
    const id = nextCase(trainer, pool.map((x) => x.id), c.id) ?? c.id;
    show(pool.find((x) => x.id === id)!);
  };

  const pickSet = (id: TrainerSetId) => {
    setChosenSet(id);
    setTrainerSet(id);
  };

  const record = (next: CheckpointOutcome) => {
    setOutcome(next);
    if (next.result.status === 'match') setCheck('celebrate');
    else if (next.result.status === 'mismatch') setCheck('closed');
  };

  const onObservation = (o: FaceObservation) => {
    const next = [...observations.filter((x) => x.face !== o.face), o];
    setObservations(next);
    record(checkCheckpoint(plan, next));
  };

  const onEditTiles = (face: FaceObservation['face'], edits: readonly TileEdit[]) => {
    const next = observations.map((o) => (o.face === face ? applyTileEdits(o, edits) : o));
    setObservations(next);
    record(checkCheckpoint(plan, next));
  };

  const mismatch = check === 'closed' && outcome?.result.status === 'mismatch' ? outcome : null;
  const level = caseLevel(card);

  return (
    <PageContainer width="xl" className="gap-6">
      <PageHeader
        title="Trainer"
        lede="One case at a time. Name it, solve it, check it. Missed cases come back sooner."
        actions={
          <p className="font-mono text-xs text-muted" aria-live="polite">
            {session.got + session.missed > 0 ? `This session: ${session.got} got, ${session.missed} missed` : null}
          </p>
        }
      />

      <SetPicker value={setId} onChange={pickSet} />
      <GroupFilter groups={set.groups} value={group} onChange={(g) => setGroupChoice({ set: setId, group: g })} />

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8">
        <TeachingTwin
          plan={plan}
          movesHidden={!revealMoves}
          plainLanguage={settings.plainLanguage}
          stickerLetters={settings.stickerLetters}
          className="lg:sticky lg:top-8 lg:min-h-[520px]"
        />

        <div className="flex flex-col gap-4">
          <Panel as="section" aria-labelledby="drill-title" className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="drill-title" className="text-lg leading-tight text-ink">
                {revealName ? c.name : 'Which case is this?'}
              </h2>
              <Chip tone={level === 'new' ? 'neutral' : 'leaf'}>{LEVEL_LABEL[level]}</Chip>
            </div>

            <ol className="flex flex-col gap-4">
              <DrillStep n={1} title="Set it up">
                <p className="text-sm text-muted">
                  Hold a solved cube with {c.top} on top and green in front, then do:
                </p>
                <Notation moves={setup} label="Setup moves" />
              </DrillStep>

              <DrillStep n={2} title="Name it">
                {revealName ? (
                  <div className="flex flex-col gap-2">
                    <Chip className="w-fit">{c.group}</Chip>
                    <p className="text-sm leading-relaxed text-ink">{c.recognition}</p>
                  </div>
                ) : (
                  <BlockButton
                    size="sm"
                    className="w-fit"
                    icon={<Eye aria-hidden className="h-4 w-4" />}
                    onClick={() => setRevealName(true)}
                  >
                    Show the name
                  </BlockButton>
                )}
              </DrillStep>

              <DrillStep n={3} title="Solve it">
                {revealMoves ? (
                  <Notation moves={c.algorithm} label="Algorithm" />
                ) : (
                  <p className="text-sm text-muted">Do the algorithm on your cube from memory.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!revealMoves && (
                    <BlockButton
                      size="sm"
                      icon={<ListOrdered aria-hidden className="h-4 w-4" />}
                      onClick={() => setRevealMoves(true)}
                    >
                      Show the algorithm
                    </BlockButton>
                  )}
                  <BlockButton
                    size="sm"
                    variant="ghost"
                    aria-pressed={coachOpen}
                    icon={<MessageSquare aria-hidden className="h-4 w-4" />}
                    onClick={() => setCoachOpen((o) => !o)}
                  >
                    Ask the coach
                  </BlockButton>
                </div>
              </DrillStep>

              <DrillStep n={4} title="Check it">
                <div className="grid grid-cols-2 gap-2">
                  <BlockButton variant="primary" icon={<Check aria-hidden className="h-4 w-4" />} onClick={() => answer(true)}>
                    Got it
                  </BlockButton>
                  <BlockButton icon={<X aria-hidden className="h-4 w-4" />} onClick={() => answer(false)}>
                    Missed it
                  </BlockButton>
                </div>
                <BlockButton
                  size="sm"
                  variant="ghost"
                  className="w-fit"
                  icon={<Camera aria-hidden className="h-4 w-4" />}
                  onClick={() => {
                    setObservations([]);
                    setOutcome(null);
                    setCheck('checking');
                  }}
                >
                  Check with the camera
                </BlockButton>
              </DrillStep>
            </ol>

            {mismatch && (
              <div role="alert" className="flex flex-col gap-3 border-2 border-warn-edge bg-warn-soft p-3">
                <p className="text-sm font-bold text-ink">Not solved yet.</p>
                <p className="text-sm text-ink">
                  {mismatch.diagnosis?.likelyMistakes[0]?.description ?? mismatch.result.message}
                </p>
                <div className="flex flex-wrap gap-2">
                  <BlockButton size="sm" icon={<RotateCcw aria-hidden className="h-4 w-4" />} onClick={() => setCheck('checking')}>
                    Check again
                  </BlockButton>
                  <BlockButton size="sm" onClick={() => answer(false)}>
                    Count it as missed
                  </BlockButton>
                </div>
              </div>
            )}
          </Panel>

          {coachOpen && <CoachPanel plan={plan} token={token} attempts={[]} />}
        </div>
      </div>

      <section aria-labelledby="cases-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cases-title" className="text-lg leading-tight text-ink">
            {group === ALL ? set.name : group}
          </h2>
          <CaseLegend />
        </div>
        <p className="text-sm text-muted">Tap a case to drill it next.</p>
        <CaseTiles
          cases={pool}
          cards={cards}
          label={`Cases in ${set.name}`}
          currentId={c.id}
          onSelect={(id) => show(pool.find((x) => x.id === id)!)}
        />
      </section>

      <CheckpointSheetView
        plan={plan}
        mode={check}
        outcome={outcome}
        palette={palette}
        letters={settings.stickerLetters}
        earned={session.got}
        onObservation={onObservation}
        onEditTiles={onEditTiles}
        onConfirmByHand={() => record(confirmCheckpointByHand(plan))}
        onCancel={() => setCheck('closed')}
        onAdvance={() => answer(true)}
        doneTitle="Case solved"
        nextLabel="Next case"
      />
    </PageContainer>
  );
}
