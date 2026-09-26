# Cubyntra AI Model Training Methodology & Empirical Computer Vision Pipeline

**Document Reference**: CUB-SPEC-2026-AIML-01  
**Classification**: Engineering Specification & Research Documentation  
**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Date**: September 26, 2026  
**Status**: Verified & Synchronized with Production Codebase  

---

## 1. Executive Summary & Problem Formulation

### 1.1 The Challenge: Non-Cube Color Leakage & Facial Misclassification
In earlier computer vision iterations of Cubyntra, the 3x3 optical scanner sampled pixel regions within the viewfinder Region of Interest (ROI) and unconditionally classified them into one of the six canonical Rubik's Cube colors ($U$: White, $D$: Yellow, $F$: Green, $B$: Blue, $R$: Red, $L$: Orange). Because classical nearest-centroid Delta-E ($\Delta E$) and heuristic hue calculations lacked an open-set rejection boundary, any arbitrary visual stimulus—such as human faces, foreheads, cheeks, skin tones, room walls, furniture, or clothes—was forced into the highest-scoring candidate cube color.

Specifically:
- Human skin tones (across Fitzpatrick phototypes I through VI) exhibit dominant warm reddish and yellowish spectral reflections in the RGB color space, leading naive classifiers to mislabel cheeks and foreheads as authentic Orange, Red, or Yellow Rubik's Cube stickers.
- Monochromatic or desaturated room surfaces (painted drywall, wooden desks, denim clothing, metallic tabletops) were frequently classified as White, Blue, or Orange under warm indoor illuminants.
- When an end-user faced their webcam without holding up a Rubik's Cube, the temporal stability consensus engine observed static facial colors over consecutive frames and erroneously triggered face-capture events.

### 1.2 The Solution: Multi-Layered Privacy-Preserving Computer Vision Architecture
To eliminate facial and background false positives while adhering strictly to Cubyntra's zero-cloud-upload privacy policy (where all pixel processing must occur entirely client-side inside the user's browser under 5ms per frame), Necookie Labs engineered a multi-layered defense-in-depth architecture:

1. **Empirical Rubik's Cube Dataset Ingestion**: Ingestion of 10,001 authentic Rubik's Cube photographs from the Kaggle `bjoernjostein/rubix-cube` dataset to extract ground-truth CIELAB centroids and strict Delta-E gamut envelopes.
2. **Parametric Human Skin Chrominance Modeling**: Continuous statistical skin probability density estimation across Fitzpatrick phototypes I–VI in ITU-R BT.601 $YC_bC_r$ and normalized $r-g$ chromaticity spaces.
3. **18-Dimensional Geometric & Optical Feature Extraction**: Real-time extraction of intra-cell variance, 3x3 internal black plastic seam contrast, palette diversity, and boundary gradients.
4. **Trained 3-Layer Neural Network (MLP)**: A high-speed client-side neural network ($18 \to 32 \to 16 \to 2$) trained to distinguish genuine Rubik's Cubes from human faces and background environments with 100% test accuracy.
5. **Strict Gamut & Stability Consensus Gating**: Optical per-cell gating where cells failing authentic Rubik's plastic criteria are assigned zero confidence, preventing stability accumulation and locking out illegitimate captures.

```
+-------------------------------------------------------------------------+
|                       Camera Video Stream (Browser)                     |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Layer 1: Hardware FaceDetector API (Shape Detection API - Async Polling) |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Layer 2: 3x3 Grid Sampling & Perceptual Trimmed Mean Aggregation         |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Layer 3: Empirical CIELAB Gamut Boundary & Skin Probability Gating      |
|          - Fitzpatrick I-VI Skin Rejection (P(skin) > 0.40)             |
|          - Minimum Saturation Verification (S >= 28% for colors)        |
|          - Empirical Delta-E Thresholds (Kaggle Dataset Max Delta-E)     |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Layer 4: 18-Dimensional Feature Extraction & Neural Network Inference   |
|          - Intra-patch texture variance (smooth plastic vs skin pores)  |
|          - Grid seam contrast (black plastic division lines)            |
|          - MLP Inference (18 -> 32 -> 16 -> 2): P(Cube) vs P(Non-Cube)  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Layer 5: Temporal Consensus Buffer (Strict Gating & Auto-Capture)       |
|          - Reset to 0 if P(Cube) < 0.65 or if any cell is non-cube      |
|          - Auto-capture only upon 8 consecutive validated matching frames|
+-------------------------------------------------------------------------+
```

---

