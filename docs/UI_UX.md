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
| Outline / divider | `border-line` / `border-line-soft` | `#2E4A22` / `#B9CFA8` | `#6E8C5C` / `#33472A` |
| Primary | `bg-leaf`, `bg-leaf-edge`, `bg-leaf-soft`, `text-on-leaf` | `#5FA83A`, `#3F7A24`, `#CFE6BD`, `#1B2E13` | soft `#2B4420` |
| Warning | `bg-warn`, `bg-warn-soft` | `#E8B730`, `#F6E7B8` | soft `#3D3210` |
| Error | `bg-danger`, `bg-danger-soft`, `text-on-danger` | `#B83A26`, `#F5D6CC`, `#FFF8EC` | soft `#43190F` |
| Focus ring | `--vx-focus` | `#1D5FB8` | `#8CC4FF` |
| Hard shadow | `shadow-block` (4px) / `shadow-block-sm` (2px) | `#B5CCA2` | `#0B1306` |

### 2.2 Cube Sticker Colors
Flat and identical in both themes; use `stickerColor(color)` from `@/components/ui` or the
`bg-sticker-*` classes. White `#F4F4EE`, yellow `#F2CF1D`, red `#C8352E`, orange `#F07A1A`,
blue `#2F6CD0`, green `#24A64F`, plastic core `#1B2E13`. The color-blind letter on a sticker is
the core color, or sticker white on red and blue (`STICKER_LETTER_INK` in `src/lib/tokens.ts`), so
every letter reaches 4.5:1 on its sticker.

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
`prefers-reduced-motion`, or the student's Reduce motion setting, every animation and transition
is cut to 0.01 ms and blocks no longer lift on hover (see §5.2).

### 2.6 Components (`src/components/ui/`)
| Component | Notes |
|---|---|
| `BlockButton` | `primary`, `secondary`, `danger`, `ghost`; sizes `sm` 32px, `md` 40px, `lg` 48px; disabled sinks into a well |
| `IconButton` | square block; `label` is required and becomes `aria-label` and the tooltip |
| `Panel` | `panel` or `well` tone |
| `Chip` | `neutral`, `leaf`, `warn`, `danger`, `solid`; ink text on a tint for AA contrast |
| `ProgressBlocks` | a row of filled / current / empty blocks, announced as a progressbar |
| `Dialog` | `role="dialog"`, `aria-modal`, labelled title; focus moves in, Tab is trapped, Escape and the flat scrim close it, focus returns to the opener |
| `Toast` | a polite live region (`status`, or `alert` for errors) that dismisses itself |

---

## 3. Screens and Navigation (Phase 7)

The tutor is one app shell (`src/components/shell/AppShell.tsx`) around eight screens, in the
`src/app/(app)/` route group. The phone companion (`/companion`) stays outside the group with its
own full-screen camera layout.

### 3.1 Navigation map

```
                 ┌──────────── phone tab bar / desktop side nav ────────────┐
   Learn         │ Home (/)        Scan (/scan)        Solve (/solve)       │
   Practice      │ Trainer (/trainer)   Timer (/timer)   Progress (/progress)│
   This device   │ Pair phone (/pair)*                  Settings (/settings) │
                 └──────────────────────────────────────────────────────────┘
   * QR code and typed code (Phase 8 state-only sync)

   Home ──Scan my cube──► Scan ──confirm review──► Solve ──solved──► Home / Scan
     │  ──Try a demo cube──────────────────────────►  │
     └──Continue (saved solve)────────────────────────┘
   Solve ──mismatch──► Rescan the cube ──► Scan ──► Solve (same method, fresh plan)
```

- **Phone (< 1024px).** A 56px top bar (logo, theme switch) and a fixed bottom tab bar with
  five tabs: Home, Scan, Solve, Progress, Settings. The active tab has a 4px leaf-edge bar on top
  and its icon in a leaf-soft block. Trainer, Timer and Pair are reached from Home's "More".
- **Desktop (>= 1024px).** A 240px side nav with all eight screens in three groups (Learn,
  Practice, This device). The active item is a leaf-soft row with a 4px leaf-edge bar on its left.
- **Accessibility.** "Skip to content" is the first Tab stop and jumps to `<main id="content">`.
  Both navs are `<nav aria-label="Main">` (only one is displayed at a time); the current link has
  `aria-current="page"`. Every page has exactly one `<h1>`.
- **Page scaffolding** (`src/components/shell/Page.tsx`): optional small label, one pixel-font
  heading, at most one line of plain text; sections have a small heading. Widths: `md` 672px,
  `lg` 896px, `xl` 1152px; gutters 16px (phone), 24px, 32px.

