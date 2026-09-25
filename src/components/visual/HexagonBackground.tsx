'use client';

/**
 * Cubyntra - Dynamic Procedural Hexagonal Background
 * Necookie Labs (c) 2026
 *
 * Provides a subtle, minimalist geometric backdrop that responds gently to user interaction
 * while strictly adhering to accessibility (prefers-reduced-motion) guidelines.
 */

import React, { useEffect, useRef } from 'react';

export const HexagonBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const hexRadius = 38;
    const hexWidth = hexRadius * Math.sqrt(3);
    const hexHeight = hexRadius * 2;
    const vertDist = hexHeight * 0.75;

    let time = 0;

    const drawHexagon = (x: number, y: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const hx = x + r * Math.cos(angle);
        const hy = y + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Smooth mouse interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      if (!prefersReducedMotion) {
        time += 0.015;
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.lineWidth = 1;

      const cols = Math.ceil(width / hexWidth) + 2;
      const rows = Math.ceil(height / vertDist) + 2;

      for (let row = -1; row < rows; row++) {
        const y = row * vertDist;
        const xOffset = row % 2 === 0 ? 0 : hexWidth / 2;

        for (let col = -1; col < cols; col++) {
          const x = col * hexWidth + xOffset;

          const dx = x - mouse.x;
          const dy = y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Subtle interactive mouse reaction
          if (dist < 220) {
            const influence = (1 - dist / 220);
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.035 + influence * 0.12})`;
          } else {
            // Very slow ambient wave
            const wave = Math.sin(time + (x + y) * 0.003) * 0.015;
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.025 + wave})`;
          }

          drawHexagon(x, y, hexRadius);
          ctx.stroke();
        }
      }

      // Radial vignette to darken edges
      const gradient = ctx.createRadialGradient(
        width / 2,
        height / 2,
        width * 0.2,
        width / 2,
        height / 2,
        width * 0.8
      );
      gradient.addColorStop(0, 'rgba(10, 11, 13, 0)');
      gradient.addColorStop(1, 'rgba(10, 11, 13, 0.85)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      animationFrameId = requestAnimationFrame(render);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    };

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-70"
      aria-hidden="true"
    />
  );
};
