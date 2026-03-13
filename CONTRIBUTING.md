# Contributing

Thanks for contributing to Flowly.

## Project goals

- Keep the proxy/capture pipeline understandable
- Prefer simple building blocks over heavy abstraction
- Make debugging UX fast and readable

> [!IMPORTANT]
> Flowly captures traffic that may include secrets/PII. Avoid attaching raw traces to public issues.

## Development

From repo root:

```bash
npm install
npm run dev
```

Defaults:

- UI: http://localhost:5173
- Proxy: http://localhost:9090
- API: http://localhost:9091

UI-only:

```bash
cd ui
npm install
npm run dev
```

## Repo layout

- `core/`: proxy server + capture pipeline
- `server/`: internal API used by the UI
- `storage/`: in-memory store + SQLite persistence
- `ui/`: Vite + React dashboard
- `cli/`: CLI entrypoint
- `types/`: shared types

## Pull requests

Please include:

- What changed
- Why
- How you tested

If you add a user-facing change, update:

- `CHANGELOG.md`
- `README.md`

## Testing checklist

- Start a sample backend API (example: `http://127.0.0.1:3000`)
- Start Flowly with `--target http://127.0.0.1:3000`
- Send traffic through the proxy (`http://127.0.0.1:9090`)
- Verify:
  - Requests appear in the UI
  - Replay works (original + modified)
  - WebSocket frames appear for WS traffic
  - Sessions: tag current session + replay a session
  - History query works (`GET /requests/history`)

> [!TIP]
> When reporting a UI issue, include a screenshot plus browser console logs (redacted if necessary).