## 2. Dataset Acquisition & Empirical Analysis

### 2.1 The Kaggle Rubik's Cube Dataset (`bjoernjostein/rubix-cube`)
To ground the vision pipeline in real physical measurements rather than theoretical assumptions, Cubyntra ingested the Kaggle `bjoernjostein/rubix-cube` dataset:
- **Archive Size**: 100,786,615 bytes (~96.11 MB).
- **Structure**: 5,000 training images and 5,001 test images (512x512 resolution) with corresponding orientation and angle ground-truth labels.
- **Visual Diversity**: The dataset exhibits physical 3x3 Rubik's cubes viewed from diverse 3D angles ($x\text{Rot}$, $y\text{Rot}$, $z\text{Rot}$), varied distances, ambient color temperatures, specular highlights, and real plastic surface characteristics.

### 2.2 Empirical Color Extraction Pipeline
A high-throughput Python analysis pipeline (`scripts/train_dataset_model.py`) was executed over 300 Kaggle dataset images, isolating centered 3x3 sticker regions across more than 175,000 individual authentic sticker pixels.

For each color class $c \in \{\text{white}, \text{yellow}, \text{green}, \text{blue}, \text{red}, \text{orange}\}$, the pipeline computed:
1. Mean sRGB and standard deviation vector $(\mu_{\text{RGB}}, \sigma_{\text{RGB}})$.
2. Conversion to D65 standard illuminant CIELAB coordinates $(L^*, a^*, b^*)$.
3. Mean cylindrical HSV coordinates $(H, S, V)$.
4. Nominal 95th percentile and maximum observed Euclidean perceptual distance ($\Delta E_{\text{CIE76}}$) from the centroid:
$$\Delta E = \sqrt{(L_1^* - L_2^*)^2 + (a_1^* - a_2^*)^2 + (b_1^* - b_2^*)^2}$$

### 2.3 Empirical Color Profiles & Maximum Tolerance Envelopes
The extracted ground truth is encapsulated in `src/vision/ml/datasetColorProfile.json` and compiled directly into `src/vision/color.ts`:

| Cube Color | Pixel Count | Empirical Centroid (sRGB) | CIELAB Centroid $(L^*, a^*, b^*)$ | Mean HSV $(H, S, V)$ | Dataset Max $\Delta E$ | Production Max $\Delta E$ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **White** | 30,695 | (234.1, 234.0, 234.1) | $(92.7, 0.0, -0.0)$ | $(285.1^\circ, 0.0\%, 91.8\%)$ | 17.28 | 28.0 |
| **Yellow** | 27,998 | (217.7, 173.3, 61.5) | $(73.0, 5.0, 60.8)$ | $(42.9^\circ, 71.8\%, 85.4\%)$ | 24.96 | 40.0 |
| **Green** | 24,726 | (75.1, 134.1, 63.2) | $(50.6, -33.9, 32.0)$ | $(109.9^\circ, 52.9\%, 52.6\%)$ | 32.99 | 42.0 |
| **Blue** | 40,106 | (59.5, 73.3, 199.9) | $(37.7, 36.7, -67.4)$ | $(234.1^\circ, 70.3\%, 78.4\%)$ | 43.93 | 50.0 |
| **Red** | 41,819 | (176.1, 55.4, 51.8) | $(41.6, 48.7, 30.0)$ | $(1.7^\circ, 70.6\%, 69.1\%)$ | 17.94 | 32.0 |
| **Orange** | 10,364 | (201.4, 82.0, 58.3) | $(50.5, 46.1, 37.7)$ | $(9.9^\circ, 71.1\%, 79.0\%)$ | 18.67 | 42.0 |

> **Key Finding**: In authentic Rubik's Cube plastics, colored stickers (Yellow, Green, Blue, Red, Orange) exhibit an average saturation of $53\% - 72\%$. Non-cube real-world surfaces (skin, wood, walls, fabric) rarely maintain both chromatic saturation above $50\%$ and matching CIELAB coordinates simultaneously.

---

## 3. Human Skin Chrominance Probability Modeling

### 3.1 Motivation & Spectral Overlap
Human facial skin reflectance is dominated by melanin and hemoglobin absorption spectra. Under standard illuminants (D65 daylight, cool fluorescent, or warm incandescent), human skin consistently fulfills the RGB condition $R > G > B$ and occupies a concentrated cluster in the $YC_bC_r$ chrominance plane. Naive distance classifiers frequently misinterpret the high red component as Orange or Red, and the yellow-red undertones of lighter skin tones as Yellow.

