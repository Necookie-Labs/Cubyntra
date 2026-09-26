'use client';

/**
 * Cubyntra - Interactive 3D Rubik's Cube Visualizer Component
 * Necookie Labs (c) 2026
 */

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { CubeMove, CubeState } from '@/cube/types';
import { CubeEngine } from '@/three/engine';
import { RotateCcw, Maximize2, Minimize2, Eye } from 'lucide-react';

export interface CubeVisualizerProps {
  state: CubeState;
  activeMove?: CubeMove | null;
  className?: string;
  showControls?: boolean;
}

export interface CubeVisualizerRef {
  animateMove: (move: CubeMove, targetState: CubeState, durationMs?: number) => Promise<void>;
  resetCamera: () => void;
  syncState: (state: CubeState) => void;
}

export const CubeVisualizer = forwardRef<CubeVisualizerRef, CubeVisualizerProps>(
  function CubeVisualizer({ state, activeMove, className = '', showControls = true }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<CubeEngine | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const initialStateRef = useRef(state);

    useEffect(() => {
      if (!containerRef.current) return;

      const engine = new CubeEngine(containerRef.current);
      engineRef.current = engine;
      engine.syncWithCubeState(initialStateRef.current);

      const resizeObserver = new ResizeObserver(() => {
        engine.resize();
      });
      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
        engine.dispose();
        engineRef.current = null;
      };
    }, []);

    // Synchronize sticker colors when state updates externally
    useEffect(() => {
      if (engineRef.current) {
        engineRef.current.syncWithCubeState(state);
      }
    }, [state]);

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
        engineRef.current?.syncWithCubeState(nextState);
      },
    }));

    const toggleFullscreen = () => {
      if (!containerRef.current) return;
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {});
        setIsFullscreen(true);
      } else {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    };

    return (
      <div
        className={`relative w-full h-full min-h-[320px] rounded-xl overflow-hidden bg-[radial-gradient(ellipse_80%_70%_at_50%_40%,#1e2330_0%,#0c0e14_100%)] border border-neutral-800/80 shadow-2xl flex items-center justify-center select-none ${className}`}
      >
        {/* Three.js canvas container */}
        <div ref={containerRef} className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing" />

        {/* Ambient overlay hint */}
        <div className="absolute top-3 left-4 pointer-events-none flex items-center gap-2 text-xs font-mono text-neutral-400">
          <Eye className="w-3.5 h-3.5 text-neutral-500" />
          <span>DRAG TO ORBIT • SCROLL TO ZOOM</span>
        </div>

        {/* Floating Action Controls */}
        {showControls && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-neutral-900/80 backdrop-blur-md p-1.5 rounded-lg border border-neutral-800/80 shadow-lg">
            <button
              type="button"
              onClick={() => engineRef.current?.resetCamera()}
              className="p-1.5 rounded text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
              title="Reset View Orientation"
              aria-label="Reset View Orientation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    );
  }
);
