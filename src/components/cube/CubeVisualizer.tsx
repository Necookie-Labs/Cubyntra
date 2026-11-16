'use client';

/**
 * Cubyntra - Interactive 3D Rubik's Cube Visualizer Component
 * Necookie Labs (c) 2026
 */

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { CubeMove, CubeState } from '@/cube/types';
import { CubeEngine } from '@/three/engine';
import { RotateCcw, Maximize2, Minimize2, Eye } from 'lucide-react';
import { IconButton } from '@/components/ui';

export interface CubeVisualizerProps {
  state: CubeState;
  activeMove?: CubeMove | null;
  className?: string;
  showControls?: boolean;
  /**
   * Called with the engine once it is mounted and with null when it is disposed, for
   * components that drive the teaching aids (e.g. the teaching twin).
   */
  onEngineChange?: (engine: CubeEngine | null) => void;
  /** Color-blind option: a letter (W Y R O B G) on every sticker. Default false. */
  stickerLetters?: boolean;
}

export interface CubeVisualizerRef {
  animateMove: (move: CubeMove, targetState: CubeState, durationMs?: number) => Promise<void>;
  resetCamera: () => void;
  syncState: (state: CubeState) => void;
  /**
   * The live engine, for teaching features (engine.playback, setSpotlight, setSlotOutline,
   * setGhostState, setGrip). Null before mount and after unmount.
   */
  getEngine: () => CubeEngine | null;
}

/** The theme the page is showing, from <html data-theme> (see src/lib/theme.ts). */
function pageTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export const CubeVisualizer = forwardRef<CubeVisualizerRef, CubeVisualizerProps>(
  function CubeVisualizer(
    { state, activeMove, className = '', showControls = true, onEngineChange, stickerLetters = false },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<CubeEngine | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const initialStateRef = useRef(state);
    const onEngineChangeRef = useRef(onEngineChange);
    useEffect(() => {
      onEngineChangeRef.current = onEngineChange;
    });

    useEffect(() => {
      if (!containerRef.current) return;

      const engine = new CubeEngine(containerRef.current);
      engineRef.current = engine;
      engine.syncWithCubeState(initialStateRef.current);

      // Arrows and outlines follow the page theme; it can change while the twin is on screen.
      engine.setTheme(pageTheme());
      const themeObserver = new MutationObserver(() => engine.setTheme(pageTheme()));
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      const resizeObserver = new ResizeObserver(() => {
        engine.resize();
      });
      resizeObserver.observe(containerRef.current);
      onEngineChangeRef.current?.(engine);

      return () => {
        themeObserver.disconnect();
        resizeObserver.disconnect();
        onEngineChangeRef.current?.(null);
        engine.dispose();
        engineRef.current = null;
      };
    }, []);

    // Synchronize sticker colors when state updates externally. Deferred while turns
    // are animating, otherwise the cube would jump to the post-move colors mid-turn.
    useEffect(() => {
      engineRef.current?.requestSync(state);
    }, [state]);

    // Older engines (and test doubles) may not draw letters; skip quietly then.
    useEffect(() => {
      const engine = engineRef.current;
      if (engine && typeof engine.setStickerLetters === 'function') engine.setStickerLetters(stickerLetters);
    }, [stickerLetters]);

    // Update move guidance arrow
    useEffect(() => {
      if (engineRef.current) {
        engineRef.current.setMoveArrow(activeMove || null);
      }
    }, [activeMove]);

    useImperativeHandle(ref, () => ({
      animateMove: async (move: CubeMove, targetState: CubeState, durationMs?: number) => {
        if (engineRef.current) {
          await engineRef.current.animateMove(move, targetState, durationMs);
        }
      },
      resetCamera: () => {
        engineRef.current?.resetCamera();
      },
      syncState: (nextState: CubeState) => {
        engineRef.current?.requestSync(nextState);
      },
      getEngine: () => engineRef.current,
    }));

    // Follow the browser's fullscreen state, so leaving with Esc also updates the icon.
    const panelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const onChange = () => setIsFullscreen(document.fullscreenElement === panelRef.current);
      document.addEventListener('fullscreenchange', onChange);
      return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    // The whole panel goes fullscreen, controls included, so there is a visible way back.
    const toggleFullscreen = () => {
      if (!panelRef.current) return;
      if (!document.fullscreenElement) {
        panelRef.current.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    };

    return (
      <div
        ref={panelRef}
        className={`vx-panel relative w-full h-full min-h-[320px] overflow-hidden flex items-center justify-center select-none ${className}`}
      >
        {/* Flat floor: a sunken well across the lower third, so the cube sits on a block. */}
        <div aria-hidden className="absolute inset-x-0 bottom-1 h-1/3 bg-well border-t-2 border-line-soft" />

        {/* Three.js canvas container */}
        <div ref={containerRef} className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing" />

        {/* Ambient overlay hint */}
        <div className="absolute top-3 left-3 pointer-events-none flex items-center gap-2 bg-panel border-2 border-line-soft px-2 h-6 text-xs font-bold text-muted">
          <Eye className="w-3.5 h-3.5" aria-hidden />
          <span>Drag to orbit · Scroll to zoom</span>
        </div>

        {/* Floating Action Controls */}
        {showControls && (
          <div className="absolute bottom-4 right-3 flex items-center gap-2">
            <IconButton size="sm" onClick={() => engineRef.current?.resetCamera()} label="Reset View Orientation">
              <RotateCcw className="w-4 h-4" />
            </IconButton>
            <IconButton
              size="sm"
              onClick={toggleFullscreen}
              label="Toggle Fullscreen"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </IconButton>
          </div>
        )}
      </div>
    );
  }
);
