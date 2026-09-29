# ADR-001: Client-Side Only Processing vs Server-Side Offloading

**Date**: 2026-09  
**Status**: Accepted  
**Deciders**: Necookie Labs Core Engineering Team

---

## Context
A Rubik's cube scanner and solver application requires video frame capture, image classification, state validation, and solving algorithm execution. Two fundamental system architectures were evaluated:
1. **Server-Side Processing**: Streaming video frames or snapshots to a backend API/cloud server running OpenCV and native Python/C++ solver binaries.
2. **Client-Side Only Processing**: Running 100% of video sampling, color classification, state validation, and solver algorithms locally within the user's browser via WebRTC, Canvas API, and JavaScript/WASM.

---

## Decision
We decided on **100% Client-Side Processing**. Video streams and pixel data will never leave the browser. Zero image uploads to any server.

---

## Rationale
1. **User Privacy**: Pointing a camera into a user's personal space (home, office, face) presents significant privacy risks. An explicit zero-upload model provides unconditional privacy guarantees.
2. **Latency & Responsiveness**: Streaming multi-megabyte video frames over cellular/Wi-Fi introduces 200–800ms of network latency per frame, disrupting real-time 30 FPS feedback. Local processing operates in < 16ms per frame.
3. **Operational Cost & Scalability**: Zero backend server infrastructure is required for computer vision or solver compute. The application scales infinitely via static CDN hosting at negligible cost.
4. **Offline Capability**: Once downloaded and cached via Service Worker, Cubyntra operates completely offline.

---

## Consequences
- **Positive**:
  - Uncompromising user privacy.
  - Zero cloud compute costs.
  - Near-zero latency real-time visual feedback.
  - Resilience against server downtime.
- **Negative / Trade-offs**:
  - Compute performance is constrained by client device hardware (older mobile devices).
  - Heavy computer vision models (e.g. YOLO/PyTorch) cannot be easily run without significant bundle size bloat; requires lightweight, efficient algorithms.

---

## Amendment (2026-09-29, [ADR-010](010-desktop-side-analysis-and-global-color-resolution.md))
The phone companion now sends each face as a small JPEG crop of the cube to the desktop, through the Cubyntra server process, instead of classifying on the phone. The guarantee is therefore narrowed for that path:

- **Webcam scanning:** unchanged. Frames never leave the browser.
- **Phone scanning:** photos pass through the server in memory only, capped at 1.5 MB, are never written to disk, and are deleted once the user confirms the scan. Color reading still happens entirely in the user's desktop browser; no vision runs on the server.
