# ADR-018: Raised Design System

**Status**: Accepted
**Date**: 2026-11-20
**Deciders**: Necookie Labs Core Engineering Team
**Supersedes**: the visual rules of [ADR-011](011-voxel-design-system.md) (flat light-green voxel UI). ADR-011's token discipline carries on, and so does the voxel look of the 3D twin.

---

## Context

The voxel UI of ADR-011 (mint and moss, cream panels, square blocks, hard offset shadows, a
pixel heading font) read as a toy. The owner asked for an overall look that is professional and
modern, pointing at a reference: a mobile game-rewards app (Mistplay) on a night-navy screen that
fades into indigo, with rounded surfaces, a bright blue main button, white secondary buttons and
teal pill badges, and buttons that stand slightly raised on a solid bottom edge, like Duolingo's.

ADR-011 forbade exactly what this needs: gradients, rounded corners and soft shadows. What it got
right stays: every color lives in one token block, components use only tokens, and a test fails
the build on anything else.

## Decision

### 1. Tokens
All colors, the page gradient and the elevation shadows are custom properties in the token block
of `src/app/globals.css`: `:root` is the light theme, `:root[data-theme="dark"]` the dark one.
The theme mechanism is unchanged (`src/lib/theme.ts`, Light / Dark / System; the phone companion
is always dark). The `--vx-` prefix stays: it is now just the token prefix.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--vx-ground` / `--vx-ground-deep` | `#F3F2FF` / `#E4E1FB` lavender | `#120F2B` night navy / `#2A1B6B` indigo | top and bottom of the page gradient |
| `--vx-glow` | white at 70% | violet `#5B45E6` at 35% | light pooled at the top of the page |
| `--vx-backdrop` | radial glow over a vertical ground gradient | same, dark values | the page background |
| `--vx-panel` | `#FFFFFF` | `#1D1A42` | cards, dialogs, nav |
| `--vx-well` | `#EDEBFA` | `#0C0A22` | sunken wells, tracks, inputs |
| `--vx-raised` / `--vx-raised-edge` | `#FFFFFF` / `#D3CFEB` | `#2A2659` / `#3E3984` | secondary button face / bottom edge |
| `--vx-ink` / `--vx-muted` | `#1B1842` / `#56527F` | `#F4F3FF` / `#B4B0DC` | text / secondary text |
| `--vx-line` / `--vx-line-soft` | `#7F7BAD` / `#E0DDF3` | `#7D77C6` / `#322E66` | control outlines (3:1) / card borders, dividers |
| `--vx-elevation`, `--vx-elevation-sm` | indigo-tinted soft shadows | deep navy shadows with a 1px top light | content surfaces (`shadow-block`, `shadow-block-sm`) |
| `--vx-primary` / `-edge` / `-soft` / `--vx-on-primary` | `#1D6FE8` / `#1652B8` / `#DCE8FF` / white | soft `#1C2C66` | main actions, selection, the current move, the active tab |
| `--vx-success` / `-edge` / `-soft` / `--vx-on-success` | `#3DBA58` / `#2A8E41` / `#D8F3DE` / `#072410` | soft `#173A2B` | correct, learned, done, progress fills |
| `--vx-accent` / `-edge` / `--vx-on-accent` | `#22D3B4` / `#139C84` / `#05302B` | same | the teal brand pill (`.vx-pill`), companion labels |
| `--vx-warn` / `-edge` / `-soft` / `--vx-on-warn` | `#F2B230` / `#B9841A` / `#FFEFC4` / `#2B1E00` | soft `#3C3014` | warnings |
| `--vx-danger` / `-edge` / `-soft` / `--vx-on-danger` | `#D7343D` / `#A1222A` / `#FFE0E2` / white | soft `#471C26` | errors, destructive actions |
| `--vx-focus` | `#1F5FCC` | `#8FC1FF` | focus ring |
| `--vx-scrim` | ink at 65% | near-black at 70% | dialog backdrop (flat, no blur) |
| `--vx-qr-paper`, `--vx-sticker-*` | unchanged from ADR-011 | same | QR quiet zone, cube stickers and plastic |

ADR-011's single `leaf` green did two jobs, "act here" and "that was right". They are now two
colors: blue `primary` for actions and selection, green `success` for correct and done, so a
finished step never looks like a button. `--vx-panel-edge`, `--vx-lip` and `--vx-shadow` are
retired.

The primary blue is deeper than the reference's (`#2E8AE6`, on which white text is 3.56:1) so
white button labels reach AA.

### 2. Depth: pressed things have an edge, content floats
- **Raised controls** (`.vx-block`: buttons, icon buttons, segmented options, choice cards): a
  rounded face, a 2px rim, and a 4px solid bottom edge (the rim's bottom side in the edge color
  plus a 2px inset band). Pressing sinks the face 2px onto its edge. Border widths never change,
  so pressing moves nothing around the control. Variants swap four colors: primary (blue face,
  darker blue edge, white text), secondary (white face, lavender rim and edge in light; indigo
  face with a lighter edge in dark), danger, ghost.
- **Content surfaces** (`.vx-panel`: cards, dialogs, toasts): a rounded face with a 2px soft
  border on a soft shadow tinted to the indigo ground. No hard offset shadows.
- **Wells** (`.vx-well`): sunken, rounded, soft border.
- **The page**: the gradient sits on a fixed `body::before` layer, so long pages neither stretch it
  nor repaint it on scroll; `<html>` carries the flat ground color as the fallback.

