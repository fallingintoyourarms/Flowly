# Contributing to Flowly

Thanks for contributing! Flowly is meant to be a **clean, minimal devtool**:

- clear architecture
- readable TypeScript
- small, focused modules
- simple UI (no heavy frameworks)

## Development setup

```bash
npm install
npm run dev
```

- UI: http://localhost:5173
- Proxy (default): http://localhost:9090
- Dashboard API (default): http://localhost:9091

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

## Reporting issues

When filing a bug, include:

- your OS + Node version
- command you ran (and ports)
- minimal repro steps
- any relevant console output (server + browser)
