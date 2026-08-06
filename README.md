<!-- markdownlint-disable MD033 MD041 -->

<p align="center">
  <img src="public/favicon.svg" width="120" alt="LealChess logo" />
</p>

<h1 align="center">LealChess</h1>

<p align="center">
  <a href="https://github.com/Swellshinider/LealChess/actions/workflows/ci.yml"><img src="https://github.com/Swellshinider/LealChess/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/Swellshinider/LealChess/releases/latest"><img src="https://img.shields.io/github/v/release/Swellshinider/LealChess?label=release&color=d99a3d" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0--only-blue.svg" alt="License: GPL-3.0-only" /></a>
  <br />
  <a href="https://lealchess.com">Play LealChess</a> ·
  <a href="docs/PRIVACY.md">Privacy</a> ·
  <a href="docs/FAQ.md">FAQ</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="https://github.com/Swellshinider/LealChess/issues">Report a bug</a>
</p>

<p align="center">
  Play Stockfish, study the games you played on Chess.com and Lichess, and practice the decisions
  that cost you most — all privately in your browser.
</p>

![The LealChess review board with a game under analysis](docs/screenshots/lealchess_screenshot.png)

## What it does

- **Play** — games against Stockfish across a range of strengths, with move history, sounds, and
  board themes.
- **Learn** — import your games from Chess.com and Lichess, watch your rating trend, and run batch
  analysis across a whole set of games.
- **Review** — walk a game move by move with engine evaluation, classified mistakes, turning-point
  insights, and a full variation tree.
- **Practice** — replay the positions where a game turned and try to find the better move.
- **Explorer** — analyze any position, set one up from FEN, and branch through variations.
- **Settings** — engine profiles, board themes, sound, and keyboard shortcuts.

## Privacy

LealChess is local-first. There is no account service, no cloud database, and no analytics.

- Your games, preferences, imports, and analysis are stored in your browser's IndexedDB.
- Stockfish runs in a Web Worker and is served from the same origin, so analysis never leaves your
  device.
- The application contacts Chess.com or Lichess only when you explicitly ask it to import games.

See [the privacy and data guide](docs/PRIVACY.md) for exactly what is stored and how to clear it,
and the [FAQ](docs/FAQ.md) for common questions.

## Browser support

LealChess is tested against Chromium, Firefox, and WebKit on desktop, plus mobile Chromium.

## Requirements

- Node.js 24.15.0 or newer within the 24.x release line
- pnpm 11.17.0 or newer within the 11.x release line

The supported ranges are enforced by `package.json`.

## Local development

Install the pinned dependencies and start the Angular development server:

```sh
pnpm install --frozen-lockfile
pnpm start
```

Open <http://localhost:4200>. Stockfish assets are served with the application, so play and
analysis do not require a separate backend.

## Project structure

Runtime dependencies flow in one direction:

```text
features → core → shared
```

- `src/app/features` contains routed workflows such as Play, Learn, Review, Explorer, and Settings.
- `src/app/core` contains application-wide engine, game, persistence, keyboard, SEO, and sound
  capabilities.
- `src/app/shared` contains presentation-neutral chess UI, accessibility helpers, and common
  layout.
- `e2e` contains Playwright coverage for critical browser workflows.

Read [the architecture guide](docs/ARCHITECTURE.md) before changing runtime boundaries,
persistence records, or engine orchestration.

## Quality checks

| Command              | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `pnpm format:check`  | Check formatting without rewriting files         |
| `pnpm lint`          | Run the Angular ESLint configuration             |
| `pnpm typecheck`     | Type-check application and unit-test code        |
| `pnpm test:coverage` | Run Vitest with coverage                         |
| `pnpm build`         | Create the production browser and server build   |
| `pnpm verify:seo`    | Verify generated SEO pages and deployment assets |
| `pnpm e2e`           | Run Playwright in Chromium, Firefox, and WebKit  |
| `pnpm verify`        | Run the complete local verification pipeline     |

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch, implementation, and pull-request
expectations. [AGENTS.md](AGENTS.md) carries the same conventions in a form AI coding assistants
can read. Additional project policies are documented in:

- [Maintainer workflow](docs/MAINTAINING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Support](SUPPORT.md)
- [Third-party notices](docs/THIRD_PARTY_NOTICES.md)

LealChess is licensed under [GPL-3.0-only](LICENSE).
