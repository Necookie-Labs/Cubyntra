# ADR-003: Guided Reticle Sampling with CIELAB Delta-E vs Deep Learning Object Detection

**Date**: 2026-09  
**Status**: Accepted  
**Deciders**: Necookie Labs Core Engineering Team

---

## Context
Accurate sticker color detection from a smartphone or laptop camera must operate across diverse ambient lighting conditions, camera sensors, and cube plastic finishes (matte vs glossy). Two approaches were evaluated:
1. **Deep Learning Object Detection (YOLO / MobileNet)**: Training a neural network to detect the 3D cube pose, segment facelets, and classify colors.
2. **Deterministic Geometric Reticle with CIELAB Delta-E**: Rendering an on-screen $3 \times 3$ alignment guide, sampling pixels using circular Gaussian averaging, converting sRGB to CIELAB $L^* a^* b^*$, and classifying colors via Euclidean $\Delta E$ perceptual distance with temporal stability filtering.

---

## Decision
We chose **Deterministic Geometric Reticle with CIELAB Delta-E & Temporal Stability Filtering**.

---

## Rationale
1. **Bundle Size & Instant Load**: Neural network weights (TensorFlow.js / ONNX) require 15–50 MB downloads, introducing significant startup latency. The deterministic pipeline adds less than 10 KB to the bundle.
2. **Computational Footprint & Battery**: Running CNN inference at 30 FPS quickly exhausts mobile device batteries and causes thermal throttling. Reticle sampling consumes under 2% CPU.
3. **Perceptual Color Accuracy**: Standard RGB Euclidean distance fails under yellow or fluorescent lighting. CIELAB $L^* a^* b^*$ separates perceptual lightness ($L^*$) from chromaticity ($a^*, b^*$), enabling robust color discrimination (especially separating White vs Yellow and Orange vs Red).
4. **Temporal Stability Filtering**: Requiring 10 consecutive frames of identical classification eliminates camera motion blur and focus hunt errors.

---

## Consequences
- **Positive**:
  - Instant application loading (< 100 KB total bundle).
  - 60 FPS performance on even low-end mobile hardware.
  - High color classification accuracy in controlled lighting.
- **Negative / Trade-offs**:
  - Requires the user to align the physical cube within the on-screen reticle. Automatic pose detection deferred to V2.
