import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const pgn = `[Event "Imported game"]
[White "Learner"]
[Black "Opponent"]
[Result "0-1"]
[ECO "C20"]
[Opening "King's Pawn Game"]
[TimeControl "600+0"]

1. f3 e5 2. g4 Qh4# 0-1`;

test.beforeEach(async ({ page }) => {
  await mockChessCom(page);
  await mockLichess(page);
  await page.goto('/settings');
});

test('deletes an imported game and allows a later import to restore it', async ({ page }) => {
  await page.getByLabel('Chess.com username').fill('Learner');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Added 1 game.')).toBeVisible();
  await page.goto('/learn');

  const game = page.locator('.game-list article');
  await expect(game).toHaveCount(1);
  await game.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete this game?' });
  await expect(dialog).toContainText('A later import may add it again.');
  await assertNoSeriousA11yViolations(page);
  await dialog.getByRole('button', { name: 'Delete game' }).click();
  await expect(game).toHaveCount(0);

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Added 1 game.')).toBeVisible();
  await page.goto('/learn');
  await expect(page.locator('.game-list article')).toHaveCount(1);
});

test('imports both platforms, persists and deduplicates games, then replays moves', async ({
  page,
}, testInfo) => {
  await page.getByLabel('Chess.com username').fill('Learner');
  await page.getByLabel('Lichess username').fill('Learner');
  await page.getByRole('button', { name: 'Import games' }).click();

  await expect(page.getByText('Added 1 game.')).toHaveCount(2);
  await page.goto('/learn');
  await expect(page.locator('.game-list article')).toHaveCount(2);
  await expect(page.locator('.game-list').getByText("King's Pawn Game")).toHaveCount(2);

  await page.reload();
  await expect(page.locator('.game-list article')).toHaveCount(2);
  await page.goto('/settings');
  await expect(page.getByLabel('Chess.com username')).toHaveValue('Learner');

  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText(/No new games were added/)).toHaveCount(2);
  await page.goto('/learn');
  await expect(page.locator('.game-list article')).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('leal-chess');
            request.onsuccess = () => {
              const database = request.result;
              const count = database
                .transaction('importedGames')
                .objectStore('importedGames')
                .count();
              count.onsuccess = () => {
                resolve(count.result);
                database.close();
              };
              count.onerror = () => reject(count.error);
            };
            request.onerror = () => reject(request.error);
          }),
      ),
    )
    .toBe(2);

  await seedBoardTheme(page, 'classic');
  await page
    .getByRole('link', { name: /Open review/ })
    .first()
    .click();
  await expect(page.locator('.review-board')).toBeVisible();
  await expect(page.locator('.player-strip.opponent')).toContainText('Opponent');
  await expect(page.locator('.player-strip.opponent .player-avatar')).toHaveText('OP');
  await expect(
    page.locator('.review-toolbar').getByRole('button', { name: 'Flip board' }),
  ).toHaveCount(0);
  const flipBoard = page
    .locator('.player-strip.opponent')
    .getByRole('button', { name: 'Flip board' });
  await expect(flipBoard).toBeVisible();
  await expectFlipControlAtBoardTopRight(page, '.review-board');
  await expect(page.locator('.review-board')).toHaveClass(/orientation-white/);
  await expect
    .poll(() =>
      page.locator('.review-board cg-board').evaluate((board) => {
        return getComputedStyle(board).backgroundImage;
      }),
    )
    .toContain('conic-gradient');
  await expect(page.locator('.review-board')).toHaveAttribute('data-board-theme', 'classic');
  await expect(page.locator('.review-board cg-board')).toHaveCSS(
    'background-image',
    /rgb\(139, 101, 71\).*rgb\(216, 195, 161\)/,
  );
  await expect(page.locator('.review-board coords.files coord').nth(0)).toHaveCSS(
    'color',
    'rgb(255, 255, 255)',
  );
  await expect(page.locator('.review-board coords.files coord').nth(1)).toHaveCSS(
    'color',
    'rgb(24, 27, 21)',
  );
  if (!testInfo.project.name.includes('mobile')) {
    await expectReviewWorkspaceToFitViewport(page);
    await expect
      .poll(() =>
        page
          .locator('.review-board coords.files coord')
          .last()
          .evaluate((coordinate) => {
            const board = coordinate.closest('.review-board')!.getBoundingClientRect();
            const bounds = coordinate.getBoundingClientRect();
            return bounds.bottom <= board.bottom + 1;
          }),
      )
      .toBe(true);
  }
  await drawReviewArrow(page, 'c7', 'g5');
  await expect(page.locator('.review-board svg.cg-shapes line')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: /Reading the whole game|Your game at a glance/ }),
  ).toBeVisible();
  await flipBoard.click();
  await expect(page.locator('.review-board')).toHaveClass(/orientation-black/);
  await expect(page.getByRole('img', { name: 'Review chessboard' })).toHaveAttribute(
    'aria-describedby',
    'review-board-description',
  );
  await assertNoSeriousA11yViolations(page);
});