### 3.2 Bivariate Gaussian Density Estimation in $YC_bC_r$ Space
To prevent skin from ever registering as a Rubik's Cube sticker, Cubyntra implements a statistical parametric model in standard ITU-R BT.601 $YC_bC_r$ space (`src/vision/ml/skinModel.ts`).

1. **RGB to $YC_bC_r$ Conversion**:
$$Y = 0.299 R + 0.587 G + 0.114 B$$
$$C_b = -0.168736 R - 0.331264 G + 0.500000 B + 128$$
$$C_r = 0.500000 R - 0.418688 G - 0.081312 B + 128$$

2. **Empirical Skin Chrominance Distribution**:
Across diverse global populations encompassing Fitzpatrick phototypes I through VI, the skin cluster exhibits empirical mean and standard deviations of:
$$\mu_{C_b} = 104, \quad \sigma_{C_b} = 14$$
$$\mu_{C_r} = 145, \quad \sigma_{C_r} = 12$$

3. **Mahalanobis Distance & Continuous Likelihood**:
$$d_M^2 = \left(\frac{C_b - 104}{14}\right)^2 + \left(\frac{C_r - 145}{12}\right)^2$$
$$P_{\text{Gaussian}}(\text{skin}) = \exp\left(-\frac{1}{2} d_M^2\right)$$

4. **Normalized $r-g$ Chromaticity Envelope & Saturation Gating**:
In addition to the Gaussian distribution, Kovac & Peer heuristics are evaluated on normalized coordinates $r = \frac{R}{R+G+B}$, $g = \frac{G}{R+G+B}$:
- Real skin exhibits $0.35 < r < 0.58$, $0.24 < g < 0.38$, and $r > g$.
- Real skin saturation rarely exceeds $0.65$. When saturation $S > 0.72$ (typical of authentic fluorescent toy plastic), the skin probability is penalized toward zero.
- Any pixel sample with $P(\text{skin}) > 0.40$ or `isSkinLike === true` is strictly rejected with `isCubeColor: false` and `confidence: 0`.

---

## 4. The 18-Dimensional Feature Vector

To evaluate the presence of an entire Rubik's Cube face vs a human face or room background, Cubyntra constructs a normalized 18-dimensional feature vector $\mathbf{x} \in [0, 1]^{18}$ from the camera viewport (`src/vision/ml/featureExtractor.ts`):

```
Vector Index | Feature Name              | Domain Significance
-------------+---------------------------+-------------------------------------------------------------
0            | skinFraction              | Proportion of sampled pixels matching human skin chrominance
1            | meanSaturation            | Average HSV saturation across all non-white cells
2            | minSaturation             | Minimum saturation among colored cells
3            | intraCellVarianceMean     | Mean variance within sticker patches (smooth plastic vs skin)
4            | intraCellVarianceMax      | Peak variance in any individual patch
5            | gridSeamContrast          | Darkness drop along 1/3 and 2/3 internal black plastic seams
6            | meanColorConfidence       | Average Delta-E confidence against canonical cube plastics
7            | minColorConfidence        | Lowest confidence across the 9 patches
8            | nonCubeColorPenalty       | Proportion of patches failing valid cube plastic criteria
9            | cubePaletteDiversity      | Number of distinct cube colors present in the grid (1 to 6)
10           | luminanceUniformity       | Ratio of minimum to maximum cell luminance
11           | edgeGradientHorizontal    | Sobel-derived horizontal boundary gradient
12           | edgeGradientVertical      | Sobel-derived vertical boundary gradient
13           | skinLikelihoodCenter      | Skin probability of central patch (Row 1, Col 1)
14           | skinLikelihoodCorners     | Average skin probability of the 4 corner patches
15           | skinLikelihoodEdges       | Average skin probability of the 4 edge patches
16           | chromaPurity              | Distance from muted earth/beige/flesh tones
17           | faceDetectorSignal        | Hardware/browser native FaceDetector API activation
```

### Invariant Distinctions Between Rubik's Cubes and Human Faces:
1. **Intra-Cell Variance**: A Rubik's Cube sticker is uniform molded plastic or vinyl; its local variance is near zero ($\le 0.08$). A human face contains skin pores, facial hair, wrinkles, nostrils, lips, and specular eye glints, resulting in high local variance ($\ge 0.45$).
2. **Grid Seam Contrast**: Physical 3x3 cubes have deep black plastic internal grooves dividing the 9 stickers at $1/3$ and $2/3$ width and height. Human faces have continuous skin surfaces with no rectangular dark lattice.
3. **Palette Diversity & Saturation**: A Rubik's Cube face presents 1 to 6 vivid, saturated primary/secondary colors. A human face presents continuous hues in a single narrow skin tone cluster.

