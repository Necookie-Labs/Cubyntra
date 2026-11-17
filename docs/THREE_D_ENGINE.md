# Cubyntra 3D Graphics Engine & Digital Twin Specification

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented (2.0.0)  
**Module**: `src/three/`, `src/twin/`, `src/components/cube/` and `src/components/twin/`

---

## 1. Overview & Architectural Goals

The Cubyntra 3D engine provides an interactive, mathematically faithful digital twin of the student's cube, rendered in the browser with Three.js (WebGL). In the tutor it is the teaching twin on Solve and Trainer (grip camera, spotlight, move chips, playback, "after" preview; section 6) and the scramble view on Timer.

### Core Engineering Invariants
1. **Visual Follows Model**: Three.js is strictly a rendering projection. The logical cube state in `src/cube/` is the single source of truth.
2. **Zero Floating-Point Accumulation Drift**: Repeated matrix multiplications during continuous face turns inevitably degrade floating-point orthogonality without rigorous snapping. All layer rotations round cubie coordinates to integer space $\{-1, 0, 1\}$ upon animation completion.
3. **Eased turns**: each turn is interpolated with easing at the display's frame rate; under reduced motion turns are cut short.
4. **Context Loss Resilience**: The loop pauses when the WebGL context is lost and the twin is rebuilt from the logical state when it returns (section 9).
5. **Flat Voxel Look**: Flat colors from the design tokens, no gloss, gradients or glow ([ADR-011](ADR/011-voxel-design-system.md)).

---

## 2. 27-Cubie Spatial Decomposition

A standard $3 \times 3 \times 3$ Rubik's cube consists of 26 physical pieces plus 1 core mechanism, indexed in discrete spatial coordinates:
$$x, y, z \in \{-1, 0, 1\}$$

```
Layers along axes:
  X-Axis: Left (x = -1), Middle (x = 0), Right (x = +1)
  Y-Axis: Down (y = -1), Middle (y = 0), Up (y = +1)
  Z-Axis: Back (z = -1), Middle (z = 0), Front (z = +1)
```

### Cubie Classification:
- **Corners** (8 pieces): $|x| + |y| + |z| = 3$. Have 3 colored faces, 3 internal faces.
- **Edges** (12 pieces): $|x| + |y| + |z| = 2$. Have 2 colored faces, 4 internal faces.
- **Centers** (6 pieces): $|x| + |y| + |z| = 1$. Have 1 colored face, 5 internal faces.
- **Core** (1 piece): $|x| + |y| + |z| = 0$. Hidden internal pivot mechanism.

### Voxel Cubies & Shared Resources (`src/three/cubie.ts`)
The twin follows the flat voxel style of [ADR-011](ADR/011-voxel-design-system.md), which replaced the glossy PBR speedcube of ADR-008:
1. **Body**: a plain `BoxGeometry` of edge 0.98 in the core token (`--vx-sticker-core`, `#1B2E13`). The 0.02 gap to the next cubie reads as a dark seam.
2. **Tiles**: a chunky raised block (`BoxGeometry` 0.82 x 0.82 x 0.05) on each visible side, in the sticker tokens (`--vx-sticker-*`). WebGL needs real color values, so `src/lib/tokens.ts` mirrors those tokens; `tests/tokens.test.ts` fails if it ever disagrees with `globals.css`. Sticker colors are the same in both themes.
3. **Materials**: `MeshLambertMaterial` with flat shading: diffuse only, no specular, clearcoat, environment map or tone mapping (`NoToneMapping`).
4. **Shared kit**: a `VoxelKit` holds the 2 geometries and 14 materials (body and six sticker colors, each in a normal and a faded variant) shared by all 27 cubies. Recoloring a tile swaps it to the shared material of that color instead of editing a per-tile material. The engine owns the kit and disposes it, geometries included, in `dispose()`, which also calls `renderer.forceContextLoss()` so the WebGL context is released at once. The solve screen keeps one twin (one engine) mounted for the whole solve.

### Flat-Tone Lighting
One ambient light plus one directional light mounted on the camera. The camera never orbits (the cube group does), so the light stays fixed relative to the screen. A box face is planar and Lambert has no specular term, so each face direction gets exactly one flat tone: faces pointing up read lightest, faces toward the viewer a step darker, side faces darker again. Intensities are in units of pi (Lambert divides by pi), so a face square to the light shows close to the token color itself.

---

## 3. Dynamic Layer Rotation & Zero-Drift Snapping

