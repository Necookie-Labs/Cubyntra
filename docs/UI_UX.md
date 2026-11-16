# Cubyntra UI/UX Design System & Experience Specification

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented  
**Module**: `src/components/`, `src/app/`

---

## 1. Design Philosophy: a Flat Voxel World

Cubyntra is a cube tutor for a young student, so the interface is a calm, light-green world made
of flat blocks ([ADR-011](ADR/011-voxel-design-system.md)). It is an original voxel style with no
borrowed game names, logos, textures or fonts.

### Guiding Principles:
1. **Flat colors only.** No gradients, blur, glow, glass or text shadows. Depth comes from two-tone
   block faces (a light top lip, a darker bottom edge) and hard offset shadows with zero blur.
2. **Clarity over clutter.** Every element shows real state; plain words over jargon.
3. **Tactile feedback.** Blocks sink 2px when pressed; things that land drop in with a small
   overshoot.
4. **Continuous spatial orientation.** The student always knows which face to show next and which
   turn to make.

The rules are enforced: `tests/design-rules.test.ts` fails on gradients, blur, backdrop filters,
text shadows, soft shadows, rounded corners, Tailwind's default palette and any hex color outside
the token block of `src/app/globals.css`.

---

## 2. Tokens, Type, Shape and Motion

### 2.1 Color Tokens
All colors are CSS variables in one block of `src/app/globals.css` (`/* tokens:start */` …
`/* tokens:end */`), exposed to Tailwind as classes. Tailwind's default palette is switched off.

| Role | Class | Light | Dark |
|---|---|---|---|
| Page | `bg-ground` | mint `#EAF4E2` | deep moss `#16210F` |
| Panel / button face | `bg-panel` | cream `#F7F3E3` | `#1F2D16` |
| Sunken well | `bg-well` | `#DCEBCF` | `#111A0B` |
| Text | `text-ink` | moss `#2E4A22` | `#E4EFD8` |
| Secondary text | `text-muted` | `#4D6841` | `#A7BF98` |
| Outline / divider | `border-line` / `border-line-soft` | `#2E4A22` / `#B9CFA8` | `#0B1306` / `#33472A` |
| Primary | `bg-leaf`, `bg-leaf-edge`, `bg-leaf-soft`, `text-on-leaf` | `#5FA83A`, `#3F7A24`, `#CFE6BD`, `#1B2E13` | soft `#2B4420` |
| Warning | `bg-warn`, `bg-warn-soft` | `#E8B730`, `#F6E7B8` | soft `#3D3210` |
| Error | `bg-danger`, `bg-danger-soft`, `text-on-danger` | `#B83A26`, `#F5D6CC`, `#FFF8EC` | soft `#43190F` |
| Focus ring | `--vx-focus` | `#1D5FB8` | `#8CC4FF` |
| Hard shadow | `shadow-block` (4px) / `shadow-block-sm` (2px) | `#B5CCA2` | `#0B1306` |

### 2.2 Cube Sticker Colors
Flat and identical in both themes; use `stickerColor(color)` from `@/components/ui` or the
`bg-sticker-*` classes. White `#F4F4EE`, yellow `#F2CF1D`, red `#C8352E`, orange `#F07A1A`,
blue `#2F6CD0`, green `#1F9A4A`, plastic core `#1B2E13`.

### 2.3 Typography
- **Headings and display:** Pixelify Sans (`font-display`; `h1`–`h3` use it automatically).
- **Body:** Nunito Sans (`font-sans`), never smaller than 12px.
- **Move notation and numbers:** Geist Mono (`font-mono`).
All three are self-hosted through `next/font`.

### 2.4 Shape and Spacing
- Square corners everywhere; borders are 2px (controls, panels) or 4px (camera frames).
- 8px spacing grid, with 4px half-steps only inside compact controls.
- **Block** (`.vx-block`): face + 2px outline + 2px light lip + 4px darker bottom edge + 2px hard
  shadow. Pressed: down 2px, edge shrinks to 2px.
- **Panel** (`.vx-panel`): cream face, 2px outline, 4px bottom edge, 4px hard shadow.
  **Well** (`.vx-well`): the sunken variant.

### 2.5 Motion
Quick steps rather than smooth fades: `vx-place` (a block drops in with a small overshoot),
`vx-pop` (a block lands), `vx-flash` (camera shutter) and `vx-loader` (three blocks light up in
turn while waiting). Hover and press transitions use `steps()` timing and last 80 ms. Under
`prefers-reduced-motion` every animation and transition is cut to 0.01 ms.

