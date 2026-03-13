# Flowly

Flowly is a **local API traffic debugger**. Run it as a proxy between your frontend and backend to capture requests, inspect responses, and replay traffic.

> [!CAUTION]
> Flowly captures request/response bodies and headers. These can contain secrets (cookies, tokens, API keys) and PII.

## Quickstart

From the repo root:

```bash
npm install
```

Start the UI:

```bash
cd ui
npm install
npm run dev
```

Start Flowly (proxy + internal API):

```bash
npx tsx ./cli/start.ts start --target http://127.0.0.1:3000 --port 9090 --apiPort 9091
```

Open:

- UI: http://localhost:5173

## Ports

- Proxy: `http://127.0.0.1:9090`
- Internal API: `http://127.0.0.1:9091`
- UI (dev): `http://127.0.0.1:5173`

> [!IMPORTANT]
> `--target` must be a valid URL (for example `http://127.0.0.1:3000`). Placeholders like `http://127.0.0.1:XXXX` will not work.

## Highlights

- Capture HTTP + WebSocket traffic (including WS frames)
- Replay requests (original + modified)
- Filtering/search/regex query + analytics
- Sessions (group requests, tag them, export + replay)
- SQLite trace persistence (default `./.flowly/traces.db`) + history querying
- Automatic insights (latency anomalies, regression signals, error pattern changes, caching recommendations)

## Troubleshooting

- If the UI can’t reach the API (`ECONNREFUSED 127.0.0.1:9091`):
  - Confirm Flowly is running on `--apiPort 9091`
  - If you changed `--apiPort`, update `ui/vite.config.ts`
