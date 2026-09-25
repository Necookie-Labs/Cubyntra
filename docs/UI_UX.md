# Cubyntra UI/UX Design System & Experience Specification

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented  
**Module**: `src/components/`, `src/app/`

---

## 1. Design Philosophy: "Technical Laboratory"

Cubyntra's user interface is conceived as a high-precision optical laboratory instrument: clean, dark, high-contrast, uncluttered, and information-dense without feeling overwhelming.

### Guiding Principles:
1. **Clarity Over Clutter**: Every UI element conveys actual system state; no superficial widgets.
2. **Tactile Feedback**: Interactive elements provide immediate visual and audio-tactile response.
3. **Continuous Spatial Orientation**: The user is never left guessing which face to scan next or which rotation to execute.

---

## 2. Color Palette & Typography

### 2.1 Theme Tokens
- **Background Root**: Obsidian void `#030712` (Zinc 950) with subtle animated SVG hexagonal grid pattern.
- **Card / Surface**: Translucent obsidian with glassmorphic blur `#0b0f19` / `rgba(15, 23, 42, 0.75)`.
- **Primary Accent**: Electric Cyan `#06b6d4` (Tailwind Cyan 500) and Neon Teal `#14b8a6`.
- **Success / Stability**: Emerald Green `#10b981` (Tailwind Emerald 500) indicating locked color stability.
- **Warning / Unstable**: Amber Orange `#f59e0b` (Tailwind Amber 500) indicating camera jitter or motion blur.
- **Error / Parity Alert**: Crimson Rose `#f43f5e` (Tailwind Rose 500).

### 2.2 Standard Rubik Facelet Colors
- **White (U)**: `#ffffff`
- **Yellow (D)**: `#eab308`
- **Green (F)**: `#22c55e`
- **Blue (B)**: `#3b82f6`
- **Red (R)**: `#ef4444`
- **Orange (L)**: `#f97316`

### 2.3 Typography
- **Primary UI**: Sans-Serif (`Geist Sans`, `Inter`, system-ui) at weights 400, 500, 600, 700.
- **Technical Readouts & Moves**: Monospace (`Geist Mono`, `JetBrains Mono`) for move sequences (`R U R' U'`), coordinates, and confidence metrics.

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
- **Viewport Reticle**: 3x3 rounded bounding grid centered over the live video stream.
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
- **Move Tape**: Horizontal scrolling carousel of move tokens (e.g. `[U] [R2] [F'] [D]`). The current move is highlighted in bright cyan with enlarged typography.
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
  - High contrast ratio exceeding WCAG AA standards (minimum 4.5:1 for normal text, 7:1 for large display metrics).
  - Keyboard navigation fully supported across all critical playback actions.
