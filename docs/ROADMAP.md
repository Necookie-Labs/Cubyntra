# Cubyntra Product Roadmap

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Current Release**: 2.0.0, the local cube tutor (2026-11-17)

---

## 1. Version Overview

| Release | Focus | Status |
|:---|:---|:---:|
| **1.0** | Webcam scanner, validation, Kociemba solver, 3D twin | Shipped 2026-09 |
| **2.0** | Local single-student tutor: beginner's and CFOP, teaching twin, checkpoints, Claude coach, trainer, timer, progress, state-only phone sync | **Current** |
| **Next** | Real-world hardening of 2.0 (see §3) | Not started |
| **Future** | Robotics rig (concept only) | Out of scope |

---

## 2. Milestones

### 2.1 Version 1.0: Scanner and Solver
- [x] Webcam scanning with reticle sampling, CIELAB / HSV classification and temporal stability.
- [x] Validation of counts, centers, pieces and parity.
- [x] Kociemba two-phase solver, verified by simulation.
- [x] Three.js twin with drift-free integer snapping and move arrows.

### 2.2 Version 2.0: The Tutor (Phases 0–10 of `docs/tutor/GOAL.md`)
- [x] Stabilize: arrow direction, ML feature parity, red/orange boundary, strict `parseMove`.
- [x] Voxel design system with enforced style rules (ADR-011).
- [x] Raised design system: navy-to-indigo gradient, rounded surfaces, pressable buttons, enforced rules (ADR-018).
- [x] Cube engine: rotations, wide moves, slices, grip model, piece queries, move names.
- [x] Deterministic tutor engine: beginner's method and CFOP with 41-case F2L and 2-look last
      layer (ADR-012); full 57 OLL / 21 PLL as a setting.
- [x] Teaching twin: grip camera, spotlight, slot outline, move chips, playback, "after" preview,
      Web Worker, context-loss recovery.
- [x] Checkpoint checks with the student's palette, mistake diagnosis and recovery (ADR-013).
- [x] Claude Haiku 5.5 coach with guardrail, templates, mock mode and $10/month cap (ADR-014).
- [x] App shell and PWA manifest, wake lock, resume from `data/student.json`.
- [x] State-only phone ↔ laptop sync; photo relay removed (ADR-015).
- [x] Trainer, timer, progress world, graduation.
- [x] Accessibility pass, docs, README, CHANGELOG, PDFs.

---

## 3. Next: Known Gaps of 2.0
Taken from the known limits in [`docs/tutor/CHECKPOINTS.md`](tutor/CHECKPOINTS.md) §8,
[`docs/tutor/METHODS.md`](tutor/METHODS.md) §9 and [UI_UX.md](UI_UX.md) §5.4. None is
scheduled.
- [ ] Measure checkpoint reading and diagnosis with real cameras, real glare and worn stickers
      (all current numbers are from synthetic photos).
- [ ] Service-worker offline caching (needs a certificate the phone trusts; see
      [DEVELOPMENT.md](DEVELOPMENT.md) §6.6).
- [ ] A live-key run of `npm run coach:eval` reviewed by hand.
- [ ] Alternative algorithms and left-handed mirrors for the last-layer cases; F2L slots other
      than front-right.

---

## 4. Not Planned
Recorded as non-goals in `docs/tutor/GOAL.md`: hosting, accounts, multiple users, teacher
dashboards, native apps, Bluetooth smart cubes, tracking moves from live video, and languages
other than English. A physical robotic solver remains a concept document only
([FUTURE_HARDWARE.md](FUTURE_HARDWARE.md)).
