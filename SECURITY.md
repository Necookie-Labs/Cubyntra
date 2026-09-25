# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Privacy & Client-Side Security

Cubyntra is designed with a **zero-cloud computer vision privacy model**:
- All webcam stream capture, pixel sampling, color classification, state reconstruction, and solving logic are executed strictly **locally inside the client browser**.
- Video frames and image samples are never uploaded, stored on servers, or transmitted across the network.
- No user telemetry or analytics are collected without explicit user consent.

## Reporting a Vulnerability

Necookie Labs takes security and user privacy seriously. If you discover a security vulnerability in Cubyntra, please report it privately:

1. **GitHub Security Advisory**: Open a draft security advisory at [https://github.com/Necookie-Labs/Cubyntra/security/advisories/new](https://github.com/Necookie-Labs/Cubyntra/security/advisories/new).
2. **Alternative**: If private advisories are unavailable, submit a confidential issue directly to the repository maintainers through GitHub.

Please include:
- A detailed description of the vulnerability.
- Steps to reproduce or proof-of-concept code.
- Impact on client browser runtime or dependencies.

We will acknowledge receipt within 48 hours and provide updates until the vulnerability is addressed.
