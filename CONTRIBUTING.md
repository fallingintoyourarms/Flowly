# Contributing to Flowly

Thanks for contributing! Flowly aims to stay a **clean, minimal devtool**:

- Clear architecture
- Readable TypeScript
- Small, focused modules
- Practical UI (fast, minimal dependencies)

## Development setup

```bash
npm install
npm run dev
```

- UI: http://localhost:5173
- Proxy (default): http://localhost:9090
- Dashboard API (default): http://localhost:9091

> [!IMPORTANT]
> The UI runs as a separate Vite app in `ui/`. If you’re only changing UI code, you can run `npm run dev` in `ui/` directly.

## Repository layout

- `core/`: proxy + capture pipeline
- `storage/`: in-memory store
- `server/`: internal API for the dashboard
- `ui/`: React + Vite dashboard
- `cli/`: CLI entrypoint
- `types/`: shared TypeScript interfaces

## Coding standards

- TypeScript everywhere
- Prefer small, composable functions over large files
- Keep modules focused (single responsibility)
- Avoid unnecessary abstractions
- Add **helpful** comments, especially for proxy/capture behavior

## Pull request guidelines

- Keep PRs small and focused
- Include a short description of:
  - what changed
  - why it changed
  - how to test
- If you add a feature, update `README.md` and `CHANGELOG.md`

## Testing

Flowly currently relies on manual testing:

- Start a sample backend API (ex: `http://localhost:3000`)
- Start Flowly with `--target http://localhost:3000`
- Send requests through the proxy (`http://localhost:9090`)
- Verify requests show in the dashboard and replay works

> [!CAUTION]
> Captured traces can include secrets/PII. Avoid attaching raw traces to public issues.

> [!TIP]
> When reporting a UI bug, include a screenshot plus browser console logs (redacted if necessary).

## Reporting issues

When filing a bug, include:

- your OS + Node version
- command you ran (and ports)
- minimal repro steps
- any relevant console output (server + browser)
