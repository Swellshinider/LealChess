# Privacy and your data

LealChess is local-first. There is no LealChess account, no application server, and no cloud
database. Your games, imports, and analysis are stored by your browser, on your device, and are
never uploaded to us — because there is nowhere to upload them to.

This document describes exactly what is stored, where, and when the application uses the network.

## What is stored on your device

### IndexedDB

Everything substantial lives in an IndexedDB database named `leal-chess`. You can inspect it in
your browser's developer tools under **Application → Storage → IndexedDB**.

| Store                    | Contents                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `state`                  | Your active game, board and sound preferences, import preferences, and analysis settings |
| `coachProfiles`          | The Chess.com and Lichess usernames you chose to import from                             |
| `importedGames`          | Games you imported, in the form the platform returned them                               |
| `gameAnalyses`           | Engine analysis results for imported games                                               |
| `explorerSessions`       | Saved Explorer positions and variation trees                                             |
| `reviewAnalysisSessions` | Review and practice progress for a given imported game                                   |
| `engineAssets`           | The Stockfish engine binaries, cached so analysis starts quickly                         |

### Local storage

Two small interface preferences:

- `lealchess.navigation.expanded` — whether the side navigation is expanded.
- `lealchess.onboarding.completed` — whether you have finished the onboarding tour.

### Cookies

None. LealChess sets no cookies.

## When LealChess uses the network

The application makes network requests in exactly three situations:

1. **Loading the application itself** — HTML, JavaScript, CSS, and self-hosted fonts, all from the
   same origin.
2. **Downloading the Stockfish engine** — fetched from the same origin as the application and then
   cached in IndexedDB. The engine runs locally in a Web Worker; positions you analyze are never
   sent anywhere.
3. **Importing your games** — and only after you explicitly ask for it. LealChess calls the public
   Chess.com or Lichess API for the username you entered, to read games you already published
   there.

That is the complete list. There is no analytics, no telemetry, no error reporting, no tracking
pixel, no advertising, and no third-party script of any kind.

## What is never transmitted

- Games you play against the engine.
- Positions, evaluations, or analysis results.
- Your preferences, settings, or practice progress.

Analysis runs on your own CPU. Nothing about it leaves the browser.

## Server logs

lealchess.com is served as static files by a hosting provider. Like any web server, that provider
records standard request logs — the fact that a browser requested a page. LealChess neither
controls nor uses those logs for tracking, and no application data is included in them.

## Inspecting, exporting, and deleting your data

**Inspect** — open your browser's developer tools, then **Application → Storage → IndexedDB →
`leal-chess`**.

**Delete everything** — clear site data for lealchess.com in your browser settings, or delete the
`leal-chess` database directly in developer tools. In Chrome and Edge this is
**Settings → Privacy and security → Third-party cookies → See all site data and permissions**; in
Firefox, **Settings → Privacy & Security → Cookies and Site Data → Manage Data**.

Deletion is immediate and permanent. Because nothing is synchronized to a server, there is no
backup and no way to recover cleared data.

**Moving between devices** is not currently supported. Data is scoped to one browser profile on one
device. Using a private or incognito window means your data is discarded when the window closes.

## Third parties

LealChess talks to Chess.com and Lichess only when you import, and only to read your public games.
Their handling of that request is governed by their own privacy policies:

- [Chess.com privacy policy](https://www.chess.com/legal/privacy)
- [Lichess privacy policy](https://lichess.org/privacy)

## Changes

This document describes the application as shipped from this repository. Because LealChess is
open source, you can verify every claim here against the code — the network calls are in
`src/app/features/coach/platforms/` and `src/app/core/engine/engine-asset-manager.service.ts`, and
the storage schema is in `src/app/core/persistence/leal-chess-database.service.ts`.