test('detects and saves missing opening metadata when review is opened', async ({ page }) => {
  await mockChessComWithoutOpening(page);
  await page.getByLabel('Chess.com username').fill('Learner');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Added 1 game.')).toBeVisible();
  await page.goto('/learn');

  const game = page.locator('.game-list article');
  await expect(game).toContainText('Opening not recorded');
  await game.getByRole('link', { name: /Open review/ }).click();
  await expect(page.locator('.review-toolbar')).toContainText('Ruy Lopez: Morphy Defense');

  await page.goto('/learn');
  await expect(page.locator('.game-list article')).toContainText('Ruy Lopez: Morphy Defense');
  await expect(page.locator('.openings')).toContainText('C70 Ruy Lopez: Morphy Defense');
});

test('shows rating progress and filters the game archive', async ({ page }) => {
  await expect(page.getByLabel('Chess.com username')).toBeEnabled();
  await seedLearnDashboard(page);
  await page.goto('/learn');

  await expect(
    page.getByRole('img', {
      name: /Chess\.com rose by 60 points, from 1400 to 1460.*Lichess held steady/,
    }),
  ).toBeVisible();
  await expect(page.locator('.game-list article')).toHaveCount(3);
  await expect(page.locator('.game-list article[data-outcome="win"]')).toHaveCount(1);
  await expect(page.locator('.game-list article[data-outcome="draw"]')).toHaveCount(1);
  await expect(page.locator('.game-list article[data-outcome="loss"]')).toHaveCount(1);
  const whitePiece = page.locator('.game-list article').first().locator('.piece-white');
  const blackPiece = page.locator('.game-list article').first().locator('.piece-black');
  await expect(whitePiece).toHaveText('♙');
  await expect(whitePiece).toHaveCSS('color', 'rgb(244, 241, 230)');
  await expect(whitePiece).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(blackPiece).toHaveText('♟');
  await expect(blackPiece).toHaveCSS('color', 'rgb(12, 14, 11)');
  await expect(blackPiece).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await page.getByRole('combobox', { name: 'Result', exact: true }).selectOption('loss');
  await expect(page.locator('.game-list article')).toHaveCount(1);
  await expect(page.locator('.game-list article').first()).toContainText('BlitzOpponent');

  await page.getByRole('combobox', { name: 'Result', exact: true }).selectOption('all');
  await page.getByRole('combobox', { name: 'Platform', exact: true }).selectOption('lichess');
  await page.getByRole('combobox', { name: 'Speed', exact: true }).selectOption('blitz');
  await expect(page.locator('.game-list article')).toHaveCount(1);
  await expect(page.locator('.game-list article').first()).toContainText('DrawOpponent');

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('combobox', { name: 'Order', exact: true }).selectOption('oldest');
  await expect(page.locator('.game-list article').first()).toContainText('RapidOpponent');

  await page.getByRole('combobox', { name: 'Result', exact: true }).selectOption('loss');
  await page.getByRole('combobox', { name: 'Platform', exact: true }).selectOption('lichess');
  await expect(page.getByRole('heading', { name: 'No games match these filters' })).toBeVisible();
  await assertNoSeriousA11yViolations(page);
});

