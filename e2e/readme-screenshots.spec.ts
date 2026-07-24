import { expect, test, type Page, type Route } from '@playwright/test';

const screenshotPgn = `[Event "Imported game"]
[White "Learner"]
[Black "Opponent"]
[Result "0-1"]
[ECO "A00"]
[Opening "Barnes Opening"]
[TimeControl "600+0"]

1. f3 e5 2. g4 Qh4# 0-1`;

test('captures the README product tour', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });

  await page.goto('/');
  await page.getByRole('button', { name: 'White', exact: true }).click();
  await page.locator('#new-difficulty').selectOption('casual');
  await expect(page.getByRole('button', { name: 'Start game' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('cg-board')).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  await expect(page.locator('.history li')).toHaveCount(1, { timeout: 20_000 });
  await page.screenshot({
    path: 'docs/screenshots/play.png',
    fullPage: true,
    animations: 'disabled',
  });

  await mockPlatforms(page);
  await page.goto('/learn');
  await page.getByLabel('Chess.com username').fill('Learner');
  await page.getByLabel('Lichess username').fill('Learner');
  await page.getByRole('button', { name: 'Import your games' }).click();
  await expect(page.locator('.game-list article')).toHaveCount(2);
  await page.screenshot({
    path: 'docs/screenshots/learn.png',
    fullPage: true,
    animations: 'disabled',
  });

  await page
    .getByRole('link', { name: /Open review/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Analyze game' }).click();
  await expect(page.getByRole('heading', { name: /learning moments found/ })).toBeVisible({
    timeout: 35_000,
  });
  await page.getByRole('button', { name: /Practice \d+ moments/ }).click();
  await expect(page.getByRole('heading', { name: 'Find a better move' })).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/review-practice.png',
    fullPage: true,
    animations: 'disabled',
  });
});

async function mockPlatforms(page: Page): Promise<void> {
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
            pgn: screenshotPgn,
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

  await page.route('**/lichess.org/api/**', (route) => {
    if (route.request().url().includes('/api/games/user/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: `${JSON.stringify({
          id: 'lichess101',
          pgn: screenshotPgn,
          speed: 'rapid',
          rated: true,
          lastMoveAt: 1_784_912_400_000,
          winner: 'white',
          players: {
            white: { user: { name: 'Learner' }, rating: 1510 },
            black: { user: { name: 'Opponent' }, rating: 1495 },
          },
          opening: { eco: 'A00', name: 'Barnes Opening' },
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

async function clickSquare(page: Page, square: string) {
  const board = await page.locator('cg-board').boundingBox();
  if (!board) throw new Error('Chessboard is not visible.');
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  await page.mouse.click(
    board.x + ((file + 0.5) * board.width) / 8,
    board.y + ((8 - rank + 0.5) * board.height) / 8,
  );
}
