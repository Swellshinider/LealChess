import { expect, test, type Page, type Route } from '@playwright/test';

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
  await page.goto('/learn');
});

test('imports both platforms, persists and deduplicates games, then replays moves', async ({
  page,
}) => {
  await page.getByLabel('Chess.com username').fill('Learner');
  await page.getByLabel('Lichess username').fill('Learner');
  await page.getByRole('button', { name: 'Import your games' }).click();

  await expect(page.getByText('Imported 1 games. Ready to find learning moments.')).toHaveCount(2);
  await expect(page.locator('.game-list article')).toHaveCount(2);
  await expect(page.locator('.game-list').getByText("King's Pawn Game")).toHaveCount(2);

  await page.reload();
  await expect(page.locator('.game-list article')).toHaveCount(2);
  await expect(page.getByLabel('Chess.com username')).toHaveValue('Learner');

  await page.getByRole('button', { name: 'Import your games' }).click();
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
  await expect(page.getByText('Ply 0 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(page.getByText('Ply 1 of 4')).toBeVisible();
  await expect(page.locator('.review-board svg.cg-shapes line')).toHaveCount(1);
  await page.keyboard.press('End');
  await expect(page.getByText('Ply 4 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'f3' }).click();
  await expect(page.getByText('Ply 1 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Flip board' }).click();
});

test('analyzes locally, caches the result, and opens a missed position', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Real analysis worker smoke test');
  test.setTimeout(45_000);
  await page.getByLabel('Lichess username').fill('Learner');
  await page.getByRole('button', { name: 'Import your games' }).click();
  await page.getByRole('link', { name: /Open review/ }).click();

  await page.getByRole('button', { name: 'Analyze game' }).click();
  await expect(page.getByRole('heading', { name: /learning moments found/ })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /Practice \d+ moments/ }).click();
  await expect(page.getByRole('heading', { name: 'Find a better move' })).toBeVisible();
  await page.getByRole('button', { name: 'Reveal move' }).click();
  await expect(page.locator('.review-board svg.cg-shapes line')).toHaveCount(1);

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
  await page.getByRole('button', { name: 'Import your games' }).click();

  await expect(page.getByText(/Lichess is limiting requests/)).toBeVisible();
  await expect(page.getByText('Imported 1 games. Ready to find learning moments.')).toBeVisible();
  await expect(page.locator('.game-list article')).toHaveCount(1);
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
