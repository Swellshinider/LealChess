<!-- markdownlint-disable MD024 (MD024/no-duplicate-heading: Multiple headings with the same content)-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 30-07-2026

### Added

- Missing opening names and ECO codes are detected locally when a game review is opened and saved
  for future reviews and opening statistics.
- Game Review analysis now supports persistent, nested variations with live three-line Stockfish
  evaluations, ranked arrows within user-created branches, and safe subtree removal.

### Changed

- Moved the board-idea action beside the reviewed move evaluation for a more compact coaching
  summary.
- Renamed Game pulse to Advantage graph, removed territory labels, and added a solid gray center
  line that remains readable across both advantage regions.
- Replaced the read-only Game Review move grid with an accessible unified score that keeps the
  imported game immutable while making every reviewed position playable.
- Grouped Game Review branches into compact, wrapping variation lines with unobtrusive removal
  controls, made engine candidates playable from the board, and reduced the board-idea action.
- Replaced the remaining browser-native confirmations with accessible dialogs matching LealChess.

### Fixed

- Unified Review, Practice, and Explorer move classifications so moves that allow forced checkmate
  are correctly flagged, even when expected-points values are saturated, with readable concern
  labels in the active move list.
- Opening-book explanations no longer recommend an engine continuation over established theory.

## [Unreleased] - 29-07-2026

### Added

- Native Stockfish rating selection from 1320 to 3190 Elo for local bot games.
- Open-source contribution, conduct, security, support, architecture, and maintenance guidance.
- Structured issue forms, a pull request template, grouped Dependabot updates, and verified
  release-tag automation.
- Local verification scripts covering quality checks, dependency auditing, and browser tests.

### Changed

- Upgraded Review, Practice, and Explorer analysis to full Stockfish, with completed game reviews
  calculated at depth 16.
- Redesigned Advantage graph as a neutral territory chart with focused markers for noteworthy moves.
- Made move-review explanations match their classifications, with readable evaluation drops and
  explicit forced-mate transitions.
- Renamed Help to About, with `/about` as the canonical project-information page and `/help`
  retained as a compatibility redirect.
- Hardened continuous integration with least-privilege permissions, immutable action pins,
  concurrency cancellation, timeouts, dependency auditing, and failure-only browser artifacts.
- Standardized tracked text files on LF and expanded ignored local environment, cache, log, and
  editor artifacts.
- Declared the project license using the precise `GPL-3.0-only` SPDX identifier.
- Separated Review and Explorer route state from their board rendering and consolidated shared
  chess move, candidate-line, legal-destination, and resize behavior.
- Split game state construction, stored-game validation, result evaluation, and presentation out
  of the game controller into focused pure modules.

### Fixed

- Classified equivalent checkmates as best moves without unnecessary alternatives, and marked
  abandoned forced mates as missed opportunities.
- Allow the initial match setup to be dismissed while Stockfish continues loading, with keyboard
  focus restored to New game.
- Updated vulnerable transitive dependencies used by development tooling.

## [Unreleased] - 28-07-2026

### Added

- Automatic game-review summaries with evaluation timelines, per-player move classifications, and
  locally generated coaching explanations for every analyzed move.
- An Explorer-style evaluation rail beside the board during guided game analysis.
- A Help page with release and repository details, plus a dedicated recovery page for unknown URLs.
- Completed Stockfish games can be archived, opened directly in Review, and analyzed automatically.
- Archived LealChess, Chess.com, and Lichess games can be deleted with their saved analysis.
- Full move-quality labels and a color-coded progress rail for imported-game analysis.
- Legal two-sided Practice exploration with persistent board annotations and explicit reset controls.
- Branching Practice move lists with progressive move classifications and three ranked Stockfish
  continuations.
- Opponent-move replays and previous/next navigation between review training positions.
- A persistent Explorer workspace for FEN, PGN, custom-position, variation, and Stockfish
  move-quality analysis.

### Changed

