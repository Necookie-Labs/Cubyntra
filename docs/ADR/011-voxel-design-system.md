# ADR-011: Voxel Design System

**Status**: Accepted
**Date**: 2026-11-17
**Deciders**: Necookie Labs Core Engineering Team
**Supersedes**: the visual direction of [ADR-008](008-speedcube-pbr-geometry-digital-twin.md) (glossy PBR look). ADR-008's drift-free snapping still stands; its geometry was replaced by the Phase 4 voxel twin.

---

## Context

Cubyntra is becoming a cube tutor for one young student (ages 10+). The old interface was a dark
"developer console": neutral greys, sky and emerald accents, glassy panels with backdrop blur,
glow blobs, a radial-gradient stage and an animated hexagon canvas. The light theme was produced
by remapping Tailwind's palette, so every component carried a dozen hard-coded color classes.

The owner asked for a light-green voxel world with flat colors only, one that does not look
generated: **no gradients, blur, glow, glass or text shadows**, and no Minecraft names, logos,
textures or font.

## Decision

### 1. A small, flat token set
All colors are CSS custom properties on `:root` (light) in `src/app/globals.css`, with a dark
variant on `:root[data-theme="dark"]`. The theme mechanism is unchanged: `src/lib/theme.ts`
writes `data-theme` before first paint and the header toggle cycles Light, Dark and System.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--vx-ground` | `#EAF4E2` mint | `#16210F` deep moss | page |
| `--vx-panel` | `#F7F3E3` cream | `#1F2D16` | panel and button faces |
| `--vx-panel-edge` | `#DCD3B0` | `#121C0C` | bottom edge of panels |
| `--vx-well` | `#DCEBCF` | `#111A0B` | sunken wells, tracks |
| `--vx-ink` | `#2E4A22` moss | `#E4EFD8` | text |
| `--vx-muted` | `#4D6841` | `#A7BF98` | secondary text |
| `--vx-line` / `--vx-line-soft` | `#2E4A22` / `#B9CFA8` | `#6E8C5C` / `#33472A` | outlines / dividers |
| `--vx-shadow` | `#B5CCA2` | `#0B1306` | hard offset shadow |
| `--vx-lip` | white at 35% | white at 12% | light top lip of a block |
| `--vx-leaf` / `-edge` / `-soft` | `#5FA83A` / `#3F7A24` / `#CFE6BD` | same / same / `#2B4420` | primary |
| `--vx-on-leaf` | `#1B2E13` | same | text on leaf |
| `--vx-warn` / `-edge` / `-soft` | `#E8B730` / `#A9821A` / `#F6E7B8` | soft `#3D3210` | warnings |
| `--vx-danger` / `-edge` / `-soft` | `#B83A26` / `#7E2516` / `#F5D6CC` | soft `#43190F` | errors |
| `--vx-on-danger` | `#FFF8EC` | same | text on danger |
| `--vx-focus` | `#1D5FB8` | `#8CC4FF` | focus ring |
| `--vx-scrim` | moss at 70% | near-black at 60% | dialog backdrop (flat, no blur) |
| `--vx-qr-paper` | `#FFFFFF` | same | QR quiet zone |
| `--vx-sticker-*` | white `#F4F4EE`, yellow `#F2CF1D`, red `#C8352E`, orange `#F07A1A`, blue `#2F6CD0`, green `#1F9A4A`, core `#1B2E13` | same | cube stickers |

Tailwind's default palette, shadows, blur and radii are switched off (`--color-*: initial` and
friends in `@theme`), so only these tokens produce classes (`bg-panel`, `text-muted`,
`border-line`, `bg-sticker-red`, `shadow-block`).

### 2. Depth without effects
- **Blocks** (`.vx-block`): a flat face inside a 2px outline, a 2px light lip along the top and a
  4px darker edge along the bottom, plus a `2px 2px 0` hard shadow. Pressing sinks the block 2px
  and shrinks the edge to 2px.
- **Panels** (`.vx-panel`): a 2px outline, a 4px bottom edge and a `4px 4px 0` hard shadow with
  zero blur. **Wells** (`.vx-well`) are the sunken variant.
