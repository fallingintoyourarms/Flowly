# Security Policy

## Supported Versions

This project is in early development. Only the latest `main` branch is supported.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

> [!WARNING]
> Do **not** open a public issue with exploit details.

Preferred workflow:

- Open a minimal issue requesting a private channel, or
- Contact the maintainers directly if contact info is available.

Please include:

- a description of the issue
- steps to reproduce
- impact assessment (what an attacker could do)
- any suggested fix

## Scope notes

Flowly is a local developer tool that inspects HTTP traffic. Be careful when capturing:

- authorization headers
- cookies
- tokens
- PII

Captured data is stored in-memory only, but it may still be visible on-screen and in logs.

> [!CAUTION]
> Treat captured traces as sensitive. Don’t paste them into public issues, and avoid screen sharing while sensitive requests are visible.

> [!TIP]
> If you need to share a trace with maintainers, redact tokens and remove bodies that contain PII before sending.