### 3. One radius scale
`--radius-xs` 4px (tiny marks, sticker cells), `-sm` 8px, `-md` 12px (tiles,
inputs, small buttons), `-lg` 14px (buttons, wells), `-xl` 20px (cards), `-2xl` 28px (dialogs,
hero cards), plus Tailwind's `rounded-full` (pills, pips, switches) and `rounded-none`. Nothing
else: no one-off radii.

### 4. Type
Nunito (rounded; `font-display`, and `h1`–`h3` automatically, at weight 800) for headings,
buttons and big numbers; Nunito Sans for body text; Geist Mono for move notation. All three are
self-hosted at build time by `next/font/google`. Pixelify Sans is gone.

### 5. Motion
Presses ease over 90ms (`--ease-press`); hover lifts a control 1px; surfaces drop in with a small
overshoot (`vx-place`, `vx-pop`); the busy indicator is three hopping dots (`vx-loader`). Both the
OS reduced-motion setting and the student's own setting still cut every animation and transition
to 0.01ms and stop the hover lift.

### 6. Components (`src/components/ui/`)
The same components and props as ADR-011, restyled: `BlockButton` and `BlockLink` share
`BLOCK_BUTTON_SIZE` (sm 36px, md 44px, lg 52px tall) and `BLOCK_BUTTON_BASE`; `IconButton`;
`Panel`; `Chip` is a pill with tones `neutral`, `success` (was `leaf`), `warn`, `danger`, `solid`
(blue) and `accent` (teal); `ProgressBlocks` are rounded pips (done: green on its edge; current:
blue outline); `Switch` is a rounded track with a white knob; `Dialog`, `Toast`, `SegmentedControl`,
`StickerGrid` (rounded plastic, rounded cells). The shell's active nav item is a blue-outlined
row, the phone tab bar marks the active tab with a solid blue pill, and the brand shows the
tagline as a teal pill under the wordmark.

### 7. Enforced by a test
`tests/design-rules.test.ts` scans `src/**/*.{css,tsx}` and fails on:
- `gradient(` or a hex color outside the token block (a gradient is a token or nothing);
- `blur(`, `backdrop-filter`, `text-shadow`, and Tailwind classes for gradients, blur, drop and
  text shadows, or Tailwind's default soft shadows;
- a corner off the radius scale (bare `rounded`, `rounded-3xl`, `rounded-[6px]`);
- Tailwind's default palette;
- a class for a retired token (`bg-leaf`, `text-on-leaf`, `bg-panel-edge`...), which Tailwind
  would otherwise drop silently;
- a `var(--vx-*)` that names no declared token.
It also checks that the dark theme only overrides tokens the light theme defines.

## Contrast (WCAG 2.x)

Computed from the token values by `tests/a11y-contrast.test.ts` (text needs 4.5:1, outlines and
the focus ring 3:1). Text is checked against both ends of the page gradient.

| Pair | Light | Dark |
|---|---|---|
| ink on ground / ground-deep | 15.09 / 13.11 | 16.93 / 13.02 |
| ink on panel / well / raised | 16.72 / 14.22 / 16.72 | 14.95 / 17.66 / 12.57 |
| ink on primary-, success-, warn-, danger-soft | 13.56 / 14.17 / 14.65 / 13.55 | 11.93 / 11.40 / 11.76 / 13.07 |
| muted on ground / ground-deep | 6.52 / 5.66 | 9.02 / 6.94 |
| muted on panel / well / raised | 7.22 / 6.14 / 7.22 | 7.96 / 9.41 / 6.70 |
| muted on primary-, success-, warn-, danger-soft | 5.85 / 6.12 / 6.32 / 5.85 | 6.36 / 6.07 / 6.27 / 6.97 |
| on-primary on primary (button labels) | 4.68 | 4.68 |
| on-success on success | 6.59 | 6.59 |
| on-accent on accent (brand pill) | 7.54 | 7.54 |
| on-warn on warn / on-danger on danger | 8.68 / 4.72 | 8.68 / 4.72 |
| accent text on ground / panel (companion, dark only) | n/a | 9.78 / 8.64 |
| line on ground / ground-deep / panel / well / raised (3:1) | 3.55 / 3.08 / 3.93 / 3.35 / 3.93 | 4.72 / 3.63 / 4.17 / 4.92 / 3.50 |
| focus on ground / ground-deep / panel / well / primary-soft (3:1) | 5.31 / 4.61 / 5.89 / 5.01 / 4.77 | 9.96 / 7.66 / 8.79 / 10.39 / 7.02 |

In light mode the success fill alone is 2.27:1 on the ground, so success marks stand on their
darker edge (3.76:1) or carry an icon. Sticker pairs are unchanged from ADR-011.

## Consequences

- The app reads as one product with the reference: night-navy and indigo, rounded, raised blue
  actions. Light mode is the same system on lavender and white.
- Every color, gradient and shadow is still one token change away; the design-rules test keeps
  one-off gradients, radii and colors out, and now also catches leftovers of retired tokens.
- The 3D twin keeps its flat voxel cubies (ADR-011 section "Consequences"); only its arrow and
  slot colors follow the new `--vx-ink` and `--vx-focus` (`src/lib/tokens.ts`), and faded pieces
  wash toward the light ground instead of the old cream.
- The app icon's background follows the light `--vx-ground`, so the PNG icons were regenerated
  (`npx tsx scripts/generate-icons.ts`); the transparent favicon does not change.
- Buttons are 4px taller than before (md 44px), which also meets the 44px tap target on its own.