### 3.2 Home (`/`)
- **Continue** card when a solve is saved: method, step number, the stage being worked on and a
  `ProgressBlocks` row of stages (from `tutor.progress` in the worker); Continue, or Discard.
- **Method**: two radio cards, Beginner's and CFOP, each with one honest line on what it is and
  who it suits, and its stage count. The choice is the profile's default method.
- **Scan my cube** (primary) and **Try a demo cube** when nothing is in progress.
- **Graduation card** (when earned, above Method): "Ready for CFOP" once every beginner's stage is
  mastered (Switch to CFOP sets CFOP with the 2-look last layer), or "Ready for the full last layer"
  once CFOP's four 2-look stages are (Use the full last layer, Open the trainer). "Not yet" hides it
  for this visit. Rules in `docs/tutor/METHODS.md` §10.4.
- **Progress** glance: stages mastered (of 15, or 17 with the full last layer), days in a row,
  cases learned in the trainer and solves; **More** (Trainer, Timer, Pair).

### 3.3 Scan (`/scan`)
The six-face webcam scan (`CameraScanner`) and the review (`ScanReview`, letters on tiles when
the color-blind option is on). On confirm the student palette is built from the raw samples
(`buildStudentPalette`), saved to the profile and a guided solve starts on `/solve` with the
method chosen on Home ("Solve another" included). Only "Rescan the cube" (or "Scan again" after a
failed plan) during a solve sets `rescanRequested`: that scan replaces the solve's cube and the same
step is planned again in the worker; a solved rescan counts as a finished solve. Errors: the
camera panel explains how to allow the camera ("Camera not working?"); an unreadable cube shows
lighting and glare tips with Scan again and Use a demo cube.

### 3.4 Solve (`/solve`)
- **Phone portrait, top to bottom:** stage header (method, "Stage n of N", `ProgressBlocks`,
  step number, stage and case name) → `TeachingTwin` (move chips, playback, "After" preview) →
  coach panel → sticky **I did it** above the tab bar.
- **Desktop:** the twin large on the left (sticky); header, coach and I did it on the right.
- **Coach panel:** the step's own notes (goal, what to look for) always show and need no
  network. Three hint buttons ask the coach: 1 What to look for, 2 Why it works, 3 Show the moves.
  The reply streams into a polite live region. The highest hint asked for on a stage is saved for
  mastery (Progress). "Templates" or "Cap reached" chips and the
  route's notice show when the coach answers from templates.
