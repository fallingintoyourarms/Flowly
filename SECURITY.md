# Security Policy

## Supported Versions

This project is in early development. Only the latest `main` branch is supported.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

- Do **not** open a public issue with exploit details.
- Instead, open a minimal issue requesting a private channel, or contact the maintainers directly if contact info is available.

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