- Opened the Help page into a quieter, more spacious layout that makes better use of wide screens.
- Simplified game reviews into a board-first workspace with compact player identities, contextual
  engine details, and responsive controls.
- Simplified Explorer into a viewport-fitting board-first workspace with restrained controls and an
  orientation-aware evaluation rail.

### Removed

- Live move classifications from Play and the related Settings control and preview.

### Fixed

- Align Review player identities with the board so they no longer overlap the evaluation rail.
- Keep Review board coordinates visible and the desktop workspace within the viewport.
- Classify complete opening lines as Book and include opponent moves in game-review analysis.
- Match Explorer square ordering and coordinate contrast with Play and Review.

## [Unreleased] - 27-07-2026

### Added

- A focused LealChess launch page and a Settings workspace for account imports, board preferences,
  live previews, and confirmed local-data removal.
- Three additional board palettes: Rosewood, Green felt, and Blue steel.
- Optional live Stockfish move classifications for player moves, including opening-book,
  best-move, missed-win, and accuracy feedback.
- Platform-specific rating trends and result, platform, speed, and date filters for imported games.

### Changed

- Simplified Play into a board-first workspace with compact player details, one move panel, and a
  minimal action toolbar.
- Made the Settings board preview a legal two-sided sandbox with live board feedback and reset.
- Moved Play to `/play`, account importing from Learn to Settings, and Board & feedback controls
  out of the active game.
- Simplified Learn into a saved-study dashboard with a Settings prompt when no games are available.
- Focused Learn around progress and study priorities, with color-coded win, loss, and draw rows and
  secondary record details kept out of the main reading path.
- Redesigned Play, Learn, and Review as responsive training-desk workspaces with collapsible
  desktop and tablet navigation and an accessible mobile drawer.
- Show the LealChess logo and contextual tooltips in the collapsed navigation rail.
- Simplified the Learn workspace introduction to a compact page title.
- Resume saved games without displaying a restoration notice.

### Fixed

- Keep move-classification labels readable above pieces and within either board orientation.
- Fit the Play board and game controls within desktop landscape viewports without page-level
  scrollbars.
- Keep long move histories contained when Board & feedback is expanded.
- Make White and Black player markers immediately distinguishable in the imported game list.

## [Unreleased] - 24-07-2026

### Added

- An expanded local-first project guide and training roadmap.
- Keyboard focus management for dialogs and promotion choices, clearer board descriptions, live
  review announcements, and automated accessibility checks for play and study workflows.
- Cancellable local Stockfish analysis for imported games, with cached move classifications,
  recurring learning priorities, and interactive practice from missed opportunities.
- Learning dashboard for importing recent Chess.com and Lichess games into a private local
  study ledger, with filters, learner-perspective records, opening summaries, and resilient
  per-platform status.
- Read-only game reviews with a flippable board, keyboard navigation, move controls, and
  unsupported-game details.
- IndexedDB caching for active chess profiles and deduplicated imported games while preserving
  existing local bot games.
- Complete local chess games against five Stockfish difficulty presets.
- Responsive Chessground board with click, drag, promotion, premoves, and planning annotations.
- Move history, draw claims, resignation, restart, board flipping, and clear match status.
- IndexedDB restoration for the active game and user preferences.
- Accessible announcements, reduced-motion support, configurable board feedback, and local sounds.
- Automated Vitest and cross-browser Playwright coverage.

### Changed

- Report platform imports with separate new, duplicate, unavailable, and skipped game outcomes,
  keeping recoverable private, deleted, or malformed records in the study ledger.
- Use pnpm for dependency installation, local scripts, and continuous integration.

### Fixed

- Recover Stockfish play and analysis from worker startup failures with automatic and visible manual
  retry paths.
- Match imported-game reviews to the saved board theme and coordinate contrast while restoring
  move sounds and right-click annotations.
- Correct the board square orientation and improve coordinate, legal-move, and dialog contrast.
- Allow new games to accept moves after a completed match.
