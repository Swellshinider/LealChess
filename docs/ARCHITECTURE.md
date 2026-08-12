# Architecture

LealChess is a local-first Angular application. Its runtime is delivered as static browser assets;
there is no LealChess application server or cloud database.

## Dependency direction

Runtime dependencies flow in one direction:

```text
features → core → shared
```

- `features` contains user workflows such as Play, Learn, Review, Explorer, Settings, and About.
- `core` contains application-wide chess, engine, persistence, and sound capabilities.
- `shared` contains small presentation-neutral types, accessibility helpers, and reusable UI.

Core and shared code must not import features. Shared code must not import core. Features must not
import one another; move a proven cross-feature concept to core or shared behind a deliberately
small API. Avoid catch-all utility modules and abstractions created for only one caller.

`eslint.config.js` enforces these boundaries, so `pnpm lint` fails on a violation. Type-only
imports are restricted too, since a compile-time cycle is still a cycle. The rule does not inspect
dynamic `import()`; do not use one to work around a boundary. Any deliberate exception is listed in
`ALLOWED_SIBLING_IMPORTS` with its reason.

## Route shells and feature stores

A routed page is a shell: it composes focused components, binds view events, and reflects state.
Multi-step route, session, loading, and practice orchestration belongs in a feature-scoped store.
Stores expose readonly signals and explicit commands. They may depend on core ports and
feature-local pure domain functions, but not on DOM APIs.

Chessground lifecycle and browser resizing belong in focused board components. Board components
accept position and interaction configuration as inputs and emit chess moves or view events. They
do not load routes, persist sessions, or run Stockfish.

## Ports and adapters

Services that cross a system boundary are adapters:

- Stockfish services adapt Web Workers and the UCI protocol.
- Chess.com and Lichess services adapt remote HTTP APIs.
- IndexedDB repositories adapt durable browser storage.
- The lazy `/puzzles` workspace owns daily-puzzle cache and attempt stores. Entering that route
  contacts the anonymous Lichess and Chess.com public APIs for daily content; tagged practice reads
  only the bundled catalog and remains offline. No puzzle attempts are submitted.
- Sound adapts browser audio.

Workflow code should depend on the narrow public service contract rather than worker, network, or
database details. Keep chess calculations and data validation pure where possible so they remain
fast and deterministic in unit tests.

## Local persistence

IndexedDB stores the active local game, preferences, profiles, imported games, review analysis, and
Explorer sessions. Persisted records are a public compatibility boundary even though they are not
an exported TypeScript API.

- Never change a stored key or record shape accidentally.
- Validate unknown data before restoring it.
- Add an explicit, tested migration before making an incompatible schema change.
- Failed or partial records must fall back safely without deleting unrelated local data.

The application contacts Chess.com or Lichess after an explicit import action or when the user
enters Puzzles to load daily content. No analytics, tracking, cloud synchronization, puzzle
submission, or remote game storage belongs in the default architecture.

## Stockfish workers

Play and analysis run in local Stockfish Web Workers. Engine services own worker startup, UCI
parsing, cancellation, retry, and teardown. Feature stores own user-intent orchestration and
staleness guards. UI components never communicate with workers directly.

Keep Play searches and analysis searches independently cancellable. Any new analysis flow must
handle worker startup failure, navigation away, superseded requests, and component destruction.

## Testing boundaries

- Pure chess transformations, validation, result evaluation, and session updates use unit tests.
- Feature stores use characterization tests with fake repositories and engines.
- Components test rendering, inputs, outputs, accessible names, and interaction wiring.
- Persistence adapters use `fake-indexeddb` compatibility tests.
- Playwright covers critical routes, local persistence, mobile navigation, accessibility, and
  Chromium, Firefox, and WebKit behavior.

Every extraction should keep existing tests green, then add focused tests at the new boundary.
Generated opening data and large end-to-end fixtures are outputs or test assets, not candidates for
architectural splitting.