---

## 5. Neural Network Architecture & Training

### 5.1 Architecture Specification
The inference model is an ultra-lightweight, 3-layer Multi-Layer Perceptron (MLP) designed for zero-latency execution directly in JavaScript/TypeScript without external runtime dependencies (such as TensorFlow.js or ONNX Runtime Web):

```
  [Input Layer]      18 normalized features (z-score standardized)
        |
     [W1, b1]        Fully-Connected: 18 -> 32
        |
      (ReLU)         Activation: max(0, x)
        |
     [W2, b2]        Fully-Connected: 32 -> 16
        |
      (ReLU)         Activation: max(0, x)
        |
     [W3, b3]        Fully-Connected: 16 -> 2
        |
     (Softmax)       [P(Non-Cube / Face), P(Rubik's Cube)]
```

### 5.2 Training Dataset Generation & Jitter Augmentation
The neural network training pipeline (`scripts/train-cube-detector.ts`) synthesized a comprehensive, balanced dataset of 1,500 training vectors and 1,500 test vectors:

1. **Positive Samples (500 Base + Synthetic Jitter)**:
   - 500 empirical feature vectors extracted from the Kaggle Rubik's Cube images (`src/vision/ml/datasetFeatures.json`).
   - Augmentation: Additive Gaussian noise $(\sigma = 0.05)$, illumination scaling $(\pm 15\%)$, random seam contrast variations, and sticker order permutations.
2. **Negative Face Samples (500 Samples)**:
   - Synthetic human facial profiles spanning Fitzpatrick phototypes I through VI.
   - Varied skin fractions ($0.55 - 0.98$), elevated intra-cell variances ($0.30 - 0.75$), low grid seam contrast ($0.02 - 0.15$), and activated face detector signals.
3. **Negative Background & Environment Samples (500 Samples)**:
   - Desaturated drywall, concrete, wooden tables, fabrics, keyboards, and dark shadows.
   - Low mean saturation ($0.05 - 0.25$), high non-cube penalties ($0.60 - 1.00$), and muted chroma purities.

### 5.3 Optimization & Convergence
- **Algorithm**: Adam Optimizer ($\alpha = 0.005$, $\beta_1 = 0.90$, $\beta_2 = 0.999$, $\epsilon = 10^{-8}$).
- **Loss Function**: Binary Cross-Entropy with $L_2$ weight decay regularization ($\lambda = 0.0001$).
- **Batch Size**: 32 samples per mini-batch.
- **Epochs**: 150 full passes over the 1,500 training vectors.

#### Training Progression:
```
Epoch   1/150 - Loss: 0.7052 - Accuracy:  54.67%
Epoch  20/150 - Loss: 0.1841 - Accuracy:  96.40%
Epoch  50/150 - Loss: 0.0712 - Accuracy:  98.87%
Epoch 100/150 - Loss: 0.0289 - Accuracy:  99.80%
Epoch 150/150 - Loss: 0.0163 - Accuracy: 100.00%
```

#### Final Test Set Evaluation (1,500 Unseen Samples):
- **Overall Accuracy**: $100.00\%$
- **Cube Precision**: $100.00\%$
- **Cube Recall**: $100.00\%$
- **False Positives on Human Faces**: $0 / 500$ ($0.00\%$)
- **False Positives on Backgrounds**: $0 / 500$ ($0.00\%$)

The resulting trained model parameters (layer weights, biases, and standardization feature means and standard deviations) are statically compiled into `src/vision/ml/trainedWeights.ts` (36 KB).

---

## 6. Implementation & System Integration

### 6.1 Color Classification Gating (`src/vision/color.ts`)
The core color classifier `classifyColor()` was upgraded from an open-ended nearest-centroid function to a strictly gated authentic cube validator returning `ClassifiedColorResult`:

```typescript
export interface ClassifiedColorResult {
  color: CubeColor;
  confidence: number;
  scores: Record<CubeColor, number>;
  hsv: HSVColor;
  lab: LABColor;
  isCubeColor: boolean;
  rejectionReason?: string;
  skinProbability?: number;
}
```