### 3.1 Grouping and Detaching Mechanics
Directly rotating individual cubies along world axes creates non-affine shearing when rotations are compounded. Cubyntra solves this via temporary dynamic grouping:

1. **Selection**: `moveLayers(move)` (`src/cube/transforms.ts`) reduces every move to an axis, the layers along it, and a signed number of quarter turns. The engine selects the cubies whose rounded coordinate on that axis is one of those layers:
   - Face turn `U`: $\text{round}(y) = +1$ (9 cubies).
   - Wide turn `r`: $\text{round}(x) \in \{+1, 0\}$ (18 cubies).
   - Slice `M`: $\text{round}(x) = 0$ (9 cubies, including two centers).
   - Rotation `y`: all 27 cubies.
2. **Parenting**: A pivot `THREE.Group` is a child of the cube group, reset to identity before each turn. Each selected cubie is moved into it with `pivotGroup.attach(cubie)`. Because the pivot shares the cube group's frame, the turning layer keeps the cube's orbit rotation and idle bob. (A pivot parented to the scene made the layer detach and turn about a world axis whenever the view was orbited.)
3. **Interpolated Turn**: The pivot's rotation is advanced inside the single render loop, never a separate `requestAnimationFrame` chain, using the frame's clamped delta (at most 100 ms) and a cubic ease-in-out:
   $$\theta(t) = \theta_{\text{target}} \cdot \text{ease}(t / T)$$
   $\theta_{\text{target}}$ is the move's signed quarter turns times $\pi/2$ about the $+$axis (right-hand rule), so the same code turns faces, wide layers, slices and the whole cube. Half turns take 1.5x as long as quarter turns.
4. **Detaching**: At $\theta_{\text{target}}$ each cubie is moved back with `rootCubeGroup.attach(cubie)`.
5. **Orthonormal Snapping**:
   - Position is rounded to the integer grid.
   - Orientation is snapped by rounding the rotation matrix's first two basis vectors to the nearest signed axes and deriving the third by cross product (`snapQuaternionToCubeGroup`). The result is always one of the 24 exact cube orientations with determinant $+1$. Rounding Euler angles per component, the previous method, is not a valid snap near gimbal lock.
6. **Repaint by facing**: After each turn, `syncWithCubeState` repaints tiles from the logical state (`paintCubies`), choosing each tile by the direction it points now (`CubieMesh.setColorFacing`), not by the side it was built on.

### 3.2 Move Queue & Playback
- `animateMove(move, targetState, durationMs)` queues the turn and resolves when that turn has been snapped. Turns are never dropped, however fast they are requested.
- `requestSync(state)` repaints immediately when idle. While turns are queued it stores the state and applies it once the queue drains, so colors never jump to a post-move state mid-turn.
- Algorithms are played by the `PlaybackController` (section 3.3), which awaits each turn before the next; stepping back plays the inverse turn.

Verified in `tests/three-motion.test.ts` by driving the real engine frame by frame and reading the state back from cubie geometry and from material colors, for every face, wide, slice and rotation move and for queued mixed sequences (and their inverses) at 144 Hz.

### 3.3 Playback Controller (`src/three/playback.ts`)
`engine.playback` is a `PlaybackController` that plays one algorithm on the twin. It is pure logic over a two-method driver (`animateMove`, `requestSync`, both implemented by the engine), so it is tested without WebGL.

```ts
playback.load(start: CubeState, moves: Move[]): void   // stop, rewind, show `start`
playback.play(): Promise<void>        // to the end; from the end it starts again
playback.pause(): void                // stops after the turn in flight
playback.stepForward(): Promise<void> // next move
playback.stepBack(): Promise<void>    // inverse of the previous move
playback.seek(index: number): Promise<void> // jump to the state after `index` moves, no animation
playback.reset(): Promise<void>       // seek(0)
playback.setSpeed(1 | 0.5): void      // 0.5 doubles turn and rest durations
playback.setLoop(loop: boolean): void // wrap to the start instead of stopping
playback.subscribe(listener): () => void
playback.getSnapshot(): { moves, index, total, activeIndex, direction, playing, speed, loop, state }
playback.whenIdle(): Promise<void>
```
- **Logical state stays ground truth.** `load` precomputes every state along the algorithm with `applyMove`; each turn is handed to the engine with the exact state it must end in, so the queue's snap-and-repaint guarantee applies unchanged.
- **Ordered commands.** Commands run one at a time on an internal promise chain, so rapid clicks are never dropped or reordered. A started turn always finishes; `pause` takes effect before the next one. A new `load` cancels commands still queued for the old algorithm.
- **Snapshot.** `index` counts applied moves (0 = start), `activeIndex` is the move animating now (or null), `direction` is `'back'` while an inverse plays. The snapshot object is stable between changes, for `useSyncExternalStore` (`usePlayback` in `src/components/twin/`).
- At 1x a quarter turn takes 300 ms and play rests 250 ms between turns (the engine itself gives half turns 1.5x).

