import { expect, test, type Page, type Route } from '@playwright/test';
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
  await page.getByRole('button', { name: 'Flip board' }).click();
  await expect(page.getByRole('img', { name: 'Review chessboard' })).toHaveAttribute(
    'aria-describedby',
    'review-board-description',
  );
  await assertNoSeriousA11yViolations(page);
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

test('analyzes locally, caches the result, and opens a missed position', async ({
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
  await expect(page.getByRole('button', { name: 'Show idea on board' })).toBeVisible();
  await expect(page.getByText('Advantage graph', { exact: true })).toBeVisible();
  await expect(page.locator('.advantage-label, .equal-label')).toHaveCount(0);
  await expect(page.locator('.zero-line')).toHaveCSS('stroke', 'rgb(137, 139, 131)');
  await expect(page.locator('.zero-line')).toHaveCSS('stroke-dasharray', 'none');
  await expect(page.locator('.evaluation-rail')).toBeVisible();
  await expect(page.locator('.evaluation-rail')).toHaveAttribute('aria-label', /White evaluation/);
  await expectPlayerStripsToClearEvaluationRail(page);
  await page.getByRole('button', { name: 'f3' }).click();
  await expect(page.locator('.review-classification')).toBeVisible();
  await expectBoardOverlayWithinBounds(page, '.review-classification');
  await expect(page.locator('.coach-note')).toContainText(
    /stronger continuation|engine’s top move/,
  );
  await page.getByRole('button', { name: 'e5' }).click();
  await expect(page.locator('.review-classification')).toBeVisible();
  await expect(page.locator('.coach-note')).toContainText(/Book|Best|Excellent|Good/);
  await page.getByRole('button', { name: 'f3' }).click();
  await page.getByRole('button', { name: 'Practice this position' }).click();
  await expect(page.getByRole('heading', { name: 'Find a better move' })).toBeVisible();
  await expect(page.getByText(/Move a piece for/)).toHaveCount(0);
  const previousPosition = page.getByRole('button', { name: 'Previous position' });
  const nextPosition = page.getByRole('button', { name: 'Next position' });
  await expect(previousPosition).toBeDisabled();
  await nextPosition.click();
  await expect(previousPosition).toBeEnabled();
  await expect(page.getByText(/Replaying the opponent’s last move/)).toHaveCount(0);
  await expect(page.locator('.review-board square.last-move')).toHaveCount(2);
  await previousPosition.click();
  await expect(previousPosition).toBeDisabled();
  await moveReviewPiece(page, 'a2', 'a3');
  await expect(page.locator('.practice-classification')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Three ways forward' })).toBeVisible();
  await expect(page.locator('.review-board svg.cg-shapes line')).toHaveCount(3);
  await moveReviewPiece(page, 'b8', 'c6');
  await expect(page.getByText('2 moves across your variations')).toBeVisible({
    timeout: 15_000,
  });
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
  const board = await reviewBoard.locator('cg-board').boundingBox();
  if (!board) throw new Error('Review board is not visible.');
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

async function moveReviewPiece(page: Page, from: string, to: string): Promise<void> {
  const reviewBoard = page.locator('.review-board cg-board');
  await expect(reviewBoard).toBeVisible();
  await reviewBoard.scrollIntoViewIfNeeded();
  const board = await reviewBoard.boundingBox();
  if (!board) throw new Error('Review board is not visible.');
  const point = (square: string) => ({
    x: board.x + ((square.charCodeAt(0) - 97 + 0.5) * board.width) / 8,
    y: board.y + ((8 - Number(square[1]) + 0.5) * board.height) / 8,
  });
  const origin = point(from);
  const destination = point(to);
  await page.mouse.click(origin.x, origin.y);
  await page.mouse.click(destination.x, destination.y);
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