### 2.6 Components (`src/components/ui/`)
| Component | Notes |
|---|---|
| `BlockButton` | `primary`, `secondary`, `danger`, `ghost`; sizes `sm` 32px, `md` 40px, `lg` 48px; disabled sinks into a well |
| `IconButton` | square block; `label` is required and becomes `aria-label` and the tooltip |
| `Panel` | `panel` or `well` tone |
| `Chip` | `neutral`, `leaf`, `warn`, `danger`, `solid`; ink text on a tint for AA contrast |
| `ProgressBlocks` | a row of filled / current / empty blocks, announced as a progressbar |
| `Dialog` | `role="dialog"`, `aria-modal`, labelled title; focus moves in, Tab is trapped, Escape and the flat scrim close it, focus returns to the opener |
| `Toast` | a live region (`status`, or `alert` for errors) that dismisses itself |

---

## 3. Core User Experience Flow

```
[ Welcome / Idle State ]
          │
          ▼
[ Camera Initialization ] ─── (Denied) ───► [ Manual Input / Scramble Mode ]
          │ (Granted)
          ▼
[ Guided 6-Face Scan ] ◄────────────────┐
  (U -> R -> F -> D -> L -> B)          │ (Rescan)
          │                             │
          ▼                             │
[ State Validation Engine ] ── (Invalid) ─┘ (Error Modal Recovery)
          │ (Valid)
          ▼
[ Sub-Second Kociemba Solve ]
          │
          ▼
[ Interactive 3D Playback & Step-by-Step Guidance ]
```

---

## 4. Key UI Components & Interactions

### 4.1 Guided Camera Scanner HUD (`CameraScanner.tsx`)
- **Viewport Reticle**: a square 3x3 grid inside a 4px frame with pixel corner blocks, centered over the live video stream.
- **Stability Indicator**: A circular progress ring around each sticker cell filling up over 10 consecutive stable frames.
- **Color Confidence Bar**: Real-time readout of CIELAB distance matching confidence.
- **Face Progress Tracker**: 6 segmented indicators at the top showing completed vs remaining faces.
- **Orientation Guide Widget**: Mini 3D preview cue showing how to rotate the physical cube to reach the next required face.

### 4.2 Mathematical Error Recovery Modal (`ErrorRecoveryModal.tsx`)
- Triggered automatically if state validation detects parity or count anomalies.
- Presents an unfolded 2D cube net view (`U`, `L`, `F`, `R`, `B`, `D`).
- Highlights problematic pieces with pulsing red outlines.
- Provides an intuitive color palette selector to manually override misclassified stickers.

### 4.3 Solve Playback Controls (`SolveControls.tsx`)
- **Move Tape**: Horizontal scrolling carousel of move tokens (e.g. `[U] [R2] [F'] [D]`). Moves are square blocks: the current one is a raised leaf block, done moves sink into wells.
- **Playback Controls**:
  - Play / Pause (toggleable with `Spacebar`).
  - Step Forward / Step Backward (`Right Arrow` / `Left Arrow`).
  - Speed Adjustment: $0.5\times$, $1\times$, $2\times$, $4\times$.
  - Reset to initial scramble (`R`).
- **Progress Gauge**: Real-time percentage indicator and step counter ($K / N$).

### 4.4 Real-Time Computer Vision Debugger (`CVDebugger.tsx`)
- Collapsible diagnostics drawer for advanced users and developers.
- Displays live RGB, HSV, CIELAB color values for all 9 grid points.
- Frame rate monitor (FPS) and frame drop detection.

---

## 5. Responsive Design & Accessibility

- **Desktop (>= 1024px)**: Dual-pane split view with video HUD/controls on the left and the 3D twin visualizer on the right.
- **Mobile (< 1024px)**: Vertically stacked layout with sticky playback controls at the bottom viewport boundary.
- **Accessibility**:
  - All interactive buttons include descriptive `aria-label` attributes.
  - Every text pair meets WCAG AA (4.5:1); the lowest is muted text on the danger tint at 4.56:1. Ratios per pair are in ADR-011.
  - Icon-only buttons use `IconButton`, whose `label` prop is required.
  - Dialogs trap focus, close on Escape and return focus to the opener.
  - Keyboard navigation fully supported across all critical playback actions.

---

## 6. Phone Scanning & Review ([ADR-010](ADR/010-desktop-side-analysis-and-global-color-resolution.md))

