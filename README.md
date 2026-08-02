<!-- markdownlint-disable MD033 MD041-->
<center>

# LealChess

[![CI](https://github.com/Swellshinider/LealChess/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Swellshinider/LealChess/actions/workflows/ci.yml)

LealChess is a free offline chess training application. The
application has no account service, cloud database, or analytics.

</center>

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
expectations. Additional project policies are documented in:

- [Maintainer workflow](docs/MAINTAINING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Support](SUPPORT.md)
- [Third-party notices](docs/THIRD_PARTY_NOTICES.md)

LealChess is licensed under [GPL-3.0-only](LICENSE).