test('analyzes locally, caches the result, and opens a concern position', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Real analysis worker smoke test');
  test.setTimeout(90_000);
  await page.getByLabel('Lichess username').fill('Learner');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Added 1 game.')).toBeVisible();
  await page.goto('/learn');
  await page.getByRole('link', { name: /Open review/ }).click();

  await expect(page.getByRole('heading', { name: 'Your game at a glance' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Start analysis' }).click();
  await expect(page.getByRole('heading', { name: 'Game review', exact: true })).toBeVisible();
  await expect(page.getByText('Guided analysis', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next move', exact: true })).toHaveCount(0);
  const ideaToggle = page.locator('.secondary-action');
  await expect(ideaToggle).toHaveAccessibleName('Show idea on board');
  await expect(ideaToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('Advantage graph', { exact: true })).toBeVisible();
  await expect(page.locator('.advantage-label, .equal-label')).toHaveCount(0);
  await expect(page.locator('.zero-line')).toHaveCSS('stroke', 'rgb(137, 139, 131)');
  await expect(page.locator('.zero-line')).toHaveCSS('stroke-dasharray', 'none');
  await expect(page.locator('.evaluation-rail')).toBeVisible();
  await expect(page.locator('.evaluation-rail')).toHaveAttribute('aria-label', /White evaluation/);
  await expectPlayerStripsToClearEvaluationRail(page);
  await expect(page.locator('.live-analysis li')).toHaveCount(3, { timeout: 30_000 });
  await expectReviewResponsiveness(page);
  const ideaArrows = page.locator('.review-board svg.cg-shapes line');
  const nextReplayButton = page
    .getByRole('navigation', { name: 'Replay controls' })
    .getByRole('button', { name: 'Next', exact: true });
  const previousReplayButton = page
    .getByRole('navigation', { name: 'Replay controls' })
    .getByRole('button', { name: 'Previous', exact: true });
  const lastReplayButton = page
    .getByRole('navigation', { name: 'Replay controls' })
    .getByRole('button', { name: 'Last', exact: true });

  await expect(ideaArrows).toHaveCount(0);
  await nextReplayButton.click();
  await expect(nextReplayButton).not.toBeFocused();
  const moveAfterNext = page.locator('.score .move.current');
  const moveAfterNextLabel = await moveAfterNext.getAttribute('aria-label');
  await ideaToggle.click();
  await expect(ideaArrows).not.toHaveCount(0);
  await expect(ideaToggle).toHaveAccessibleName('Hide idea on board');
  await expect(ideaToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(moveAfterNext).toHaveAttribute('aria-label', moveAfterNextLabel!);

  const scoreMove = page.locator('.score .move').first();
  await scoreMove.click();
  await expect(scoreMove).not.toBeFocused();
  await expect(scoreMove).toHaveClass(/current/);
  await expect(ideaArrows).not.toHaveCount(0);
  await expect(ideaToggle).toHaveAccessibleName('Hide idea on board');
  await ideaToggle.click();
  await expect(ideaArrows).toHaveCount(0);
  await expect(ideaToggle).toHaveAccessibleName('Show idea on board');
  await page.keyboard.press('Space');
  await expect(ideaArrows).not.toHaveCount(0);
  await expect(ideaToggle).toHaveAccessibleName('Hide idea on board');
  await page.keyboard.press('Space');
  await expect(ideaArrows).toHaveCount(0);
  await expect(ideaToggle).toHaveAccessibleName('Show idea on board');
  await expect(scoreMove).toHaveClass(/current/);

  await nextReplayButton.focus();
  await page.keyboard.press('Space');
  await expect(nextReplayButton).toBeFocused();
  await expect(scoreMove).not.toHaveClass(/current/);
  await scoreMove.click();
  await expect(scoreMove).toHaveClass(/current/);

  await page.keyboard.press('Control+ArrowRight');
  await expect(nextReplayButton).toBeDisabled();
  await expect(lastReplayButton).toBeDisabled();
  await previousReplayButton.click();
  await expect(nextReplayButton).toBeEnabled();
  await expect(lastReplayButton).toBeEnabled();
  await page.keyboard.press('Control+ArrowRight');
  await expect(nextReplayButton).toBeDisabled();
  await expect(lastReplayButton).toBeDisabled();
  await page.keyboard.press('Control+ArrowLeft');
  await expect(previousReplayButton).toBeDisabled();
  await expect(nextReplayButton).toBeEnabled();
  await expect(lastReplayButton).toBeEnabled();
  await scoreMove.click();
  await expect(scoreMove).toHaveClass(/current/);

  const alternateCandidate = page
    .locator('.live-analysis .candidate-action:not([aria-label$=": e5"])')
    .first();
  await expect(alternateCandidate).toBeVisible();
  await alternateCandidate.click();
  await expect(page.locator('.score .variation-move')).toHaveCount(1);
  await expect(page.locator('.score .variation-move .move.current')).toBeVisible();
  await page.getByRole('button', { name: 'Remove this variation and all continuations' }).click();
  const removalDialog = page.getByRole('alertdialog', { name: 'Remove this variation?' });
  await expect(removalDialog).toBeVisible();
  await removalDialog.getByRole('button', { name: 'Keep variation' }).click();
  await expect(page.locator('.score .variation-move')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove this variation and all continuations' }).click();
  await removalDialog.getByRole('button', { name: 'Remove variation' }).click();
  await expect(page.locator('.score .variation-move')).toHaveCount(0);

  await moveReviewPiece(page, 'c7', 'c5');
  await expect(page.locator('.score .variation-move')).toHaveCount(1);
  await expect(page.locator('.live-analysis li')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('.review-board svg.cg-shapes line')).toHaveCount(3);
  await expect
    .poll(() =>
      page
        .locator('.review-board svg.cg-shapes line')
        .evaluateAll((lines) =>
          lines
            .map((line) => Number(line.getAttribute('stroke-width')) * 64)
            .sort((left, right) => right - left),
        ),
    )
    .toEqual([14, 9, 5]);

  await moveReviewPiece(page, 'e2', 'e4');
  await expect(page.locator('.score .variation-move')).toHaveCount(2);
  await expect(page.locator('.score .variation-row')).toHaveCount(1);
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your game at a glance' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Start analysis' }).click();
  await expect(page.locator('.score .variation-move')).toHaveCount(2);
  await page.locator('.score .variation-move .move').last().click();
  await page.getByRole('button', { name: 'Remove this variation and all continuations' }).click();
  await page
    .getByRole('alertdialog', { name: 'Remove this variation?' })
    .getByRole('button', { name: 'Remove variation' })
    .click();
  await expect(page.locator('.score .variation-move')).toHaveCount(1);

  await page.getByRole('button', { name: 'f3' }).click();
  await expect(page.locator('.review-classification')).toBeVisible();
  await expectBoardOverlayWithinBounds(page, '.review-classification');
  await expect(page.locator('.coach-note')).toContainText(
    /opening theory|stronger continuation|engine’s top move/,
  );
  await page.getByRole('button', { name: 'e5' }).click();
  await expect(page.locator('.review-classification')).toBeVisible();
  await expect(page.locator('.coach-note')).toContainText(/Book|Best|Excellent|Good/);
  await page.getByRole('button', { name: 'g4' }).click();
  await expect(page.locator('.review-classification')).toHaveText('Blunder');
  await page.getByRole('button', { name: 'Practice this position' }).click();
  await expect(page.getByRole('heading', { name: 'Find a better move' })).toBeVisible();
  await expect(page.getByText(/Move a piece for/)).toHaveCount(0);
  const previousPosition = page.getByRole('button', { name: 'Previous position' });
  const nextPosition = page.getByRole('button', { name: 'Next position' });
  await expect(previousPosition).toBeDisabled();
  await expect(nextPosition).toBeDisabled();
  await expect(page.getByText(/Replaying the opponent’s last move/)).toHaveCount(0);
  await moveReviewPiece(page, 'a2', 'a3');
  await expect(page.locator('.practice-classification')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Three ways forward' })).toBeVisible();
  await expect(page.locator('.review-board svg.cg-shapes line')).toHaveCount(3);
  await moveReviewPiece(page, 'b8', 'c6');
  await expect(page.getByText('2 moves across your variations')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('treeitem', { name: /^Nc6,/ })).toHaveAttribute(
    'data-classification',
    /.+/,
    { timeout: 15_000 },
  );
  await page.getByRole('treeitem', { name: 'Start' }).click();
  await moveReviewPiece(page, 'c2', 'c4');
  await expect(page.getByText('3 moves across your variations')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('treeitem', { name: /^a3,/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /^c4,/ })).toBeVisible();
  await expect(page.locator('.candidate-lines li')).toHaveCount(3, { timeout: 15_000 });
  await drawReviewArrow(page, 'c2', 'c4');
  await expect(page.locator('.review-board svg.cg-shapes line')).toHaveCount(4);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByText(/moves across your variations/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Reveal move' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.review-board svg.cg-shapes line')).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to analysis' }).click();
  await expect(page.getByRole('heading', { name: 'Game review', exact: true })).toBeVisible();
  await assertNoSeriousA11yViolations(page);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your game at a glance' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start analysis' })).toBeVisible();
});

test('keeps a successful platform import when the other platform fails', async ({ page }) => {
  await page.unroute('**/lichess.org/api/**');
  await page.route('**/lichess.org/api/**', (route) =>
    route.fulfill({ status: 429, body: 'Rate limited' }),
  );
  await page.getByLabel('Chess.com username').fill('Learner');
  await page.getByLabel('Lichess username').fill('Learner');
  await page.getByRole('button', { name: 'Import games' }).click();

  await expect(page.getByText(/Lichess is limiting requests/)).toBeVisible();
  await expect(page.getByText('Added 1 game.')).toBeVisible();
  await page.goto('/learn');
  await expect(page.locator('.game-list article')).toHaveCount(1);
});

test('explains invalid users and restricted game exports', async ({ page }) => {
  await page.unroute('**/api.chess.com/**');
  await page.route('**/api.chess.com/**', (route) =>
    route.fulfill({ status: 404, body: 'Not found' }),
  );
  await page.getByLabel('Chess.com username').fill('MissingPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();

  await expect(page.getByRole('alert')).toContainText('We could not find that Chess.com username.');
  await expect(page.getByText(/Check the spelling, update the username/)).toBeVisible();

  await page.unroute('**/lichess.org/api/**');
  await page.route('**/lichess.org/api/**', (route) => {
    if (route.request().url().includes('/api/games/user/')) {
      return route.fulfill({ status: 403, body: 'Private' });
    }
    return json(route, { username: 'Learner' });
  });
  await page.getByLabel('Chess.com username').fill('');
  await page.getByLabel('Lichess username').fill('Learner');
  await page.getByRole('button', { name: 'Import games' }).click();

  await expect(
    page.locator('.platform-status[data-state="error"]').filter({ hasText: 'Lichess' }),
  ).toContainText('Lichess is not allowing access to these games.');
  await expect(page.getByText(/Make the games public or use another profile/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry Lichess' })).toBeVisible();
});

test('keeps identified unavailable games and reports malformed export records', async ({
  page,
}) => {
  await page.unroute('**/lichess.org/api/**');
  await page.route('**/lichess.org/api/**', (route) => {
    if (route.request().url().includes('/api/games/user/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: [
          JSON.stringify({ id: 'deleted-game', pgn: '', players: {} }),
          JSON.stringify({ id: 'malformed-game', pgn: '1. ThisIsNotAMove', players: {} }),
          'not-json',
        ].join('\n'),
      });
    }
    return json(route, { username: 'Learner' });
  });
  await page.getByLabel('Lichess username').fill('Learner');
  await page.getByRole('button', { name: 'Import games' }).click();

  await expect(page.getByText(/Added 2 games/)).toBeVisible();
  await expect(page.getByText(/2 games cannot be replayed yet/)).toBeVisible();
  await expect(page.getByText(/1 game could not be identified and was skipped/)).toBeVisible();
  await page.goto('/learn');
  await expect(page.locator('.unavailable-game > strong')).toHaveCount(2);
  await expect(page.locator('.game-list article')).toHaveCount(2);
});

test('announces import validation and has no serious accessibility violations', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a Chess.com or Lichess username.');
  await assertNoSeriousA11yViolations(page);
});

async function mockChessCom(page: Page): Promise<void> {
  await page.route('**/api.chess.com/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('/games/archives')) {
      return json(route, {
        archives: ['https://api.chess.com/pub/player/learner/games/2026/07'],
      });
    }
    if (url.endsWith('/games/2026/07')) {
      return json(route, {
        games: [
          {
            url: 'https://www.chess.com/game/live/101',
            pgn,
            time_control: '600',
            time_class: 'rapid',
            end_time: 1_784_912_400,
            rated: true,
            white: { username: 'Learner', rating: 1500, result: 'win' },
            black: { username: 'Opponent', rating: 1480, result: 'checkmated' },
          },
        ],
      });
    }
    return json(route, {
      username: 'Learner',
      name: 'Learning Player',
      url: 'https://www.chess.com/member/learner',
    });
  });
}