- **Corners are square.** Stepped `clip-path` corners were considered and rejected: `clip-path`
  also clips focus outlines and hard shadows.
- **Spacing** sits on an 8px grid (4px half-steps only inside compact controls). Borders are 2px
  or 4px.

### 3. Type
Pixelify Sans (via `next/font/google`) for headings and display only; Nunito Sans for body text;
Geist Mono for move notation. All three are self-hosted at build time.

### 4. Motion
Short stepped transitions (`steps()` timing) and a small overshoot when a block lands
(`vx-place`, `vx-pop`); a three-block stepped busy indicator (`vx-loader`) replaces spinners for
long waits. Under `prefers-reduced-motion` every animation and transition is cut to 0.01ms.

### 5. Components (`src/components/ui/`)
`BlockButton` (primary, secondary, danger, ghost; sm/md/lg), `IconButton` (the `label` prop is
required and becomes `aria-label`; a blank label throws), `Panel`, `Chip`, `ProgressBlocks`
(an announced progressbar), `Dialog` (`role="dialog"`, `aria-modal`, labelled and described, focus
moves in, Tab is trapped, Escape and the scrim close it, focus returns to the opener) and `Toast`
(a live region that dismisses itself). `stickerColor()` maps a cube color to its token.

### 6. Enforced by a test
`tests/design-rules.test.ts` scans `src/**/*.{css,tsx}` and fails on `gradient(`, `blur(`,
`backdrop-filter`, `text-shadow`, on Tailwind utilities for gradients, blur, drop and soft shadows,
rounded corners and the default palette, and on any hex color outside the token block. It also
checks that the dark theme only overrides tokens the light theme defines.

## Contrast (WCAG 2.x)

Body text pairs, computed from the token values (AA needs 4.5:1):

| Pair | Light | Dark |
|---|---|---|
| ink on ground | 8.75 | 14.01 |
| ink on panel | 8.91 | 12.20 |
| ink on well | 7.94 | 14.99 |
| muted on ground | 5.50 | 8.38 |
| muted on panel | 5.60 | 7.30 |
| muted on well | 4.99 | 8.97 |
| ink on leaf-soft | 7.41 | 9.04 |
| ink on warn-soft | 8.04 | 10.61 |
| ink on danger-soft | 7.26 | 12.74 |
| muted on danger-soft (lowest pair) | 4.56 | 7.62 |
| on-leaf on leaf (primary button) | 4.94 | 4.94 |
| on-leaf on warn | 7.77 | 7.77 |
| on-danger on danger | 5.42 | 5.42 |
| focus ring on ground (non-text, needs 3:1) | 5.48 | 9.10 |
| outline (line) on ground / panel / well (non-text, needs 3:1) | 8.75 / 8.91 / 7.94 | 4.42 / 3.85 / 4.73 |

White text on leaf would be 2.94:1, which is why primary buttons use dark `--vx-on-leaf` text.
In light mode the leaf fill alone is 2.59:1 against the ground, so every leaf control also carries
the 2px ink outline (8.75:1).
The dark theme's outline was near-black (`#0B1306`, 1.1:1 on the dark surfaces), which left
inputs, switches and radio cards without a visible edge; it is a sage `#6E8C5C` since Phase 10.
The hard shadow keeps the near-black. `tests/a11y-contrast.test.ts` computes every pair here from
`globals.css` and fails below the AA thresholds.

## Consequences

- Every color decision lives in one block of `globals.css`; a new theme or a tweak is a token
  change, not a hunt through components.
- The look cannot quietly drift back to gradients or glass: the design-rules test fails first.
- The phone companion stays dark (it sits on live video) and now uses the same tokens.
- The Three.js twin follows the same rules (Phase 4): plain voxel cubies, flat Lambert colors from
  the sticker tokens (mirrored for WebGL in `src/lib/tokens.ts`, checked against this file by
  `tests/tokens.test.ts`), one flat tone per face direction, chunky square arrows in the theme's
  ink. See `docs/THREE_D_ENGINE.md`.
- `next/font` downloads the three fonts during `next build`, so the first build needs network
  access (see `docs/DEVELOPMENT.md`).
