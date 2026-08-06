# Repository guidelines for AI coding assistants

LealChess is a local-first Angular chess training application. It runs entirely in the browser:
there is no application server, no cloud database, and no analytics.

This file is the machine-readable companion to [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Where they disagree, those documents win.

## Before you start

Read [README.md](README.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Read
[docs/PRIVACY.md](docs/PRIVACY.md) before changing persistence or anything that makes a network
request.

## Architecture

Runtime dependencies flow in one direction:

```text
features → core → shared
```

- `core` and `shared` must never import from `features`.
- `shared` must never import from `core`.
- Features must never import one another. Promote a proven cross-feature concept to `core` or
  `shared` behind a deliberately small API.

A routed page is a shell: it composes focused components, binds view events, and reflects state.
Multi-step route, session, loading, and practice orchestration belongs in a feature-scoped store
that exposes readonly signals and explicit commands. UI components never talk to Stockfish workers
directly.

Services that cross a system boundary are adapters: Stockfish workers, the Chess.com and Lichess
HTTP APIs, IndexedDB, and browser audio. Depend on the narrow service contract, not on worker,
network, or database details.

## Angular conventions

- Standalone components only. There is no `NgModule` in this repository.
- Signals for state; RxJS only at HTTP and DOM boundaries.
- **Every component uses `templateUrl` and `styleUrl` with sibling `.html` and `.scss` files.
  Never use an inline template or inline styles.**
- kebab-case filenames, PascalCase types, camelCase members.
- Routes are lazy via `loadComponent`.
- Prettier enforces single quotes and a 100-column width.

## Local data and privacy

Persisted IndexedDB records are a public compatibility boundary even though they are not an
exported TypeScript API.

- Never change a stored key or record shape incidentally.
- Validate unknown data before restoring it.
- Add an explicit, tested migration before an incompatible schema change.
- Failed or partial records must fall back safely without deleting unrelated local data.
- Never add analytics, tracking, cloud synchronization, or new outbound network access.

The application contacts Chess.com or Lichess only after an explicit user import action.

## Tests

- Unit tests are colocated with their source as `*.spec.ts`.
- Playwright specs live in `e2e/`.
- Add tests for behavior changes and regressions.
- In UI tests, prefer roles, element state, accessibility attributes, outputs, and interaction
  outcomes over raw rendered-copy assertions. Assert on text only when the copy is itself a product
  or accessibility contract.

Run `pnpm verify:quality` before opening a pull request, and `pnpm e2e` for user-facing flows.

## Commits and pull requests

- Branch from current `main` using `feature/**`, `bugfix/**`, `docs/**`, `refactor/**`, or
  `chore/**`.
- Use concise commit subjects without conventional-commit prefixes such as `chore:` or `feat:`.
- Keep commits and pull requests focused.
- Pull requests explain the change and the verification performed, and link the agreed issue.
- Include screenshots in the pull request for user-visible changes.
- The `quality` and `browser` checks must pass before merge.

## Deployment

`origin/release` deploys to <https://lealchess.com>.
