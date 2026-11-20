# Cubyntra Computer Vision Technical Report

Reading a physical Rubik's Cube with an ordinary camera · Version 2.0 · November 2026 · Necookie Labs

This report explains the problem Cubyntra solves and the computer vision methods it uses: how a
camera frame becomes nine reliable sticker colors, how six faces become one valid cube, and how one
or two faces are checked after each step of a guided solve. Every threshold and result below comes
from the implementation (`src/vision/`, `src/tutor/`) and its automated tests.

## 1. Problem statement

A beginner who wants to learn the Rubik's Cube faces three problems: the cube in their hands is in a
unique scrambled state, generic tutorials show a different cube, and nobody checks whether each move
was done right. Cubyntra closes that gap by reading the student's own cube with a camera, showing
every step on a 3D copy of it, and checking each step with the camera again.

The hard part is computer vision. A cube scanner must turn camera pixels into the exact 54 sticker
colors, with no single mistake, because one wrong sticker makes the cube impossible to solve. The
real world works against this:

- **Lighting varies.** A blue sticker in sunlight has higher R, G and B values than a white sticker in
  a dim room, so raw RGB distance confuses colors.
- **Glare.** Glossy stickers reflect lamps and phone flashes, saturating pixels to pure white.
- **Color cast.** Warm indoor light pushes white toward yellow and red toward orange.
- **Red and orange are close.** In the dataset used, the average red sticker sits at hue 1.7° and the
  average orange at 9.9° (RGB 201, 82, 58): only about 8° apart.
- **Faces and hands.** Skin tones read as orange or red; a camera pointed at a person can "find" a cube.
- **Motion and framing.** A handheld cube shakes, tilts and fills the frame differently on each device.
- **Privacy.** A learning app for young students should not send camera images anywhere.

## 2. Objectives and constraints

| Objective | How it is measured |
|---|---|
| Read all 54 stickers into a valid cube | The cube passes the color-count, piece and parity checks |
| Work under ordinary home and classroom lighting | Synthetic tests with brightness 0.70–1.22× and color temperature ±12% |
| Never capture a face or background as a cube face | Cube-presence detector gates every capture |
| Check one or two faces after each solve step | ≥ 99% of correct steps verified as a match |
| Name the student's likely mistake | Top diagnosis correct in ≥ 95% of detectable mistakes |
| Keep pixels on the device | No route accepts, stores or returns image data |

Constraints: everything runs in the web browser in plain TypeScript (no WebAssembly and no
server-side vision), on a laptop webcam or a phone camera, at interactive frame rates.

## 3. System overview

The vision pipeline has two stages: **per-frame reading** (live, in the browser that owns the camera)
and **whole-cube resolution** (after six faces are read).

| Stage | Step | Method | Module |
|---|---|---|---|
| Per frame | 1. Region of interest | Square reticle mapped exactly onto video pixels | `sampling.ts` |
| Per frame | 2. Sampling | 3×3 grid, central 40% of each cell, 15% trimmed mean | `sampling.ts` |
| Per frame | 3. Color spaces | sRGB → HSV and sRGB → linear → XYZ (D65) → CIELAB | `color.ts` |
| Per frame | 4. Classification | CIELAB distance to reference colors plus HSV rules, with a confidence | `color.ts` |
| Per frame | 5. Cube presence | Skin model, grid seams, face detector and a trained neural network | `ml/` |
| Per frame | 6. Capture gate | Framing, right face, light, glare and steadiness checks; 8 stable frames | `captureQuality.ts`, `stability.ts` |
| Whole cube | 7. Calibration | The six center stickers become the color palette | `resolveCubeColors.ts` |
| Whole cube | 8. Assignment | Hungarian algorithm: minimum total ΔE with exactly 8 tiles per color | `resolveCubeColors.ts` |
| Whole cube | 9. Repair and review | Orientation repair, flags for doubtful tiles, human review | `resolveCubeColors.ts`, `ScanReview.tsx` |
| Per step | 10. Checkpoint | Student palette, lighting correction, verification, diagnosis | `palette.ts`, `tutor/checkpoint.ts` |

