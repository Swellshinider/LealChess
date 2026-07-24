# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Complete local chess games against five Stockfish difficulty presets.
- Responsive Chessground board with click, drag, promotion, premoves, and planning annotations.
- Move history, draw claims, resignation, restart, board flipping, and clear match status.
- IndexedDB restoration for the active game and user preferences.
- Accessible announcements, reduced-motion support, configurable board feedback, and local sounds.
- Automated Vitest and cross-browser Playwright coverage.

### Changed

- Use pnpm for dependency installation, local scripts, and continuous integration.

### Fixed

- Correct the board square orientation and improve coordinate, legal-move, and dialog contrast.
- Allow new games to accept moves after a completed match.