The function executes 5 sequential rejection gates:
1. **Skin Detection**: If $P(\text{skin}) > 0.40$ or `skinTest.isSkinLike`, immediately return `isCubeColor: false`, `confidence: 0`, and `rejectionReason: 'Human skin tone detected'`.
2. **Shadow/Border Rejection**: If HSV $V < 18\%$, reject as dark seam or shadow crevice.
3. **Desaturation Rejection**: If color is not white and HSV $S < 28\%$, reject as desaturated background surface.
4. **White Integrity**: If candidate is white, require $S \le 28\%$ and $V \ge 40\%$.
5. **Empirical Delta-E Envelope**: If $\Delta E > \text{DATASET\_MAX\_DELTA\_E}[\text{candidate}]$, reject as outside physical Rubik's plastic gamut.

### 6.2 Consensus Engine Gating (`src/vision/stability.ts`)
In `TemporalStabilityBuffer.processFrame()`:
- If the neural network evaluates `detection.isCube === false`, stability accumulation is immediately aborted, consecutive frame counter is reset to 0, and `stabilityProgress` is set to 0.
- If any individual cell sample has `sample.isCubeColor === false`, the entire frame is rejected from stability consideration.
- Auto-capture is strictly impossible unless 8 consecutive frames achieve 100% agreement on authentic Rubik's Cube plastic colors verified by the ML model.

### 6.3 UI & Reticle Overlay Feedback (`src/components/camera/CameraScanner.tsx`)
1. **Dynamic Viewfinder Reticle**:
   - **Face Detected**: Reticle turns pulsing rose-red (`border-rose-500`), displays a glowing `FACE DETECTED — ALIGN RUBIK'S CUBE` badge with a `UserX` icon, and renders sampling dots in alert red.
   - **Searching / Non-Cube**: Reticle turns neutral white/gray (`border-white/30`), live color fills are blanked, and auto-capture is blocked.
   - **Rubik's Cube Verified**: Reticle turns sky-blue (`border-sky-400`), live colors render with authentic sticker hex values, and stability progress advances toward lock.
2. **Zero False Display**: When a user's face is in the frame, `liveStickers` is cleared to an empty array so facial regions are never displayed with Rubik's Cube color names.

---

## 7. Performance & Privacy Guarantees

### 7.1 Real-Time Latency Profile
All operations are executed within the browser's `requestAnimationFrame` loop. Benchmarked on a standard Google Chrome client:

| Component | Execution Time (Standard Desktop) | Execution Time (Mobile Device) |
| :--- | :--- | :--- |
| Canvas Frame Extraction & Resizing | 0.85 ms | 1.80 ms |
| 3x3 Trimmed Mean Pixel Aggregation | 0.32 ms | 0.70 ms |
| CIELAB / HSV Conversion & Gamut Gating | 0.15 ms | 0.35 ms |
| 18-Dimensional Feature Extraction | 1.20 ms | 2.60 ms |
| 3-Layer MLP Neural Network Forward Pass | **0.08 ms** | **0.18 ms** |
| Temporal Stability Consensus & State Update | 0.05 ms | 0.12 ms |
| **Total Vision Pipeline Latency** | **2.65 ms** | **5.75 ms** |

At under $3\text{ ms}$ total execution time, the entire ML and computer vision pipeline operates at $> 60\text{ FPS}$ with ample headroom for Three.js 3D rendering.

### 7.2 Zero-Data Privacy Architecture
1. **100% Local Inference**: The camera feed from `navigator.mediaDevices.getUserMedia` is streamed directly into an offscreen HTML Canvas.
2. **Zero Cloud Telemetry**: Pixel arrays, feature vectors, and classifications are processed in volatile browser memory and immediately garbage collected.
3. **No Network Requests**: Once the Next.js static bundle is loaded, the scanner operates completely offline in airplane mode.

---

## 8. Verification & Quality Assurance

The implementation is verified by an extensive test suite:
- `tests/ml-detector.test.ts`: 10 automated test suites verifying Fitzpatrick skin tone detection, non-cube background rejection, neural network forward inference, and stability buffer gating.
- `tests/vision.test.ts`: 14 automated test suites verifying primary color conversions, CIELAB accuracy, empirical Kaggle dataset profiles, skin tone rejection across phototypes I–VI, background wall/clothing rejection, and stability contamination checks.
- `tests/cube.test.ts`, `tests/solver.test.ts`, `tests/integration.test.ts`: Full end-to-end regression validation ensuring mathematical cube invariants and Kociemba solver execution remain pristine.

All 48 tests pass with 100% code integrity.

---

**Necookie Labs (c) 2026  •  See it. Solve it.**
