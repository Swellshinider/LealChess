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

test('imports both platforms, persists and deduplicates games, then replays moves', async ({
  page,
}) => {
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
    'rgb(23, 36, 44)',
  );
  await drawReviewArrow(page, 'c7', 'g5');
  await expect(page.locator('.review-board svg.cg-shapes line')).toHaveCount(1);
  await expect(page.getByText('Ply 0 of 4', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(page.getByText('Ply 1 of 4', { exact: true })).toBeVisible();
  await expect(page.locator('.review-board svg.cg-shapes line')).toHaveCount(1);
  await page.getByLabel('Replay keyboard shortcuts').focus();
  await page.keyboard.press('End');
  await expect(page.getByText('Ply 4 of 4', { exact: true })).toBeVisible();
  await expect(
    page.locator('[aria-live="polite"]').filter({ hasText: 'Position 4 of 4' }),
  ).toBeAttached();
  await page.getByRole('button', { name: 'f3' }).click();
  await expect(page.getByText('Ply 1 of 4', { exact: true })).toBeVisible();
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
  test.setTimeout(45_000);
  await page.getByLabel('Lichess username').fill('Learner');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Added 1 game.')).toBeVisible();
  await page.goto('/learn');
  await page.getByRole('link', { name: /Open review/ }).click();

  await page.getByRole('button', { name: 'Analyze game' }).click();
  await expect(page.getByRole('heading', { name: /learning moments found/ })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /Practice \d+ moments/ }).click();
  await expect(page.getByRole('heading', { name: 'Find a better move' })).toBeVisible();
  const practiceTab = page.getByRole('tab', { name: 'Practice' });
  await expect(practiceTab).toHaveAttribute('aria-selected', 'true');
  await practiceTab.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Score sheet' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowRight');
  await expect(practiceTab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Reveal move' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.review-board svg.cg-shapes line')).toHaveCount(1);
  await assertNoSeriousA11yViolations(page);

  await page.reload();
  await expect(page.getByRole('heading', { name: /learning moments found/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyze game' })).toHaveCount(0);
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
        difficulty: 'casual',
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
