'use client';

/**
 * Cubyntra - My cubes
 * Necookie Labs (c) 2026
 *
 * Every saved cube (each confirmed scan, and demo cubes the student saved), newest first: a flat
 * net of the scramble, its name, when it was scanned and how. Each one can show its full
 * solution (`/cubes/[id]`), start a guided solve from that scramble with the method chosen on
 * Home, be renamed in place, or be deleted after a confirmation.
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Check, Pencil, Play, ScanLine, Trash2, X } from 'lucide-react';
import { BlockButton, Dialog, Panel } from '@/components/ui';
import { BlockLink } from '@/components/shell/BlockLink';
import { Busy, PageContainer, PageHeader } from '@/components/shell/Page';
import { useTutorStore } from '@/stores/useTutorStore';
import { MAX_CUBE_NAME_LENGTH, MAX_SAVED_CUBES, type SavedCube } from '@/lib/studentProfile';
import { SOURCE_LABEL, shortDateTime } from '@/lib/savedCubes';
import { CubeNet } from './CubeNet';

function RenameForm({ cube, onDone }: { cube: SavedCube; onDone: () => void }) {
  const renameSavedCube = useTutorStore((s) => s.renameSavedCube);
  const [draft, setDraft] = useState(cube.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        renameSavedCube(cube.id, draft);
        onDone();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onDone();
        }
      }}
    >
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-bold text-muted">
        New name
        <input
          id={id}
          ref={inputRef}
          value={draft}
          maxLength={MAX_CUBE_NAME_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          className="h-11 w-full rounded-md border-2 border-line bg-panel px-3 text-base font-normal text-ink"
        />
      </label>
      <BlockButton type="submit" size="sm" variant="primary" disabled={!draft.trim()} icon={<Check aria-hidden className="h-4 w-4" />}>
        Save name
      </BlockButton>
      <BlockButton type="button" size="sm" variant="ghost" onClick={onDone} icon={<X aria-hidden className="h-4 w-4" />}>
        Cancel
      </BlockButton>
    </form>
  );
}

function CubeItem({ cube, onDelete }: { cube: SavedCube; onDelete: (cube: SavedCube) => void }) {
  const router = useRouter();
  const letters = useTutorStore((s) => s.profile.settings.stickerLetters);
  const method = useTutorStore((s) => s.profile.settings.methodDefault);
  const startSolve = useTutorStore((s) => s.startSolve);
  const [renaming, setRenaming] = useState(false);
  const renameRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const titleId = `cube-${cube.id}`;

  // Closing the rename form gives the focus back to its button.
  useEffect(() => {
    if (!renaming && refocus.current) {
      refocus.current = false;
      renameRef.current?.focus();
    }
  }, [renaming]);

  const solveIt = () => {
    void startSolve(cube.state, method);
    router.push('/solve');
  };

  return (
    <li>
      <Panel as="article" aria-labelledby={titleId} className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <CubeNet state={cube.state} letters={letters} label={`Flat view of ${cube.name}`} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="break-words text-xl leading-tight text-ink">
              {cube.name}
            </h2>
            <p className="text-sm text-muted">
              <time dateTime={cube.scannedAt}>{shortDateTime(new Date(cube.scannedAt))}</time> · {SOURCE_LABEL[cube.source]}
            </p>
          </div>
          {renaming ? (
            <RenameForm
              cube={cube}
              onDone={() => {
                refocus.current = true;
                setRenaming(false);
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <BlockLink href={`/cubes/${cube.id}`} variant="primary" size="sm" icon={<BookOpen aria-hidden className="h-4 w-4" />}>
                Show the solution
              </BlockLink>
              <BlockButton size="sm" onClick={solveIt} icon={<Play aria-hidden className="h-4 w-4" />}>
                Solve it with me
              </BlockButton>
              <BlockButton
                ref={renameRef}
                size="sm"
                variant="ghost"
                aria-label={`Rename ${cube.name}`}
                onClick={() => setRenaming(true)}
                icon={<Pencil aria-hidden className="h-4 w-4" />}
              >
                Rename
              </BlockButton>
              <BlockButton
                size="sm"
                variant="ghost"
                aria-label={`Delete ${cube.name}`}
                onClick={() => onDelete(cube)}
                icon={<Trash2 aria-hidden className="h-4 w-4" />}
              >
                Delete
              </BlockButton>
            </div>
          )}
        </div>
      </Panel>
    </li>
  );
}

export function CubesView() {
  const cubes = useTutorStore((s) => s.profile.savedCubes);
  const profileStatus = useTutorStore((s) => s.profileStatus);
  const deleteSavedCube = useTutorStore((s) => s.deleteSavedCube);
  const [deleting, setDeleting] = useState<SavedCube | null>(null);
  const loading = profileStatus === 'idle' || profileStatus === 'loading';

  return (
    <PageContainer width="md">
      <PageHeader
        title="My cubes"
        lede={`Every cube you scan is kept here, newest first (the last ${MAX_SAVED_CUBES}). Walk through its whole solution, or solve it again with the tutor.`}
      />

      {loading ? (
        <Busy label="Loading your cubes" />
      ) : cubes.length === 0 ? (
        <Panel as="section" aria-labelledby="no-cubes" className="flex flex-col items-start gap-4 p-6">
          <h2 id="no-cubes" className="text-xl leading-tight text-ink">
            No saved cubes yet
          </h2>
          <p className="max-w-prose text-sm text-muted">
            Scan your cube and it is saved here, so you can see its whole solution step by step or solve it again later.
          </p>
          <BlockLink href="/scan" variant="primary" size="lg" icon={<ScanLine aria-hidden className="h-5 w-5" />}>
            Scan my cube
          </BlockLink>
        </Panel>
      ) : (
        <ul aria-label="Saved cubes" className="flex flex-col gap-4">
          {cubes.map((cube) => (
            <CubeItem key={cube.id} cube={cube} onDelete={setDeleting} />
          ))}
        </ul>
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this cube?"
        description={deleting ? `“${deleting.name}” is removed from My cubes. Your progress, mastery and streak stay.` : undefined}
        size="sm"
        footer={
          <>
            <BlockButton variant="ghost" data-autofocus onClick={() => setDeleting(null)}>
              Keep it
            </BlockButton>
            <BlockButton
              variant="danger"
              onClick={() => {
                if (deleting) deleteSavedCube(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </BlockButton>
          </>
        }
      />
    </PageContainer>
  );
}