The solving logic (beginner's method, CFOP and the Kociemba algorithm) is deterministic and checks
every plan by replaying it on the logical cube; vision's job is to give it the exact cube state.

## 4. Image acquisition and region of interest

**Webcam.** The scanner draws the video onto a canvas and reads a centered square region of
interest (65% of the shorter side), which matches the square reticle the student sees.

**Phone.** The phone preview uses CSS `object-fit: cover`, so the visible part of the frame depends
on the screen and stream aspect ratios. The phone therefore inverts the cover transform: with scale
`s = max(w_box / w_video, h_box / h_video)` and centering offset `o`, a screen point `p` maps to the
video pixel `(p − o) / s`. The phone reads exactly the square the student lined up. A fixed crop was
about 1.76× too wide on a portrait phone with a landscape stream.

**White balance.** Where the browser allows it, automatic white balance is locked 1.5 s after the
camera opens, so the camera does not shift colors between faces.

## 5. Robust sampling

Each of the nine cells is sampled from its central 40% box only. This avoids the black plastic
borders and the shadows at the edges. Within that box, each color channel is sorted separately, and
the top and bottom 15% are discarded before averaging (a **trimmed mean**):

`k = floor(0.15 · N)`, `R̄ = (1 / (N − 2k)) · Σ R_sorted[i]` for `i = k … N − k − 1`

The bright tail removed is where specular glare sits, and the dark tail is where gaps and shadows
sit, so one reflection cannot change a sticker's color. For checkpoint photos, a tile with more than
20% clipped pixels (all channels ≥ 252) is marked unreadable rather than guessed.

## 6. Color science

Raw RGB is not perceptually uniform and mixes brightness with color, so every sample is converted
to two spaces.

**HSV** gives hue, which separates colors well under changing brightness:
`H = 60° · ((g − b) / Δ mod 6)` when red is the largest channel (similarly for green and blue),
`S = Δ / C_max`, `V = C_max`, where `Δ = C_max − C_min`.

**CIELAB** (L* lightness, a* green–red, b* blue–yellow) is designed so equal distances look equally
different to people:

1. Gamma expansion: `c_lin = c / 12.92` if `c ≤ 0.04045`, else `((c + 0.055) / 1.055)^2.4`.
2. Linear RGB to CIE XYZ with the standard sRGB matrix under the D65 illuminant.
3. `L* = 116 · f(Y/Yn) − 16`, `a* = 500 · (f(X/Xn) − f(Y/Yn))`, `b* = 200 · (f(Y/Yn) − f(Z/Zn))`,
   with `Xn = 0.95047`, `Yn = 1`, `Zn = 1.08883` and `f(t) = t^(1/3)` above 0.008856.
4. Color difference: `ΔE = √(ΔL*² + Δa*² + Δb*²)` (CIE76).

**Classification.** Each sample is scored against reference sticker colors in CIELAB (white L 92,
yellow L 85 b 85, green a −55, blue b −60, red a 65, orange a 50 b 65) and boosted by HSV rules:

| Color | HSV rule | CIELAB check |
|---|---|---|
| White | S < 22% (or < 30% when V > 70%) | L* > 70 |
| Yellow | H 42°–75°, S ≥ 35%, V ≥ 45% | b* > 20 |
| Green | H 80°–168°, S ≥ 28% | a* < −10 |
| Blue | H 175°–265°, S ≥ 30% | b* < −10 |
| Orange | H 8°–42°, S ≥ 40% | a* > 10, b* > 20 |
| Red | H 0°–8° or 340°–360°, S ≥ 40% | a* > 25 |

The red/orange split sits at 8°, chosen from the dataset means above (an earlier 12° split read the
average orange sticker as red). **Confidence** is the margin between the best and second-best
scores, `C = min(1, max(0.2, (S1 − S2) / 45))`: above 0.85 is clear, below 0.60 is ambiguous.

### Worked example: the average orange sticker

The dataset's mean orange sticker is RGB (201, 82, 58). Following it through the pipeline:

| Step | Value | What it shows |
|---|---|---|
| HSV | H 10.1°, S 71%, V 79% | Hue sits in the orange band (8°–42°), just above the 8° split |
| CIELAB | L* 50.4, a* 45.9, b* 37.7 | Strongly red-yellow, mid lightness |
| ΔE to reference red | 21.1 | Closer to red than to orange in CIELAB alone |
| ΔE to reference orange | 29.9 | So a fixed-reference classifier would say "red" |
| Hue rule | orange band boosts orange | The live reading says orange |
| Whole-cube resolution | distance to the student's own orange center | The final answer comes from the student's calibrated stickers |

This is why Cubyntra does not trust any single rule: the live reading uses hue and CIELAB together,
and the final colors come from the six calibrated centers and the 8-per-color constraint
(section 9), which work in the student's own lighting rather than a reference lab.

## 7. Stability and live capture quality

A face is never captured from one frame. The **temporal stability buffer** requires all nine colors
to match the previous frame with average confidence ≥ 0.70 for **8 consecutive frames**; a change
costs 2 frames of progress, so movement cannot trigger a capture.

On the phone, five checks run every 150 ms in priority order, and the first failing check is the one
instruction shown to the student:

| Check | Signal | Threshold |
|---|---|---|
| Framing | Cube-presence detector | must be a cube |
| Right face | Center tile color vs the face asked for | another color with confidence ≥ 0.6 fails |
| Light | Mean L* of the nine tiles | ≥ 28 |
| Glare | Clipped pixels (all channels ≥ 252) per tile | ≤ 8% |
| Steady | Mean ΔE per tile vs the previous frame | ≤ 6 |

When all checks hold for 600 ms the shutter fires automatically; it re-arms only after a check fails,
so a rejected face is never retaken in a loop.

## 8. Cube presence detection (machine learning)

**The problem.** Skin has R > G > B reflectance, hue 15°–35° and moderate saturation, so a color
classifier reads cheeks and foreheads as orange, yellow or red stickers. A student holding still
in front of the camera would otherwise be captured as a cube face.

**Four layers of defense** decide whether a cube is really in the reticle:

1. **Browser face detection** (Shape Detection API, where available) flags faces overlapping the
   reticle.
2. **Statistical skin model** in YCbCr: `d² = ((Cb − 104) / 14)² + ((Cr − 145) / 12)²`,
   `P(skin) = exp(−0.5 · d²)`, combined with normalized chromaticity `r = R / (R + G + B)` in 0.35–0.58.
   More than 40% skin pixels rejects the frame.
3. **Grid seams.** A cube has dark plastic grooves at 1/3 and 2/3 across the face; the detector
   measures the brightness drop along these lines. Faces and backgrounds have no such grid.
4. **A trained neural network** combines 18 features into the final decision.

**Features (18).** Skin fraction and skin likelihood at the center, corners and edges; mean and
minimum saturation; mean and maximum variance inside each cell; grid seam contrast; mean and
minimum color confidence; a penalty for non-cube colors; palette diversity; luminance uniformity;
horizontal and vertical edge gradients; chroma purity; and the face-detector signal. Features are
normalized with the training set's mean and standard deviation.

**Model.** A multi-layer perceptron (MLP): 18 inputs → 32 hidden units (ReLU) → 16 hidden units
(ReLU) → 2 outputs (softmax: cube or not cube). It was trained from scratch in TypeScript
(`scripts/train-cube-detector.ts`) with He initialization, the Adam optimizer, learning rate 0.003,
batch size 64 and 50 epochs, on features extracted from a public cube-image dataset (Python scripts in
`scripts/`) plus synthetic face and background examples. Inference is plain arithmetic in the
browser: no ML library, well under a millisecond per frame.

**Gating.** When the detector says "not a cube", the stability buffer is reset to zero and capture
is disabled, with the message "Face detected. Show the cube instead".

**Honest limits.** The reported 100% test accuracy is on synthetic and dataset-derived examples
with near-duplicates on both sides of the split; accuracy on real camera frames has not been
measured. The detector is a first filter; the whole-cube checks below catch what it misses.

## 9. Global color resolution

Six faces are read separately, often under different lighting, so the final colors are decided for
the whole cube at once:

1. **Calibrate.** The six center stickers are fixed by the cube's mechanism, so their measured
   colors replace the reference palette: each scan is calibrated to the student's own stickers and
   lighting.
2. **Assign.** For the 48 non-center tiles, cost `C(t, c) = ΔE(tile t, palette color c)`. The
   **Hungarian algorithm** finds the assignment with the minimum total cost such that every color
   gets exactly 8 tiles (O(n³), exact). A tile halfway between red and orange is settled by what the
   rest of the cube needs, not by a threshold.
3. **Repair orientation.** If the result is not a valid cube, the face readings are tried with
   quarter-turn rotations (fewest rotated first) until one passes, which fixes a face photographed
   the wrong way round.
4. **Flag.** A tile whose two best colors are within 8 ΔE is flagged as low margin; one assigned
   away from its nearest color is flagged as overridden; two centers within 7 ΔE are reported as the
   same face shot twice.
5. **Human review.** The student sees the resolved net with flagged tiles ringed and can correct any
   tile against the cube in hand. Solving is offered only for a valid cube.

On synthetic photos of a scrambled cube with different lighting on every face, the state is
recovered exactly.

## 10. The student palette and reading a checkpoint

After each solve step the student shows only one or two faces, so the six-center calibration and
the 8-per-color rule are not available. Instead, the full scan teaches a **student palette**: for
each color, the mean CIELAB value of that student's stickers and its spread (standard deviation per
axis, with floors of 6 for L* and 4 for a* and b*). Outliers more than 30 ΔE from that color's center
are left out. The palette stores numbers only, never pixels.

