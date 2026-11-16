# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Privacy & Local Security

Cubyntra runs on the student's own laptop, with a phone on the same Wi-Fi as an optional camera:
- Camera frames are sampled to tile colors in the browser tab that owns the camera and discarded. No image leaves the device that captured it; the phone and laptop exchange cube states only, through the laptop's own server process.
- With an `ANTHROPIC_API_KEY`, the laptop's server sends Anthropic a small facts JSON about the current step (never images, cube state or the student's name). Without a key nothing is sent.
- The profile, coach usage and app secret are files in `data/` on the laptop. No telemetry or analytics are collected.
- Pairing is protected by a 128-bit session secret and a loopback-only app token; the known limits are listed in [docs/SECURITY_PRIVACY.md](docs/SECURITY_PRIVACY.md) §6.3.

## Reporting a Vulnerability

Necookie Labs takes security and user privacy seriously. If you discover a security vulnerability in Cubyntra, please report it privately:

1. **GitHub Security Advisory**: Open a draft security advisory at [https://github.com/Necookie-Labs/Cubyntra/security/advisories/new](https://github.com/Necookie-Labs/Cubyntra/security/advisories/new).
2. **Alternative**: If private advisories are unavailable, submit a confidential issue directly to the repository maintainers through GitHub.

Please include:
- A detailed description of the vulnerability.
- Steps to reproduce or proof-of-concept code.
- Impact on client browser runtime or dependencies.

We will acknowledge receipt within 48 hours and provide updates until the vulnerability is addressed.