`tests/three-playback.test.ts` covers the controller with a fake twin; `tests/three-motion.test.ts` plays an algorithm with face, wide, slice and rotation moves through the real engine and checks the twin's colors against the logical state after every step forward and back, and after a seek.

---

## 4. Directional 3D Move Arrows

To guide users through solving moves physically, Cubyntra renders animated 3D directional arrows projecting above the active rotating face:

```
          ^
     /---------\  Clockwise Indicator
    /           \
   |      U      |
```

- **Geometry**: Circular arc (`THREE.EllipseCurve`, radius 1.15) extruded with `THREE.TubeGeometry`, terminating in a conical arrow tip (`THREE.ConeGeometry`) aligned with the direction of travel. A quarter turn sweeps about 0.55π, a half turn about 0.95π.
- **Dynamic Placement**: `orientToFace` places the arc 1.75 units from the cube centre along the face's outward normal and rotates it so its local $+Z$ axis points out of the face. The arc's local XY plane is therefore always seen from outside the cube.
- **Rotation Sense**: Seen from outside the face, the arc sweeps **clockwise** for `X` and `X2` (half turns are drawn clockwise, matching `applyMove`, which performs them as two clockwise quarters) and **counter-clockwise** for `X'`. Because local $+Z$ is the outward normal, clockwise means a decreasing angle: the curve ends at `start - sweep` with `aClockwise = true`. `tests/arrows.test.ts` measures the signed sweep of the arc in world space around each face's outward normal for all six faces.
- **Other move kinds**: the arc is placed and swept by the face the move follows (`moveReferenceFace`).
  - Wide turns are drawn exactly like their face.
  - Slices (`M E S`) get a ring of radius 2.3 in the slice's own plane through the cube centre, clear of the cube's edges ($1.5\sqrt{2} \approx 2.12$), sweeping like L, D or F.
  - Whole-cube rotations (`x y z`) get the widest, thickest ring (radius 2.6, tube 0.08) around the middle of the cube, sweeping like R, U or F.
  `tests/arrows.test.ts` checks the plane, radius and sweep direction of each.
- **Style**: Chunky square bars: tubes and cones with four sides (tube radius 0.08, 0.12 for rotations) in a flat, opaque, unlit `MeshBasicMaterial`. The color is the theme's ink (`--vx-ink`), so arrows contrast with the page in both themes; `engine.setTheme('light' | 'dark')` switches it. No pulsing, transparency or emissive animation.

---

## 5. Camera & Orbit

- **Perspective camera**: 40° vertical field of view, looking at the origin. Dragging rotates the cube group (pitch clamped to ±π/2.2); the scroll wheel zooms.
- **Fitted distance**: By default the camera sits where the cube's bounding sphere (radius $1.5\sqrt{3}$) fits inside the narrower of the vertical and horizontal view angles:
  $$d = \frac{1.5\sqrt{3}}{\sin(\min(\theta_v, \theta_h)/2)}$$
  The cube is therefore never clipped, from any angle or mid-turn, in wide, square or tall containers. The distance follows container resizes until the user zooms; Reset View restores it.
- **Damping**: Orbit and zoom ease with $k = 1 - e^{-7.67\,\Delta t}$, which matches the original 0.12 per frame at 60 Hz and behaves the same at any refresh rate.
- **Clock**: `THREE.Timer`, deliberately not tied to the Page Visibility API, so turns still complete where frames keep firing while `document.hidden` is true. The per-frame delta clamp prevents fast-forwarding when a tab returns.

### 5.1 Grip-Framed View (`src/three/gripCamera.ts`)
`engine.setGrip(grip: Grip | null)` shows the twin the way the student holds the cube (`Grip` from `src/cube/grip.ts`): the face whose center is `grip.top` up, the face whose center is `grip.front` toward the viewer, then the usual three-quarter orbit view on top so U, F and R are visible.
- `gripQuaternion(centers, grip)` is the exact rotation (one of the 24 cube orientations) taking those two faces to +Y and +Z. It is resolved against the state the twin will show once queued turns finish.
- The cube group's orientation is `orbit * grip`. Only the group turns; cubie transforms stay snapped in the cube's own frame, so a regrip cannot introduce drift. The layer pivot lives inside the group, so turns stay aligned with the cube.
- Changing the grip eases to the new orientation (`GripAnimator`, about 0.4 s, landing exactly on the target). Under reduced motion (see below) the regrip is instant. `setGrip(null)` returns to the plain view.