**Lighting correction.** A checkpoint photo may be brighter or warmer than the scan. For the raw
photo and for each of the six possible center colors, per-channel gains are fitted (twice, by least
squares over tiles already close to a palette color, clamped to 0.5–2). The correction with the
lowest cost wins, where the cost penalizes an overall color shift more than a brightness change,
because rooms change brightness more often than light color.

**Reading.** Each tile takes the nearest palette color by a normalized distance
`d = √(Σ ((x_k − μ_k) / σ_k)²)` over L*, a* and b*. Confidence = fit × margin, where fit is 1 for
`d ≤ 4` falling to 0 at `d = 10`, and margin is `1 − d₁/d₂` (best vs second-best color).

**Orientation.** The center tells which face is shown but not which way up, so the reading is also
tried turned 90°, 180° and 270°. An unambiguous turn is accepted; an ambiguous one asks the student to
show the face again with a named color at the top.

## 11. Verification and mistake diagnosis

The tutor engine knows exactly what the cube should look like after each step. A checkpoint compares
only the stickers that prove the step, each with its confidence:

- **match**, so the next step loads;
- **uncertain** (a relevant sticker is unreadable), so the student shows the face again;
- **wrong face**, so the student is told which face to show;
- **mismatch**, which triggers diagnosis.

**Diagnosis** enumerates the likely slips: a move done the wrong way, skipped, doubled, done on the
wrong face, the cube held in the wrong grip, stopping early or doing an extra repeat (pairs of slips
too). Each candidate is replayed on the logical cube and scored against **all** observed stickers,
weighted by confidence. The most likely slip is described in words ("you probably turned the top the
other way at move 3"), and a corrective step can be planned from it.

Results on synthetic photos from 311 real solve steps (both methods; brightness 0.70–1.08×, color
temperature ±12%, noise ±4–10 levels):

| Test | Result | Target |
|---|---|---|
| Correctly done steps verified as match | 311 / 311 (100%) | ≥ 99% |
| A face held rotated, still matched | 277 / 277 (100%) | no false mismatch |
| No palette (static classifier) | 152 / 152 (100%) | ≥ 99% |
| Mistakes detected at the first check | 1,819 / 1,821 (99.89%) | ≥ 99% |
| Top diagnosis correct, when detected | 1,819 / 1,819 (100%) | ≥ 95% |
| Two slips in one step diagnosed | 198 / 198 (100%) | — |

The two undetected cases look exactly like a rotated hold, so the app asks to see the face again and
reports the mismatch on the second check.

## 12. Privacy by architecture

All vision runs in the browser tab that owns the camera. Frames are reduced to nine tile colors and
discarded. A paired phone sends only colors and tile means (27 numbers per face), never images, and
an automated test asserts that no server route accepts, stores or returns image data. The AI coach
receives a short text description of the step, and the voice service receives only the text to
speak. The student palette stores color statistics, not pictures.

## 13. Design decisions

| Decision | Alternative considered | Why this choice |
|---|---|---|
| Hand-built color pipeline (CIELAB, HSV, trimmed mean) | An end-to-end deep network on images | Runs in any browser with no model download, is explainable tile by tile, and needs no large labelled photo set |
| Small MLP only for "is this a cube?" | No detector, or a large image classifier | Faces caused false captures; 18 cheap features and a tiny network solve that in under a millisecond |
| Calibrate on the six centers | Fixed reference colors | Centers never move, so they give the student's own sticker colors in their own light |
| Hungarian assignment with 8 per color | Nearest color per tile | Guarantees a color count a real cube can have and settles borderline tiles globally |
| Human review before solving | Trust the scan | One wrong sticker breaks the solve; the student confirms against the cube in hand |
| Student palette at checkpoints | Re-scan all six faces each step | One or two faces are enough when the palette and the expected state are known |
| Diagnosis by replaying slips | Only "right" or "wrong" | Naming the likely slip turns an error into a teaching moment |
| All vision on the device | Send frames to a server | Privacy for young students and no image uploads |

## 14. Testing and limits

The vision code is covered by unit and end-to-end tests in the project's suite of about 2,000
automated tests, including color boundaries (dataset red and orange means), sampling, reticle
mapping, the ML detector, capture quality, global resolution, the student palette and checkpoint
verification on synthetic photos rendered from real solve plans.

**Limits.** All accuracy figures come from synthetic photos and dataset images; real-camera accuracy
across many devices and rooms has not been measured yet. Very bright light can clip white stickers
(they are then asked for again rather than guessed). Stickers that are not the standard six colors
are outside the design.

**Next steps.** Collect a labelled set of real phone and webcam photos to measure and retrain the
cube detector on real negatives; measure per-device color accuracy; and add a short guided
calibration for unusual sticker sets.
