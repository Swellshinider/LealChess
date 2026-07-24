# LealChess

LealChess is a focused, single-player chess application for playing games against Stockfish in the browser.

## What we use

- [Chessground](https://github.com/lichess-org/chessground) for board rendering and interaction
- [chess.js](https://github.com/jhlywa/chess.js) as the authoritative rules implementation
- [Stockfish.js](https://github.com/nmrugg/stockfish.js) as the bot engine

## Development

Requirements:

- Node.js 22.22.3+ or 24.15.0+
- pnpm 11.17.0 (pinned in `package.json`)

Install and start the application:

```sh
pnpm install
pnpm start
```

The development server is available at <http://localhost:4200>.

Run the quality checks:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm e2e
```

## License

LealChess is licensed under GPL-3.0. See [LICENSE](LICENSE) and
[third-party notices](docs/THIRD_PARTY_NOTICES.md).
