# Cubyntra Product Roadmap (V1 to V4)

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Current Milestone**: V1 (Shipped)

---

## 1. Version Overview Matrix

| Release | Focus Area | Status | Target Delivery |
|:---|:---|:---:|:---:|
| **V1.0** | Core Client-Side Vision, Validation, Kociemba Solver, 3D Twin | **Completed** | Q3 2026 |
| **V2.0** | Web Worker Multithreading, Automatic Homography Warping, Voice Cues | Planned | Q1 2027 |
| **V3.0** | Bluetooth Smart Cube Support, CFOP Training Suite, Reconstructions | Planned | Q3 2027 |
| **V4.0** | Physical Robotics Rig, ESP32 Kinematics, Web Serial Controller | Future / Scope Out | 2028 |

---

## 2. Milestone Details

### 2.1 Version 1.0 (Current Release) — The Solid Foundation
- [x] Client-side Computer Vision using WebRTC camera stream.
- [x] Circular kernel color sampling with RGB $\to$ HSV and CIELAB transforms.
- [x] $\Delta E$ color classification with real-time temporal stability filtering.
- [x] Mathematical invariant validator (cardinality, physical piece integrity, parity).
- [x] Interactive error recovery modal for optical misclassifications.
- [x] Deterministic Herbert Kociemba two-phase solver (< 50ms execution).
- [x] Three.js 3D digital twin with drift-free integer snapping and 3D directional turn arrows.
- [x] Full playback controls (play/pause, step forward/backward, speed multiplier).
- [x] Comprehensive automated test coverage (35/35 passing).
- [x] Complete technical documentation suite and PDF specifications.

---

### 2.2 Version 2.0 — Computer Vision & Worker Optimization
- [ ] **Web Workers Solver**: Offload Kociemba IDA* search to dedicated background workers, guaranteeing 0ms main thread blocking during complex scrambles.
- [ ] **Automatic Perspective Homography**: Automatic four-corner contour detection and perspective rectification, removing the need for a rigid reticle overlay.
- [ ] **Voice-Guided Step Directions**: Text-to-speech engine speaking aloud moves (e.g. "Turn the Right face clockwise 90 degrees") for hands-free solving.
- [ ] **Ambient Light Auto-Calibration**: Dynamic histogram equalization to handle extreme low-light or yellow tungsten environments.

---

### 2.3 Version 3.0 — Smart Cubes & Advanced Speedcubing
- [ ] **Bluetooth Smart Cube Integration**: Web Bluetooth API connection to GAN, GoCube, and Moyu smart cubes for real-time hardware telemetry.
- [ ] **CFOP & Roux Method Training**: Breakdown of solutions into Cross, F2L, OLL, and PLL stages with algorithmic alternatives.
- [ ] **URL State Serialization**: Encode scramble positions and custom solution paths into compact URL hash fragments for zero-backend sharing.
- [ ] **Inspection Timer & Metrics**: WCA-compliant 15-second inspection countdown and turns-per-second (TPS) analytics.

---

### 2.4 Version 4.0 — Physical Robotics Rig (FUTURE / OUT OF SCOPE FOR V1)
> [!NOTE]
> Physical robotics and microcontroller hardware are strictly categorized as **FUTURE / OUT OF SCOPE FOR V1**.

- [ ] **ESP32 Firmware**: Dedicated micro-ROS or lightweight serial firmware for 6-axis NEMA-17 stepper motor coordination.
- [ ] **Web Serial / Web Bluetooth Execution**: Direct hardware bridge from Cubyntra web app to the physical robotic rig.
- [ ] **Kinematic Acceleration Profiling**: S-curve acceleration curves to prevent cube popping during sub-second physical turns.
- [ ] **Physical Optical Alignment**: Dual-camera stereoscopic rig tracking physical cube faces during mechanical rotation.
