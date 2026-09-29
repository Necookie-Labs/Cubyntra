'use client';

/**
 * Cubyntra - First-Run Photo Coach
 * Necookie Labs (c) 2026
 *
 * Three short cards shown before the first scan: how to hold the cube, what light works,
 * and the order of the six faces.
 */

import React, { useCallback, useRef, useState } from 'react';
import { COLOR_HEX, SCAN_SEQUENCE } from '@/cube/constants';
import { FaceGuide } from './FaceGuide';
import { ArrowRight, Sun, Zap, Camera } from 'lucide-react';

const SEEN_KEY = 'cubyntra.captureCoach.seen.v1';

/** Whether the coach has been completed on this device. Storage may be unavailable. */
export function hasSeenCaptureCoach(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Private mode or blocked storage: the coach simply shows again next time.
  }
}

interface Card {
  title: string;
  body: string;
  art: React.ReactNode;
}

const first = SCAN_SEQUENCE[0];

const CARDS: Card[] = [
  {
    title: 'Fill the square with one face',
    body: 'Hold the cube about a hand’s length from the lens, face flat to the camera, fingers on the edges.',
    art: <FaceGuide front={first.centerColor} top={first.view.top} right={first.view.right} className="w-28 h-28" />,
  },
  {
    title: 'Soft, even light',
    body: 'Daylight or a bright room works best. Avoid a lamp shining straight at the cube. In a dim room, tap the flash.',
    art: (
      <div className="flex items-center gap-4 text-amber-300">
        <Sun className="w-14 h-14" strokeWidth={1.5} />
        <Zap className="w-10 h-10 text-sky-300" strokeWidth={1.5} />
      </div>
    ),
  },
  {
    title: 'Six faces, one turn at a time',
    body: 'Each step shows how to turn the cube. Hold still and the photo takes itself; your computer reads it in a second.',
    art: (
      <ol className="flex items-center gap-1.5" aria-label="Scan order">
        {SCAN_SEQUENCE.map((step, i) => (
          <li key={step.face} className="flex items-center gap-1.5">
            <span
              className="block w-7 h-7 rounded-md border border-black/40 shadow-inner"
              style={{ backgroundColor: COLOR_HEX[step.centerColor] }}
              title={step.title}
            />
            {i < SCAN_SEQUENCE.length - 1 && <ArrowRight className="w-3 h-3 text-neutral-500" aria-hidden />}
          </li>
        ))}
      </ol>
    ),
  },
];

interface CaptureCoachProps {
  onDone: () => void;
}

/** Horizontal travel, in px, that counts as a swipe between cards. */
const SWIPE_PX = 40;

export const CaptureCoach: React.FC<CaptureCoachProps> = ({ onDone }) => {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  // Only the active card is rendered, so what is on screen always matches the dots and the
  // button, even where smooth scrolling is throttled.
  const goTo = useCallback((i: number) => {
    setIndex(Math.max(0, Math.min(CARDS.length - 1, i)));
  }, []);

  const finish = useCallback(() => {
    markSeen();
    onDone();
  }, [onDone]);

  const isLast = index === CARDS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-title"
      className="absolute inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-md text-white pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-between px-5">
        <span className="text-[11px] font-mono uppercase tracking-widest text-sky-300">Before you start</span>
        <button
          type="button"
          onClick={finish}
          className="min-h-11 px-3 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Skip
        </button>
      </div>

      <div
        className="flex-1 flex items-center justify-center px-8"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          touchStartX.current = null;
          if (dx <= -SWIPE_PX) goTo(index + 1);
          else if (dx >= SWIPE_PX) goTo(index - 1);
        }}
      >
        <section key={index} className="cb-rise flex flex-col items-center gap-6 text-center">
          <div className="h-32 grid place-items-center">{CARDS[index].art}</div>
          <div className="flex flex-col gap-2 max-w-xs">
            <h2 id="coach-title" className="text-xl font-bold tracking-tight">
              {CARDS[index].title}
            </h2>
            <p className="text-sm text-neutral-300 leading-relaxed">{CARDS[index].body}</p>
          </div>
        </section>
      </div>

      <div className="flex flex-col items-center gap-5 px-5">
        <div className="flex items-center gap-2" role="tablist" aria-label="Tips">
          {CARDS.map((card, i) => (
            <button
              key={card.title}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Tip ${i + 1} of ${CARDS.length}`}
              onClick={() => goTo(i)}
              className="p-2"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-200 ${
                  i === index ? 'w-6 bg-white' : 'w-1.5 bg-neutral-600'
                }`}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => (isLast ? finish() : goTo(index + 1))}
          className="w-full max-w-xs min-h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-white text-neutral-950 font-bold text-sm active:scale-[0.98] transition-transform"
        >
          {isLast ? (
            <>
              <Camera className="w-4 h-4" />
              Start scanning
            </>
          ) : (
            <>
              Next
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