### 5.2 Lighting & Stage
No environment map, contact shadow, shadow maps or tone mapping: the twin sits on the flat panel and well of `CubeVisualizer`, lit only by the flat-tone rig in section 2. A small idle bob (0.06 units) runs unless reduced motion is requested.

**Reduced motion.** `CubeVisualizer` calls `engine.setReducedMotion()` with the OS
`prefers-reduced-motion` setting or the student's own Reduce motion setting (`<html data-motion="reduce">`),
and again whenever either changes. Reduced, the twin has no idle bob, regrips instantly and every
quarter turn takes at most `REDUCED_MOTION_TURN_MS` (80 ms; half turns 120 ms), so a played step
reads as a sequence of snaps.

---

## 6. Teaching Aids

### 6.1 Spotlight (`src/three/spotlight.ts`)
`engine.setSpotlight(pieces: { position: [x, y, z] }[] | null)` keeps the cubies at the listed positions at full color and fades every other cubie, body and tiles, by washing its colors 70% toward the panel cream (`FADE_WASH`, `FADE_WASH_HEX`). Faded pieces stay solid: an earlier see-through fade (35% opacity, depth writes off) stacked the whole cube into muddy overlapping layers. The fade uses shared opaque materials from the `VoxelKit`, with no glow or outline. The "after" preview still fades see-through (`new VoxelKit({ fadeStyle: 'transparent' })`). Positions are in the twin's logical frame: x from L (-1) to R (1), y from D (-1) to U (1), z from B (-1) to F (1); anything off the grid throws. The spotlight marks positions, not physical pieces: it is re-applied after every turn. `null` lights everything; an empty list fades everything.

### 6.2 Slot Outline
`engine.setSlotOutline(position | null)` draws a flat outline box around one cubie position (for example the F2L slot a pair goes into): twelve square bars, 1.12 units across, in the theme's focus color (`--vx-focus`). Bars are used because WebGL lines are one pixel wide on most platforms.

### 6.3 "After" Preview (`src/three/ghost.ts`)
`engine.setGhostState(state | null)` shows a small faded copy of the cube (30% size, 55% opacity) in the top-right corner of the view, painted with the state the current step should end in. It copies the twin's orientation every frame (grip and orbit), so it shows exactly what the twin will look like once the step has played, including any whole-cube rotation in the algorithm. While it is shown, the twin's fitted camera distance grows by 1.3x so the two do not overlap. A separate small cube was chosen over a translucent overlay on the twin because an overlay would sit on top of the pieces the student is watching turn, and two sets of colors in one place are hard to tell apart.

`tests/three-spotlight.test.ts`, `tests/three-ghost.test.ts` and the spotlight, outline and preview cases in `tests/three-motion.test.ts` cover these.

### 6.4 Teaching Twin (`src/twin/`, `src/components/twin/`)
The teaching twin puts one tutor step plan ([METHODS.md](tutor/METHODS.md) section 1.1) on the engine and keeps the aids above in step with playback.

**Mapping** (`src/twin/mapping.ts`, pure). A plan's states are stored as the student holds the cube (`startState` in `grip`, `expectedState` in `gripAfter`) and the twin shows exactly those states, so the twin's logical frame is the plan's frame:
- `piecePosition(state, piece)`: a center by the face its color is on; an edge or corner at the cubie of the first sticker `findEdge` / `findCorner` returns (`stickerPosition`). `spotlightPositions(state, pieces)` maps every highlighted piece, ready for `setSpotlight`.
- `slotPosition(state, targetSlot)`: the cubie between the centers of the slot's colors (sum of their face normals), for `setSlotOutline`. Throws if the colors do not meet at one cubie.
- `checkpointFaces(plan, shown?)`: each checkpoint face (named in `gripAfter`) with its center color and where that center is on the twin showing `shown` (default `expectedState`, where every face maps to itself).

