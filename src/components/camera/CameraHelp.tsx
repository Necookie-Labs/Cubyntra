/**
 * Cubyntra - Camera help
 * Necookie Labs (c) 2026
 *
 * What to do when the camera is blocked or the cube will not read. Shown under the scanner
 * and inside the checkpoint sheet.
 */

import React from 'react';

export const CAMERA_ALLOW_STEPS: readonly { where: string; how: string }[] = [
  { where: 'Chrome (Android, laptop)', how: 'Tap the icon left of the address, then Permissions → Camera → Allow. Reload.' },
  { where: 'Safari (iPhone)', how: 'Tap “aA” in the address bar → Website Settings → Camera → Allow.' },
  { where: 'Everywhere', how: 'The page must open with https:// (or localhost on the laptop itself).' },
];

export const READING_TIPS: readonly string[] = [
  'Face a window or a white lamp. Coloured or dim light mixes up red and orange.',
  'Tilt the cube a little if a tile shines white.',
  'Fill the grid with the face and hold still for a second.',
];

export function CameraHelp({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="vx-well group p-3 text-sm">
      <summary className="vx-hit cursor-pointer font-bold text-ink">Camera not working?</summary>
      <div className="mt-3 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="font-sans text-sm font-bold text-ink">Allow the camera</h3>
          <ul className="flex flex-col gap-2">
            {CAMERA_ALLOW_STEPS.map((step) => (
              <li key={step.where} className="text-muted">
                <span className="font-bold text-ink">{step.where}: </span>
                {step.how}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-sans text-sm font-bold text-ink">If the colours read wrong</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
            {READING_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
