# Flowly

Flowly is a **local API traffic debugger** that runs as a proxy between your frontend and backend.

Instead of calling your API directly:

- Frontend → Backend API

You route traffic through Flowly:

- Frontend → **Flowly Proxy** → Backend API

Flowly captures:

- HTTP method + path
- request headers + body
- response status + headers + body
- response time

…and displays everything in a clean dashboard (inspired by the browser DevTools network panel).

## Features

- **Local proxy** (default `http://localhost:9090`) with request/response capture
- **In-memory storage** (no database)
- **Dashboard API** (default `http://localhost:9091`) for the UI
- **React dashboard** (Vite dev server at `http://localhost:5173`)
- **Request replay** from the dashboard

## Project structure

```
flowly/
  core/
    proxyServer.ts
    requestCapture.ts
    responseCapture.ts
  storage/
    memoryStore.ts
  server/
    apiServer.ts
  ui/
    dashboard/
    components/
  cli/
    start.ts
  types/
    capturedRequest.ts
```

## Requirements

- Node.js 18+ (Flowly uses modern Node APIs)
- npm

## Install

From the repo root:

```bash
npm install
```

## Usage

### Start Flowly (dev mode)

This starts:

- Proxy server (default `9090`)
- Internal API server (default `9091`)
- Dashboard UI dev server (default `5173`)

```bash
npm run dev
```

Open the dashboard:

- http://localhost:5173

### Start Flowly via CLI

```bash
npx tsx ./cli/start.ts start --target http://localhost:3000 --port 9090 --apiPort 9091
```

Options:

- `--target` (required): target API base URL (ex: `http://localhost:3000`)
- `--port` (optional): proxy listen port (default `9090`)
- `--apiPort` (optional): internal dashboard API port (default `9091`)

### Configure your frontend

Point your frontend API base URL to Flowly instead of the backend.

Example:

- backend API: `http://localhost:3000`
- flowly proxy: `http://localhost:9090`

So your frontend should call:

- `http://localhost:9090/users`

and Flowly will forward the request to:

- `http://localhost:3000/users`

## Request replay

In the dashboard, select a request and click **Replay Request**.

Flowly will:

- resend the original request to the same target URL
- store it as a new captured request

## Troubleshooting

### Dashboard shows `ECONNREFUSED 127.0.0.1:9091`

This means the UI can’t reach Flowly’s internal API.

Check:

- Is the API server running on `9091`?
- Are you using a different `--apiPort`?

The UI dev server proxies `/api/*` to `http://127.0.0.1:9091` (see `ui/vite.config.ts`). If you change `--apiPort`, update the Vite proxy target accordingly.

### Port already in use (`EADDRINUSE`)

Another process is already using the port (ex: `9090`). Stop it or choose a different port:

```bash
npx tsx ./cli/start.ts start --target http://localhost:3000 --port 9092 --apiPort 9093
```

Then update the Vite proxy target to `9093`.

## Notes

- Storage is **in-memory** (restarting Flowly clears captured requests)
- Flowly is intentionally minimal and focused on readability and a clean architecture
