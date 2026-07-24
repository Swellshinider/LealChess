# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

- Use pnpm for dependency installation, local scripts, and continuous integration.

### Fixed

- Match imported-game reviews to the saved board theme and coordinate contrast while restoring
  move sounds and right-click annotations.
- Correct the board square orientation and improve coordinate, legal-move, and dialog contrast.
- Allow new games to accept moves after a completed match.