**Controller** (`src/twin/teaching.ts`, `TeachingTwinController`). Pure logic over a `TeachingSurface` (the engine's `playback`, `setGrip`, `getGrip`, `setSpotlight`, `setSlotOutline`, `setGhostState`, `setMoveArrow`; `CubeEngine` implements it).
- `show(plan)` pauses, then `playback.load(plan.startState, [...setupMoves, ...algorithm])` and awaits `whenIdle()`: the turn in flight lands, commands queued for the old step are dropped and the start state is painted before the grip is set, so the grip is resolved against the new state. Rapid `show` calls keep only the last plan. `show(null)` clears the aids.
- Leading `x` / `y` / `z` setup moves are regrips. They play as animated whole-cube turns (all 27 cubies), so the regrip is shown, not jumped. After each move the controller sets the grip to the one the shown state is held in (`gripOf(state)`), so once the step has played `engine.getGrip()` is `plan.gripAfter` and the twin shows `expectedState`.
- After each move the spotlight is recomputed for the highlighted pieces where they now are (the engine spotlight marks positions), and the slot outline for the target slot's centers. The arrow follows the move in focus (`focusMove`: the move turning, inverted while stepping back, else the next one).
- `setGhostVisible(on)` shows `expectedState` in the "after" preview.
- `onStepPlayed(plan)` fires each time the last move finishes turning forward (by play or step), not on a seek.

**React**. `useTeachingTwin(engine, plan, { onStepPlayed?, showGhost? })` returns `{ snapshot, ghost, setGhost }`; one controller per engine, `show(plan)` on every plan change. `<TeachingTwin plan onStepPlayed? showGhost? plainLanguage? />` composes `CubeVisualizer` (whose `onEngineChange` hands over the engine), `PlaybackControls`, an "After" toggle and `MoveChips` (choosing a chip seeks to before that move; `plainLanguage` starts the "In words" toggle on).

**Tests**. `tests/twin-mapping.test.ts` checks every edge, corner and center of scrambled cubes, in other grips too, against the cubie the engine has really turned there (colors read from geometry). `tests/twin-teaching.test.ts` plays a whole seeded guided solve with each method on the real engine through the playback controller and, after every step, checks that the logical state, the painted colors and the colors rebuilt from cubie geometry equal `expectedState`, that the grip is `gripAfter` and that the lit cubies and the outline are the plan's pieces and slot; it also covers `play()` with a regrip, switching plans mid-turn and the preview. `tests/twin-teaching-hook.test.tsx` and `tests/twin-teaching-twin.test.tsx` cover the hook and the component.

---

## 7. React Components (`src/components/`)
- `cube/CubeVisualizer`: mounts the engine, follows the page theme (`<html data-theme>`, watched with a `MutationObserver`) and exposes `getEngine()` on its ref for the teaching aids above; `onEngineChange(engine | null)` reports the engine on mount and before it is disposed.
- `twin/MoveChips`: one chip per move; the current one is highlighted (`aria-current="step"`), finished ones dimmed, each named with `moveName()` for screen readers; an "In words" toggle spells out the current move.
- `twin/PlaybackControls`: step back, play / pause, step forward, 0.5x and loop, built from `IconButton` and `BlockButton`. Controlled; bind it to `engine.playback` with `usePlayback(controller)`.
- `twin/TeachingTwin` and `twin/useTeachingTwin`: one tutor step on the twin (section 6.4).

---

## 8. Solver Worker
Building the Kociemba tables, searching and tutor planning (`tutor.plan`, `tutor.progress`, `tutor.guidedSolve`) run in a Web Worker so the twin never stutters; see [SOLVER.md](SOLVER.md) section 4.4.

---

## 9. WebGL Context Loss (`src/three/contextLoss.ts`)
`ContextLossGuard` listens for `webglcontextlost` / `webglcontextrestored` on the canvas, calls `preventDefault()` on the loss (which tells the browser to try to restore), and reports each loss and restore once.
- **On loss** the engine cancels its animation frame and stops rendering. Turns in flight and queued are finished at once (snapped, with their logical target states), so no caller awaits a turn that might never render.
- **On restore** `WebGLRenderer` re-creates its GL state; the engine marks every material (kit, preview, arrows, outline) for recompilation so programs and buffers are uploaded again, repaints the twin from the logical state (including a deferred `requestSync`), re-applies the spotlight, resizes and restarts the loop.

`tests/three-context-loss.test.ts` drives this with an `EventTarget` standing in for the canvas.

---

## 10. Rendering Performance & Resource Lifecycle

- **Disposal**: `dispose()` stops the loop, releases every waiting turn, removes all listeners (including the context-loss guard), disposes the playback controller, arrows, slot outline, preview and the shared `VoxelKit` (geometries and materials), then the renderer. `tests/three-motion.test.ts` checks that every shared geometry and material is disposed exactly once.
- **Render Loop**: Renders every animation frame; the browser pauses it in background tabs.
