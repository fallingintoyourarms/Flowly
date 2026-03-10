# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [0.2.0] - 2026-03-10

### Added

- Sensitive header masking by default with a dashboard toggle to reveal (`authorization`, `cookie`, `set-cookie`, `x-api-key`).
- "Copy as cURL" action in the request details pane.
- Internal API endpoint `POST /send-test` to generate a test request without browser CORS.
- Dashboard controls: Pause capture, Clear captured requests, and Send test request.

### Changed

- Fix dev script to invoke `flowly start` so `--apiPort` is correctly applied.

## [0.1.0] - 2026-03-10

### Added

- Proxy server that forwards requests to a configurable `--target`
- Request/response capture (method, path, headers, bodies, status, timing)
- In-memory store for captured requests
- Internal dashboard API (`GET /requests`, `GET /requests/:id`)
- Dashboard UI (request list + request/response details)
- Request replay endpoint and UI button
- CLI command `flowly start` with `--target`, `--port`, `--apiPort`

