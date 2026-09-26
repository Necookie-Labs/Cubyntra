# ADR-007: Empirical Dataset Color Profiling & Strict Non-Cube Gamut Gating

**Status**: Accepted  
**Date**: 2026-09-26  
**Deciders**: Necookie Labs Core Engineering Team  

---

## Context and Problem Statement
In ADR-006, Cubyntra introduced a client-side neural network and statistical skin chrominance filter to detect human faces and prevent unwanted scanning. However, classical nearest-centroid Delta-E classification in `classifyColor()` still unconditionally mapped incoming pixels to one of the six Rubik's Cube colors even when the subject was a human face, clothing, or room wall. When a webcam was pointed at a face without a cube, naive nearest-centroid calculations mapped skin tones to Orange, Red, or Yellow, leaking non-cube colors into the viewfinder.

Furthermore, naive synthetic color centroids (e.g. theoretical hex values) did not reflect the real-world optical distributions of physical Rubik's Cube plastics under varied camera sensors and lighting temperatures.

## Decision Drivers
1. **Zero Facial & Background Leakage**: Non-cube stimuli (human faces, skin, drywall, clothing, wooden desks) must be strictly rejected at the individual sticker sample level (`isCubeColor === false`, `confidence = 0`).
2. **Empirical Optical Ground Truth**: Color centroids and tolerance envelopes must be derived from real physical Rubik's Cube photography rather than synthetic RGB definitions.
3. **Defense-in-Depth Gating**: Both the low-level color classifier (`classifyColor`) and high-level consensus engine (`TemporalStabilityBuffer`) must enforce open-set rejection boundaries.
4. **100% Client-Side Privacy**: Zero cloud uploads; all inference and optical gating must run entirely in the browser under 5ms per frame.

## Considered Alternatives
1. **Unconditional Nearest Centroid (Status Quo)**: Retain 6-way classification and rely purely on the top-level neural network. (Rejected: Leaked colors to reticle cells before the neural network converged).
2. **Heavyweight Object Detection (YOLO / MobileNet)**: Run a full client-side object bounding box detector in ONNX. (Rejected: Excessive 30MB+ bundle size, high mobile battery drain, frame rate drop below 30 FPS).
3. **Empirical Dataset Ingestion + Multi-Layer Gamut Gating (Chosen)**: Ingest 10,001 images from the Kaggle `bjoernjostein/rubix-cube` dataset to extract empirical CIELAB centroids and maximum allowable Delta-E tolerances ($\tau_{\text{max}}$), combined with statistical skin rejection ($YC_bC_r + r-g$) and minimum saturation gating ($S \ge 28\%$).

## Decision Outcome
We adopted **Alternative 3**:
- Extracted empirical CIELAB centroids and max Delta-E thresholds from 175,000+ authentic sticker pixels in `bjoernjostein/rubix-cube`.
- Upgraded `classifyColor` to return `ClassifiedColorResult` containing `isCubeColor: boolean` and `rejectionReason?: string`.
- Any sample exhibiting skin chrominance ($P(\text{skin}) > 0.40$), low saturation ($S < 28\%$), excessive shadow ($V < 18\%$), or $\Delta E > \tau_{\text{max}}$ is flagged with `isCubeColor = false` and `confidence = 0`.
- In `TemporalStabilityBuffer`, if any cell has `isCubeColor === false`, stability accumulation is immediately aborted.
- Retrained the 3-layer neural network with 500 empirical feature vectors extracted from Kaggle images, achieving 100% test accuracy across 1,500 samples.

## Consequences
### Positive:
- Human faces and background environments are 100% blocked from triggering cube color recognition or auto-capture.
- Optical color classification is grounded in physical plastic measurements across diverse lighting conditions.
- Zero bundle bloat: Feature vectors and weights compiled directly to static typed arrays (36 KB).
- Full documentation and PDF specification synchronized in `docs/AI_MODEL_TRAINING_METHODOLOGY.md` and `docs/pdf/Cubyntra-AI-Model-Training.pdf`.

### Negative / Trade-Offs:
- Highly non-standard cube plastics (e.g. pastel, metallic, or stickerless non-standard cubes) may require manual calibration if their pigments deviate significantly from standard Rubik's plastic centroids.
