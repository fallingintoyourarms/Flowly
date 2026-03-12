# Flowly

Flowly is a **local API traffic debugger** that runs as a proxy between your frontend and backend.

Instead of calling your API directly:

- Frontend → Backend API

You route traffic through Flowly:

- Frontend → **Flowly Proxy** → Backend API

Flowly captures HTTP and WebSocket traffic (method/path/headers/bodies/timing) and renders it in a DevTools-inspired dashboard.

> [!CAUTION]
> Flowly captures request/response bodies and headers. These can contain secrets (cookies, tokens, API keys) and PII.

## Quickstart

### 1) Install deps

From the repo root:

```bash
npm install
```

### 2) Start the UI (Vite)

```bash
cd ui
npm install
npm run dev
```

Open:

- http://localhost:5173

> [!NOTE]
> The UI dev server proxies `/api/*` to Flowly’s internal API (`http://127.0.0.1:9091`) via `ui/vite.config.ts`.

### 3) Start Flowly (proxy + API)

```bash
npx tsx ./cli/start.ts start --target http://127.0.0.1:3000 --port 9090 --apiPort 9091
```

> [!IMPORTANT]
> `--target` must be a valid URL (for example `http://127.0.0.1:3000`). Placeholders like `http://127.0.0.1:XXXX` will not work.

Now configure your frontend to call the proxy:

- Backend API: `http://127.0.0.1:3000`
- Flowly proxy: `http://127.0.0.1:9090`

So your frontend calls:

- `http://127.0.0.1:9090/users`

Flowly forwards the request to:

- `http://127.0.0.1:3000/users`

## Features

- Capture HTTP requests/responses (headers + bodies + timing)
- WebSocket upgrade detection and frame capture
- Request replay (original + modified)
- Request filtering + search + regex query
- Analytics (RPS, status distribution, latency histogram)
- Export/import traces
- Side-by-side comparison (pin two requests)

## Architecture

High-level components:

- **Proxy** (`core/`): intercepts and forwards requests
- **Internal API** (`server/`): serves captured requests + analytics + replay endpoints
- **Storage** (`storage/`): in-memory store + event subscriptions
- **UI** (`ui/`): Vite + React dashboard

Repository layout:

```
flowly/
  core/
  storage/
  server/
  ui/
  cli/
  types/
```

## Security & privacy

> [!WARNING]
> Avoid sharing raw traces in public issues/PRs. Even masked headers may still expose sensitive data via bodies, URLs, or screenshots.

## Troubleshooting

### UI shows `ECONNREFUSED 127.0.0.1:9091`

- Confirm Flowly API is running on `9091`
- If you changed `--apiPort`, update `ui/vite.config.ts` accordingly

### Port already in use (`EADDRINUSE`)

```bash
npx tsx ./cli/start.ts start --target http://127.0.0.1:3000 --port 9092 --apiPort 9093
```

Then update the Vite proxy target to `9093`.