async function mockChessComWithoutOpening(page: Page): Promise<void> {
  await page.unroute('**/api.chess.com/**');
  await page.route('**/api.chess.com/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('/games/archives')) {
      return json(route, {
        archives: ['https://api.chess.com/pub/player/learner/games/2026/07'],
      });
    }
    if (url.endsWith('/games/2026/07')) {
      return json(route, {
        games: [
          {
            url: 'https://www.chess.com/game/live/without-opening',
            uuid: 'without-opening',
            pgn: `[White "Learner"]
[Black "Opponent"]
[Result "1-0"]
[TimeControl "600+0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`,
            time_control: '600',
            time_class: 'rapid',
            end_time: 1_784_912_400,
            rated: true,
            white: { username: 'Learner', rating: 1500, result: 'win' },
            black: { username: 'Opponent', rating: 1480, result: 'resigned' },
          },
        ],
      });
    }
    return json(route, {
      username: 'Learner',
      name: 'Learning Player',
      url: 'https://www.chess.com/member/learner',
    });
  });
}

async function mockLichess(page: Page): Promise<void> {
  await page.route('**/lichess.org/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/games/user/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: `${JSON.stringify({
          id: 'lichess101',
          pgn,
          speed: 'rapid',
          rated: true,
          lastMoveAt: 1_784_912_400_000,
          winner: 'white',
          players: {
            white: { user: { name: 'Learner' }, rating: 1510 },
            black: { user: { name: 'Opponent' }, rating: 1495 },
          },
          opening: { eco: 'C20', name: "King's Pawn Game" },
        })}\n`,
      });
    }
    return json(route, { username: 'Learner' });
  });
}

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function drawReviewArrow(page: Page, from: string, to: string): Promise<void> {
  const reviewBoard = page.locator('.review-board');
  await reviewBoard.scrollIntoViewIfNeeded();
  const board = await visibleBounds(reviewBoard.locator('cg-board'));
  const point = (square: string) => ({
    x: board.x + ((square.charCodeAt(0) - 97 + 0.5) * board.width) / 8,
    y: board.y + ((8 - Number(square[1]) + 0.5) * board.height) / 8,
  });
  const origin = point(from);
  const destination = point(to);
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(50);
  await page.mouse.move(destination.x, destination.y, { steps: 12 });
  await page.waitForTimeout(50);
  await page.mouse.up({ button: 'right' });
}

async function expectFlipControlAtBoardTopRight(page: Page, boardSelector: string): Promise<void> {
  const control = await visibleBounds(page.getByRole('button', { name: 'Flip board' }));
  const board = await visibleBounds(page.locator(boardSelector));
  expect(Math.abs(control.x + control.width - (board.x + board.width))).toBeLessThanOrEqual(3);
  expect(control.y + control.height).toBeLessThanOrEqual(board.y + 1);
}

async function moveReviewPiece(page: Page, from: string, to: string): Promise<void> {
  const reviewBoard = page.locator('.review-board');
  await expect(reviewBoard.locator('cg-board')).toBeVisible();
  await reviewBoard.scrollIntoViewIfNeeded();
  const board = await visibleBounds(reviewBoard);
  const point = (square: string) => ({
    x: board.x + ((square.charCodeAt(0) - 97 + 0.5) * board.width) / 8,
    y: board.y + ((8 - Number(square[1]) + 0.5) * board.height) / 8,
  });
  const origin = point(from);
  const destination = point(to);
  await page.mouse.click(origin.x, origin.y);
  await page.mouse.click(destination.x, destination.y);
}

async function visibleBounds(locator: Locator) {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    return { x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height };
  });
}

async function expectBoardOverlayWithinBounds(page: Page, selector: string): Promise<void> {
  await expect
    .poll(() =>
      page.locator(selector).evaluate((overlay) => {
        const board = overlay.closest('.board-stage')!.getBoundingClientRect();
        const bounds = overlay.getBoundingClientRect();
        return (
          bounds.left >= board.left &&
          bounds.top >= board.top &&
          bounds.right <= board.right &&
          bounds.bottom <= board.bottom
        );
      }),
    )
    .toBe(true);
}

async function expectReviewWorkspaceToFitViewport(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const scrollingElement = document.scrollingElement!;
    const board = document.querySelector<HTMLElement>('.board-column')!.getBoundingClientRect();
    const desk = document.querySelector<HTMLElement>('.review-desk')!.getBoundingClientRect();
    return {
      documentHeight: scrollingElement.scrollHeight,
      clientHeight: scrollingElement.clientHeight,
      boardBottom: board.bottom,
      deskBottom: desk.bottom,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
  expect(geometry.boardBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.deskBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
}

async function expectReviewResponsiveness(page: Page): Promise<void> {
  const viewports = [
    { width: 320, height: 568, stacked: true },
    { width: 820, height: 1180, stacked: true },
    { width: 1024, height: 600, stacked: true },
    { width: 1280, height: 720, stacked: false },
    { width: 1648, height: 828, stacked: false, minimumDeskWidth: 520 },
    { width: 2048, height: 941, stacked: false, minimumDeskWidth: 620 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const visibleControls = page.getByRole('navigation', { name: 'Replay controls' });
    await expect(visibleControls).toHaveCount(1);
    await expect(visibleControls).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const scrollingElement = document.scrollingElement!;
          return scrollingElement.scrollWidth <= scrollingElement.clientWidth + 1;
        }),
      )
      .toBe(true);

    if (viewport.stacked) {
      await expect(page.locator('.workspace-review-toolbar')).toBeVisible();
      await expect(
        page.locator('.board-column').getByRole('navigation', { name: 'Replay controls' }),
      ).toBeVisible();
      const geometry = await page.evaluate(() => {
        const lowerPlayer = document.querySelectorAll<HTMLElement>(
          '.board-column > .player-strip',
        )[1]!;
        const controls = document
          .querySelector<HTMLElement>('.board-column > app-review-replay-controls')!
          .getBoundingClientRect();
        const playerBounds = lowerPlayer.getBoundingClientRect();
        return { controlsTop: controls.top, playerBottom: playerBounds.bottom };
      });
      expect(Math.abs(geometry.controlsTop - geometry.playerBottom)).toBeLessThanOrEqual(1);
      await page.locator('.review-desk').scrollIntoViewIfNeeded();
      await expect(page.getByRole('heading', { name: 'Game review', exact: true })).toBeVisible();
    } else {
      await expect(page.locator('.workspace-review-toolbar')).toBeVisible();
      await expect(
        page.locator('.review-desk').getByRole('navigation', { name: 'Replay controls' }),
      ).toBeVisible();
      const geometry = await page.evaluate(() => {
        const board = document.querySelector<HTMLElement>('.board-stage')!.getBoundingClientRect();
        const desk = document.querySelector<HTMLElement>('.review-desk')!.getBoundingClientRect();
        const frame = document.querySelector<HTMLElement>('.review-frame')!;
        const note = document.querySelector<HTMLElement>('.coach-note')!.getBoundingClientRect();
        const candidates = document
          .querySelector<HTMLElement>('.live-analysis')!
          .getBoundingClientRect();
        const controls = document
          .querySelector<HTMLElement>('.panel-replay-controls')!
          .getBoundingClientRect();
        return {
          boardHeight: board.height,
          boardRight: board.right,
          boardWidth: board.width,
          candidatesTop: candidates.top,
          controlsBottom: controls.bottom,
          deskBottom: desk.bottom,
          deskLeft: desk.left,
          deskWidth: desk.width,
          frameClientHeight: frame.clientHeight,
          frameScrollHeight: frame.scrollHeight,
          noteBottom: note.bottom,
          viewportWidth: window.innerWidth,
        };
      });
      expect(geometry.boardWidth).toBeGreaterThanOrEqual(geometry.viewportWidth * 0.4);
      expect(geometry.candidatesTop).toBeGreaterThanOrEqual(geometry.noteBottom - 1);
      expect(geometry.controlsBottom).toBeLessThanOrEqual(geometry.deskBottom + 1);
      expect(geometry.frameScrollHeight).toBeLessThanOrEqual(geometry.frameClientHeight + 1);

      if (viewport.minimumDeskWidth) {
        expect(Math.abs(geometry.boardWidth - geometry.boardHeight)).toBeLessThanOrEqual(1);
        expect(geometry.boardHeight).toBeGreaterThanOrEqual(viewport.height * 0.86);
        expect(geometry.deskWidth).toBeGreaterThanOrEqual(viewport.minimumDeskWidth);
        expect(geometry.deskWidth).toBeLessThanOrEqual(641);
        expect(geometry.deskLeft - geometry.boardRight).toBeGreaterThanOrEqual(13);
        expect(geometry.deskLeft - geometry.boardRight).toBeLessThanOrEqual(23);
      }
    }
  }
}

async function expectPlayerStripsToClearEvaluationRail(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>('.evaluation-rail')!.getBoundingClientRect();
    const board = document.querySelector<HTMLElement>('.board-stage')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('.board-column > .player-strip')].map(
      (strip) => {
        const bounds = strip.getBoundingClientRect();
        return {
          left: bounds.left,
          clearsRail: bounds.left >= rail.right,
          alignsWithBoard: Math.abs(bounds.left - board.left) <= 1,
        };
      },
    );
  });
  expect(geometry).toHaveLength(2);
  expect(geometry.every((strip) => strip.clearsRail && strip.alignsWithBoard)).toBe(true);
}

async function seedBoardTheme(
  page: Page,
  boardTheme: 'tournament' | 'classic' | 'high-contrast',
): Promise<void> {
  await page.evaluate(async (theme) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('leal-chess');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('state', 'readwrite');
    transaction.objectStore('state').put({
      key: 'preferences',
      value: {
        soundEnabled: true,
        showLegalMoves: true,
        premovesEnabled: true,
        boardTheme: theme,
        orientation: 'white',
        botRating: 1500,
      },
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, boardTheme);
}

async function seedLearnDashboard(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('leal-chess');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(['coachProfiles', 'importedGames'], 'readwrite');
    const profiles = transaction.objectStore('coachProfiles');
    const games = transaction.objectStore('importedGames');
    const importedAt = '2026-07-27T12:00:00.000Z';
    const profile = (
      platform: 'chess-com' | 'lichess',
      username: string,
    ): Record<string, unknown> => ({
      platform,
      username,
      displayName: username,
      profileUrl: '',
      updatedAt: importedAt,
    });
    const game = (options: {
      key: string;
      platform: 'chess-com' | 'lichess';
      date: string;
      learner: string;
      learnerColor: 'white' | 'black';
      opponent: string;
      rating: number;
      result: string;
      speed: string;
    }): Record<string, unknown> => ({
      key: options.key,
      platform: options.platform,
      platformGameId: options.key.split(':')[1],
      platformUrl: '',
      pgn: '',
      variant: 'standard',
      white:
        options.learnerColor === 'white'
          ? { username: options.learner, rating: options.rating }
          : { username: options.opponent, rating: options.rating - 10 },
      black:
        options.learnerColor === 'black'
          ? { username: options.learner, rating: options.rating }
          : { username: options.opponent, rating: options.rating - 10 },
      result: options.result,
      speed: options.speed,
      timeControl: options.speed === 'rapid' ? '600' : '180',
      rated: true,
      endTime: options.date,
      moves: [],
      parseStatus: 'ready',
      profileKeys: [`${options.platform}:${options.learner.toLowerCase()}`],
      firstImportedAt: importedAt,
      lastImportedAt: importedAt,
    });

    profiles.put(profile('chess-com', 'Learner'));
    profiles.put(profile('lichess', 'Student'));
    games.put(
      game({
        key: 'chess-com:old-win',
        platform: 'chess-com',
        date: '2026-07-01T12:00:00.000Z',
        learner: 'Learner',
        learnerColor: 'white',
        opponent: 'RapidOpponent',
        rating: 1400,
        result: '1-0',
        speed: 'rapid',
      }),
    );
    games.put(
      game({
        key: 'lichess:draw',
        platform: 'lichess',
        date: '2026-07-10T12:00:00.000Z',
        learner: 'Student',
        learnerColor: 'white',
        opponent: 'DrawOpponent',
        rating: 1600,
        result: '1/2-1/2',
        speed: 'blitz',
      }),
    );
    games.put(
      game({
        key: 'chess-com:new-loss',
        platform: 'chess-com',
        date: '2026-07-20T12:00:00.000Z',
        learner: 'Learner',
        learnerColor: 'black',
        opponent: 'BlitzOpponent',
        rating: 1460,
        result: '1-0',
        speed: 'blitz',
      }),
    );
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
}

async function assertNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
}
