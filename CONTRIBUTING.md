# Contributing to LealChess

Thanks for helping make local-first chess study better. Start with an issue so scope and product
fit can be agreed before substantial implementation.

## Setup

Use Node.js 24 and pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm start
```

LealChess runs entirely in the browser. Stockfish workers are loaded locally, and IndexedDB stores
games, preferences, imports, and analysis.

## Architecture and implementation

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing runtime boundaries. Dependencies
flow from features to core to shared. Do not import one feature from another. Keep route components
thin, place orchestration in feature stores, and put external integrations behind adapters.

Angular components use kebab-case filenames, PascalCase types, camelCase members, and sibling
`templateUrl` and `styleUrl` files. Prettier enforces single quotes and a 100-column width.

Preserve local data formats unless an explicit migration is part of the issue. Never add analytics,
remote storage, or new network access without discussing the privacy impact first.

## Workflow

- Branch from current `main` using `feature/**`, `bugfix/**`, `docs/**`, `refactor/**`, or
  `chore/**`.
- Use a concise commit subject without conventional-commit prefixes.
- Keep changes focused and link the agreed issue in the pull request.
- Update the newest dated `Unreleased` section in `docs/CHANGELOG.md` for notable changes.
- Do not include screenshots in pull requests.

Run `pnpm verify:quality` before opening a pull request and `pnpm e2e` for user-facing flows.
Changes should include focused unit or characterization tests. Check keyboard use, focus order,
accessible names, contrast, reduced motion, mobile layout, and all three Playwright browsers.

Maintainers require the `quality` and `browser` checks to pass and review accessibility, privacy,
and persistence compatibility before merge.
