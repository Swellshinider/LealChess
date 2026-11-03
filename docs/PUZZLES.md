# Puzzle catalog

The practice catalog is derived from the [Lichess puzzle database](https://database.lichess.org/#puzzles),
which is available under CC0. Daily puzzles are fetched in the browser from Lichess and Chess.com;
attempts and cached responses stay in the device's IndexedDB.

## Refreshing

Use Node 24 and provide either a downloaded `.zst` archive or its official HTTPS URL:

```sh
pnpm generate:puzzles -- --source ./lichess_db_puzzle.csv.zst --sha256 <published-sha256>
```

The generator streams decompression, checks the optional SHA-256, validates the opponent setup
move and solution with `chess.js`, rejects malformed or negatively popular rows, and selects up to
32,000 records deterministically. It first keeps as many as three strong examples for every theme
and opening tag, then fills round-robin across tags and 200-point rating buckets. Selection ranking
uses popularity, play count, rating deviation, then puzzle ID. Duplicate positions and solutions
are removed. Generation fails if the gzip-compressed compact catalog exceeds 5 MiB.

Record the official export date and checksum in the generated catalog metadata. Never add the raw
archive to version control.

The bundled catalog was generated from the 2026-08-02 export. Its SHA-256 is
`a0ea9129c6b6434dfb34a9ac4ec660c9cfff22b2de465e01854f018fc847f073`; the same revision and
checksum are embedded in `puzzle-catalog.generated.ts`.
