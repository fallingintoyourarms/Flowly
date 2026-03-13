# Security Policy

## Supported versions

Flowly is under active development. Only the latest `main` branch is supported.

## Reporting a vulnerability

If you believe you’ve found a security issue, please report it responsibly.

> [!WARNING]
> Do **not** open a public issue with exploit details.

Recommended workflow:

- Create a minimal issue that requests a private channel, or
- Contact the maintainers directly (if contact info is available)

Include:

- Description
- Steps to reproduce
- Impact (what an attacker could do)
- Suggested fix/mitigation (if you have one)

## Sensitive data & traces

Flowly is a local tool that inspects HTTP and WebSocket traffic. Captured traces can include:

- Authorization headers
- Cookies / session identifiers
- API keys / tokens
- PII in request/response bodies

> [!CAUTION]
> Treat traces as secrets. Don’t paste them into public issues/PRs, and be careful when screen sharing.

> [!IMPORTANT]
> Flowly can persist traces locally via SQLite (default `./.flowly/traces.db`). Protect your machine/user account accordingly and avoid committing local trace databases.

## Out of scope

Because Flowly runs locally and only proxies traffic you direct to it, issues in your upstream services (target APIs) are out of scope unless Flowly directly causes the impact.
