# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [0.1.0] - 2026-03-10

### Added

- Proxy server that forwards requests to a configurable `--target`
- Request/response capture (method, path, headers, bodies, status, timing)
- In-memory store for captured requests
- Internal dashboard API (`GET /requests`, `GET /requests/:id`)
- Dashboard UI (request list + request/response details)
- Request replay endpoint and UI button
- CLI command `flowly start` with `--target`, `--port`, `--apiPort`