```
[ Desktop: Scan with Phone ] ── QR ──► [ Phone: first-run coach (once) ]
          │                                        │
          ▼                                        ▼
[ Desktop: live 6-face progress ] ◄── photos ── [ Phone: guided capture, auto shutter ]
          │ (all six read)
          ▼
[ Desktop: review net ] ── Rescan face ──► [ Phone jumps to that face ]
          │ (Confirm & solve, valid cube only)
          ▼
[ Solve & animated playback ]        [ Phone: "Solving on your computer" ]
```

### 6.1 State Colors
One meaning per accent, everywhere in the flow:

| Color | Meaning |
|---|---|
| Ink outline | Active, in progress |
| Leaf | Verified or steady: face read, cube valid, holding still |
| Warn (yellow) | Needs attention: something to fix or check |
| Danger (red) | Error: the cube cannot exist as entered |

State is never carried by color alone: each state also has an icon or a word.

### 6.2 Phone Capture (`/companion`)
- **First-run coach** (`CaptureCoach.tsx`): three cards (hold, light, order). Shown once per device, reopenable from the help button.
- **Step card**: an isometric mini cube (`FaceGuide.tsx`) showing which center faces the camera, which is on top and which is on the right, plus a one-move instruction and an end-position check.
- **Reticle**: square 4px corner brackets, ink when idle, warn when something needs fixing, leaf while holding steady; a solid leaf frame pops in once the face is read. Square live dots show that the phone sees each tile.
- **Hint line**: exactly one instruction, naming the fix rather than the fault ("Glare on the bottom row. Tilt the cube slightly.").
- **Shutter**: an 80px leaf block, always usable by hand. A four-segment meter under it fills while every check holds; at 600 ms the photo takes itself. Auto-capture can be turned off.
- **Layout**: a column of header, guidance, reticle, hint and controls. The reticle is sized to the remaining height so nothing overlaps on short screens. Safe-area insets are respected and touch targets are at least 44 px.

### 6.3 Review (`ScanReview.tsx`)
- An unfolded net in the layout of a real cube, with a yellow corner marker on tiles that were hard to read.
- Selecting a tile opens an editor with that tile cropped from the user's own photo, six swatches (keys 1–6), and "Rescan this face".
- A live count of each color, and one sentence describing what to fix when the cube cannot exist.
- The screen says so when a photo was turned to fit, or when two photos show the same face.

### 6.4 Motion
Entrances are short stepped animations (`vx-place`, `vx-pop`, `vx-flash`; see §2.5), and only one thing moves at a time. All of them, and the spinners, stop under `prefers-reduced-motion`.

---

## 7. Themes: Light, Dark, System

- **Switch.** The header's Sun/Moon/Monitor button cycles Light → Dark → System. System follows the OS setting, including live changes. The choice is stored per device (`localStorage["cubyntra.theme"]`) and synced across tabs.
- **No flash.** A script in `<head>` (`THEME_BOOT_SCRIPT` in `src/lib/theme.ts`) sets `<html data-theme>` before first paint.
- **How colors switch.** The voxel tokens are defined on `:root` (light) and redefined under `:root[data-theme="dark"]`; Tailwind classes such as `bg-panel` resolve to those variables, so components carry no theme-specific classes.
- **Fixed colors.** Sticker tokens, `text-on-leaf`, `text-on-danger` and the QR paper are the same in both themes, so the logo (`CubeGlyph`) and QR code never change.
- **Error page.** `global-error.tsx` replaces the root layout, so it imports `globals.css` and runs the boot script itself.
- **Phone companion.** Always dark: a viewfinder reads best dark, and its overlays sit on live video as solid blocks.
- **Contrast.** Every text pair passes WCAG AA in both themes; see the table in ADR-011.

## 8. Navigation & Recovery

Every screen has a labeled way forward, and the logo always returns to the start screen.

| Screen | Exits |
|---|---|
| Webcam scan | Back; on camera error: Try again, Use demo cube, Back |
| Phone scan progress | Show QR, Use webcam, Cancel; New QR code when the pairing ended |
| Pairing dialog | Close, Switch to webcam; Try again if the pairing could not be created |
| Review | Rescan a face, Start over, Confirm & solve |
| Solution | Reset to scramble, Scan another cube |
| Error panel | Back to review (when a scan exists), Rescan a named face, Start over, Try the demo cube |
| Crash / 404 | Try again, Back to home |