- **Checkpoint sheet** (a `Dialog`): a flat mini-cube (unfolded, centers only, in the student's
  grip) outlines the face to show and marks with a bar the edge that goes at the top of the
  picture; the instruction (`showFaceInstruction`) names the grip, the face and how to hold it
  ("tilt the cube toward you so the top face faces the camera, keeping the front face at the
  bottom of the picture"). "Check this face" reads the reticle square with the student's palette.
  Outcomes, announced in a live region:
  - *uncertain* → "Show me … again" (unclear tiles marked; tap a tile to correct it), or, when the
    face fits only turned and a turn of that layer would look the same, "… again, with … at the
    top of the picture";
  - *wrong face* → which face to show instead;
  - *match* → a leaf block drops onto the row ("Block placed"), next step after 1.8 s or on
    "Next step";
  - *mismatch* → the sheet closes; the solve screen shows **Not quite yet** with the most likely
    mistake in words, the read faces with wrong tiles marked (tap to correct, then "Check with my
    fixes"), the coach's explanation (the diagnosis is passed to `useCoach`), and Replay the
    step / Fix it from here (when the diagnosis is confident) / Rescan the cube / It actually
    matches.
  - No camera (blocked or failed): how to allow it, Try again, or "It matches" (check by eye).
    The camera starts once the sheet's video element is mounted (a callback ref), and never
    waits forever: no stream within 30 s (time to answer the permission prompt) or no first
    frame within 10 s is the failed state with Try again (`initializeCameraStream`, also used by
    the scan and phone cameras). Closing the sheet stops the tracks, even mid-start.
- **Other states:** loading ("Planning the next step"), no solve in progress (Scan / Demo cube),
  planning failed (Try again / Scan again), solved (Solve another / Home).
- The screen stays awake while a solve is open (Screen Wake Lock, re-taken when the page is
  visible again).

### 3.5 Settings (`/settings`)
Name; method to start with; CFOP last layer (2-look or Full OLL and PLL, shown only while CFOP is
the method; passed to every plan as the tutor's `lastLayer` option); Moves in words; Letters on stickers (with a preview grid); Theme
(Light / Dark / System); Reduce motion; Coach (Live, Templates only or Monthly cap reached, with
"$x of $10.00" spent this month, or Offline: "the built-in notes still work"); Install (Android
install button, iOS "Share → Add to Home Screen" hint, or "Installed").

### 3.6 Trainer (`/trainer`)
- **Set picker**: five cards in a radiogroup (Beginner's algorithms, F2L, 2-look OLL and PLL, Full
  OLL, Full PLL), each with a flat bar and "n/N learned". The choice is saved in the profile.
- **Group filter**: block buttons (`aria-pressed`) for the set's groups, plus All.
- **Drill** (phone: below the twin; desktop: right of it). The twin shows the case with its pieces
  lit and its moves hidden. The drill card has four numbered rows: *Set it up* (hold a solved cube
  with this color on top, green in front, and do the setup moves), *Name it* (Show the name: the
  name, group and recognition text), *Solve it* (Show the algorithm: the notation, and the twin's
  move chips and playback appear; Ask the coach opens the coach panel with this case's plan),
  *Check it* (Got it / Missed it, or Check with the camera, the same checkpoint sheet as the solve
  screen with "Case solved" and "Next case"). A camera mismatch shows "Not solved yet." with the
  likely mistake, Check again and Count it as missed.
- **Case grid**: one square per case of the set or group: empty well (not drilled yet), half full
  (drilling), solid leaf (learned) and leaf with a dark base (known well), with a key; the fill
  level tells the states apart without color. Each square is a button (44px on phones) that drills
  that case next, and its name says the state.
- Missed cases come back within two drills (Leitner boxes, `docs/tutor/METHODS.md` §10.3).

### 3.7 Timer (`/timer`)
- **Scramble** panel: 20 moves of notation in a well, "White on top, green in front", the twin
  showing the scrambled cube, and New scramble.
- **Pad**: a large block, the whole area is the button (pointer and touch), and Space works the
  same anywhere except on another control (Enter too, on the focused pad); Escape cancels. Tap to start the 15 s inspection (a
  countdown); hold until the pad turns leaf ("Let go to start", after 0.3 s; it is warn-tinted
  while held but not ready); let go to start; tap or Space to stop. Chips call out 8 seconds and 12
  seconds, then "Start now: +2" and DNF. The clock is Geist Mono, tabular figures.
- **Last solve**: +2, DNF (toggles) and Delete.
- **Personal bests**: best single, best ao5, current ao5 and current ao12, with one line on how
  averages drop the best and worst; **Recent solves**: the newest twelve. History keeps 100.

### 3.8 Progress (`/progress`)
- **Summary**: blocks placed, days in a row, cases learned, solves.
- **Your world**: two isometric islands drawn in flat SVG polygons (top, left and right faces in
  three token tones, line-colored outlines; no gradients or blur): a meadow for the beginner's
  method and sand for CFOP (with two more tiles once the full last layer is used). Each stage is
  a ground tile; mastered stages get a full block (dropping in with `vx-place`), started ones a
  low slab. A numbered stage list beside each island says the same in words (Mastered /
  Practising n/3 / Not started), and the picture has its own label. One line states the mastery
  rule.
- **Streak**: the current and longest streak, and the last four weeks as a 7-column calendar of
  blocks (today outlined, each day labelled).
- **Algorithm collection**: every trainer set with its learned count and small case squares.
- **Totals**: steps done, checks passed, solves.

### 3.9 Pair
**Pair** shows the QR code, the
six-character typed code with its expiry, a status chip (waiting, phone connected, ended), the
laptop address choice and Unpair. The pairing lives in the shell, so it survives navigation; once
the phone is connected `/scan` offers "Scan with the phone" and `/solve` mirrors the step, grip
and playback on the phone. After a confirmed scan the phone shows the laptop's step as the solve
screen does (method, step number, move chips following the laptop's twin, the next move in words,
playback controls) with **Solve on this phone**, which opens `/solve` on the phone. A paired phone's
`/solve` joins the laptop's step and sends its own step, grip, playback and checkpoint verdicts back,
so the laptop mirrors a solve done on the phone. `/companion` (the phone) is inside the shell but full screen, with no
navigation over the viewfinder.

---

## 4. Key UI Components & Interactions

### 4.1 Guided Camera Scanner HUD (`CameraScanner.tsx`)
- **Viewport Reticle**: a square 3x3 grid inside a 4px frame with pixel corner blocks, centered over the live video stream.
- **Stability Indicator**: a block bar fills as consecutive frames agree.
- **Face Progress Tracker**: `ProgressBlocks` for the six faces, and six thumbnails to rescan any face.

### 4.2 Shell components
| Component | Notes |
|---|---|
| `AppShell` | skip link, side nav (lg), top bar and tab bar (phone), profile bootstrap |
| `PageContainer`, `PageHeader`, `PageSection`, `Busy` | page scaffolding and the three-block busy indicator |
| `BlockLink` | a `next/link` that looks like a `BlockButton` |
| `Switch` | `role="switch"`, labelled and described |
| `SegmentedControl` | a radiogroup of blocks; arrow keys move the choice, one Tab stop |
| `StickerGrid` | one face as a 3x3; optional letters, marked tiles and tap-to-correct |
| `MiniCube` | flat unfolded cube, centers only, the face to show outlined |
| `BlockPlaced` | the "block placed" moment after a passed check |
| `CheckpointSheetView` | the checkpoint sheet driven by props (the trainer uses it; `CheckpointSheet` wires it to the solve) |
| `CaseTiles`, `CaseLegend` | one square per trainer case by how well it is known, and the key |
| `VoxelWorld` | the progress island: flat isometric SVG, a block per stage mastered |
| `PhoneStepCard` | the phone's view of the laptop's step after a scan |

---

## 5. Responsive Design & Accessibility

- **Phone first.** Layouts are designed at 360–430px portrait first; the shell switches to the
  side nav at 1024px.

### 5.1 What is guaranteed (WCAG 2.2 AA)

- **Names.** Every control has a visible label or an accessible name; icon-only buttons are
  `IconButton`s, whose `label` is required (a blank one throws). Every input has a `<label>`.
  Sticker tiles, case tiles and move chips are named in words ("row 1 column 3: red, needs a
  look", "Sune: drilling", "Turn the right side up").
- **Structure.** `<html lang="en">`; every screen has exactly one `<h1>` (visually hidden on the
  scan, phone camera and solve waiting screens) and one `<main id="content">`; the navigation is
  `<nav aria-label="Main">` with `aria-current="page"`, the phone top bar is a `<header>`.
- **Keyboard.** "Skip to content" is the first Tab stop. Tab order follows the page; focus is
  always visible as the 2px `--vx-focus` ring (one `:focus-visible` rule, never removed on a
  control). Radio groups (`SegmentedControl`) move with the arrow keys. Nothing traps focus
  except open modals, which release it on close. The timer works without a pointer: Space
  anywhere (except on another control) or Enter on the focused pad; Escape cancels. The scan
  review recolors the selected tile with 1–6.
- **Modals.** Sheets and dialogs are `Dialog` (`role="dialog"`, `aria-modal`, labelled and
  described; focus moves in, Tab is trapped, Escape and the scrim close it, focus returns to the
  opener). The phone's full-screen first-run coach (`CaptureCoach`) follows the same rules, with
  Escape as Skip.
- **Announcements.** Polite live regions carry the coach's replies and its "thinking" state,
  checkpoint instructions and results, the trainer's mismatch and session count, move names in
  words, the timer's inspection count and toasts. Error toasts and load failures use `alert`.
  Results are announced without the action buttons that follow them.
- **Color is never the only signal.** States also have a word, an icon or a shape: chips carry
  text, review validity an icon block, progress blocks an outline and an announced count, trainer
  case tiles a fill level (empty, half, full, full with a base), the timer pad a caption, the
  per-color tile counts a letter.
- **Color-blind letters** (Settings): W Y R O B G on every sticker of the twin (voxel pixel
  glyphs, `setStickerLetters` on the engine), in every 2D grid (`StickerGrid`, the mini-cube, the
  scan review and its swatches, the trainer's checkpoint sheet), in the live camera grid and on
  the phone-scan thumbnails. Letters use the core color, or sticker white on red and blue.
- **Contrast.** Every text pair reaches 4.5:1 and every control outline and focus-ring pair 3:1,
  in both themes, including each sticker letter on its sticker. Ratios are in ADR-011.
- **Tap targets.** Below 1024px (or with a coarse pointer) every block button and link, and every
  control marked `.vx-hit`, has a hit area of at least 44×44 px: an invisible `::after` grows it
  without growing the block. Controls that sit edge to edge (correctable sticker tiles, trainer
  case tiles) are 44px themselves on phones.

### 5.2 Motion

`prefers-reduced-motion` and the student's **Reduce motion** setting (`<html data-motion="reduce">`)
do the same: every CSS animation and transition is cut to 0.01 ms, blocks stop lifting on hover,
and the twin (`CubeEngine.setReducedMotion`, applied by `CubeVisualizer` whenever either setting
changes) drops its idle bob, regrips instantly and plays each quarter turn in at most 80 ms.

### 5.3 How it is tested

| Test | Checks |
|---|---|
| `tests/a11y-pages.test.tsx` | Renders every screen in the shell (home, scan and review with letters, solve with the checkpoint sheet open, trainer, timer, progress, pair, settings in both themes, phone camera, 404) and runs `axe-core`: no serious or critical violations, one h1, one main, `lang` set, no tap target under 44px. About 2 s. |
| `tests/a11y-contrast.test.ts` | Computes WCAG ratios from the `globals.css` token block, both themes: text 4.5:1, outlines and focus ring 3:1, every sticker letter 4.5:1. |
| `tests/a11y-tap-targets.test.tsx` | The 44px hit-area rule in `globals.css`, and every small kit control passing it. |
| `tests/a11y-motion.test.ts` | Both reduced-motion paths cut animations and the hover lift. |
| `tests/three-motion.test.ts`, `tests/cube-visualizer.test.tsx` | Turns are capped under reduced motion; the twin follows both settings live. |
| `tests/ui-dialog.test.tsx`, `tests/companion-capture-coach.test.tsx` | Focus in, Tab trapped, Escape, focus returned. |
| `tests/app-timer.test.tsx` | A whole timed solve from the keyboard. |

jsdom has no layout, so contrast is computed from the tokens and tap targets are checked from
class names rather than measured.

### 5.4 Known limits

- The scan review's unfolded net uses 24px tiles on phones (four faces side by side do not fit
  at 44px). They meet the WCAG 2.2 AA minimum (24px), and the "tiles need a look" button and the
  keyboard reach every tile.
- The phone camera overlays (reticle, live dots, face list) show colors without letters; the
  step card names the face in words.
- The 3D twin is a picture for screen readers: the step is told by the stage header, the coach
  notes and the named move chips.
- Contrast is AA by token pair; the twin's lit faces are shaded per direction, so on-screen
  sticker colors vary slightly from the tokens.

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

- **Switch.** The theme button (top bar on phones, foot of the side nav on desktop) cycles Light → Dark → System; Settings has the same choice as a segmented control. System follows the OS setting, including live changes. The choice is stored per device (`localStorage["cubyntra.theme"]`) and synced across tabs.
- **No flash.** A script in `<head>` (`THEME_BOOT_SCRIPT` in `src/lib/theme.ts`) sets `<html data-theme>` before first paint.
- **How colors switch.** The voxel tokens are defined on `:root` (light) and redefined under `:root[data-theme="dark"]`; Tailwind classes such as `bg-panel` resolve to those variables, so components carry no theme-specific classes.
- **Fixed colors.** Sticker tokens, `text-on-leaf`, `text-on-danger` and the QR paper are the same in both themes, so the logo (`CubeGlyph`) and QR code never change.
- **Error page.** `global-error.tsx` replaces the root layout, so it imports `globals.css` and runs the boot script itself.
- **Phone companion.** Always dark: a viewfinder reads best dark, and its overlays sit on live video as solid blocks.
- **Contrast.** Every text pair passes WCAG AA in both themes; see the table in ADR-011.

## 8. Navigation & Recovery

Every screen has a labeled way forward; the logo and the Home tab always return home.

| Screen | Exits |
|---|---|
| Home | Continue / Discard (saved solve), Scan my cube, Try a demo cube, Progress, More |
| Scan | Back (home); on camera error: Try again, Use demo cube; unreadable cube: Scan again, Use a demo cube |
| Review | Rescan a face, Start over, Confirm & solve (→ Solve) |
| Solve | I did it (checkpoint sheet), hints, playback; Rescan the cube after a mismatch |
| Checkpoint sheet | Check this face / Check again, It matches, Close (back to the step) |
| Mismatch | Replay the step, Fix it from here, Rescan the cube, It actually matches |
| Planning failed | Try again, Scan again |
| Solved | Solve another, Home |
| Trainer | Set picker, group filter, Show the name, Show the algorithm, Ask the coach, Got it, Missed it, Check with the camera, case grid |
| Timer | Pad (tap / hold / release, Space, Escape), New scramble, +2, DNF, Delete |
| Progress | Open the trainer |
| Phone after a scan | Play / Pause, Previous / Next move, a move chip, Solve on this phone, Scan another cube |
| Pairing dialog | Close, Switch to webcam; Try again if the pairing could not be created |
| Crash / 404 | Try again, Back to home |
