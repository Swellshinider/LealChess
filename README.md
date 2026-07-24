# LealChess

LealChess is a focused, single-player chess application for playing complete legal games against
Stockfish in the browser. The board, game rules, engine, and saved game all stay on the user's
device.

## Technology

- Angular 22 and TypeScript
- [Chessground](https://github.com/lichess-org/chessground) for board rendering and interaction
- [chess.js](https://github.com/jhlywa/chess.js) as the authoritative rules implementation
- [Stockfish.js](https://github.com/nmrugg/stockfish.js) 18 lite single-threaded in a dedicated
  Web Worker
- IndexedDB for the active game and preferences
- Vitest and Playwright for automated verification

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

Playwright requires its browser binaries. Install them once with:

```sh
pnpm exec playwright install
```

## Architecture

`GameController` owns the chess.js instance and publishes a read-only signal-based view state.
Components render that state and send commands; they never mutate chess state themselves.

The Stockfish adapter translates typed search requests into UCI commands. Every result is matched
against a game generation, request identifier, and source FEN before the controller can apply it.
Stopping or replacing a search drains its final `bestmove`, preventing late Worker messages from
affecting a restarted or restored game.

IndexedDB snapshots contain both PGN and FEN. Restoration replays the PGN and rejects the record if
the resulting position or move history does not match the stored snapshot.

Stalemate and insufficient material end automatically. Threefold repetition and the fifty-move rule
remain claimable on the player's turn. Stockfish does not expose a draw-offer protocol, so LealChess
does not invent one.

## Production build

```sh
pnpm build
```

Serve the files under `dist/leal-chess/browser` from any static HTTPS host. The Stockfish JavaScript
and WASM files are emitted together under `assets/stockfish`; no cross-origin isolation headers are
required by the selected single-threaded engine.

## License

LealChess is licensed under GPL-3.0. See [LICENSE](LICENSE) and
[third-party notices](docs/THIRD_PARTY_NOTICES.md).
