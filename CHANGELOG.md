# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [0.2.0] 2026-03-11

### Added

- Traffic analytics endpoint `GET /analytics/overview` (RPS, average latency, status distribution, latency histogram).
- Flexible request querying endpoint `GET /requests/query` (method/status range/keyword/regex filtering).
- Export endpoints `GET /export.json` and `GET /export.csv` plus `POST /import.json` alias.
- Dashboard filtering UI (method, status range, keyword, regex) wired to `/requests/query`.
- Dashboard visualizations for status distribution and latency histogram (no extra chart deps).
- Error highlighting for 4xx/5xx requests with heuristic “Analysis” hints in request details.
- Replay job tracking metadata and UI badges (running/succeeded/failed, timestamp, error info).
- Side-by-side compare mode by pinning two requests in the list.

### Changed

- Fix Node.js ESM runtime by adding explicit `.js` extensions to internal relative imports.
- Improve WebSocket debugging by capturing and displaying WebSocket frames.

## [Unreleased]

### Added

- Tailwind CSS foundation for the UI (Tailwind layers + theme tokens).
- shadcn-style UI primitives (Button, Input, Card, Badge, Tabs, Tooltip).
- UI navigation tabs (Requests / Analytics / Settings) as part of the ongoing dashboard redesign.
- UI-specific TypeScript config `ui/tsconfig.json` for Vite/editor resolution.

> [!NOTE]
> The UI is actively being redesigned. Expect rapid iteration on layout and component structure until the Tailwind/shadcn rewrite stabilizes.

## [0.1.5] - 2026-03-10

### Added

- Import traces via internal API `POST /import`.
- Optional persistence via CLI flag `--persist <file>` (load on start, save on shutdown).
- UI polish: segmented toolbar, improved list/table styling, and layout primitives.

## [0.1.4] - 2026-03-10

### Changed

- UI polish: improved header layout, toolbar spacing, list row styling, sticky details header, and refined global styles.

## [0.1.3] - 2026-03-10

### Changed

- Replace dashboard polling with SSE live updates (`GET /events`).

## [0.1.2] - 2026-03-10

### Added

- Cap in-memory history to 500 requests (trims oldest entries).
- Internal API endpoint `GET /export` to export the current trace as JSON.

## [0.1.1] - 2026-03-10

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

