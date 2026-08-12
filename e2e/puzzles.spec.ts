import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://lichess.org/api/puzzle/daily', async (route) => {
    await route.fulfill({
      json: {
        game: { pgn: '1. e4 e5' },
        puzzle: {
          id: 'daily-lichess',
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          initialPly: 0,
          rating: 1200,
          themes: ['opening'],
          solution: ['e2e4', 'e7e5', 'g1f3'],
        },
      },
    });
  });
  await page.route('https://api.chess.com/pub/puzzle', async (route) => {
    await route.fulfill({
      json: {
        title: 'Mock daily',
        url: 'https://www.chess.com/daily/2026-08-12',
        publish_time: 1_786_518_000,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        pgn: '1. d4 d5 2. c4',
      },
    });
  });
});

test('loads both providers, exposes credits, and filters offline practice', async ({ page }) => {
  await page.goto('/puzzles');
  await expect(page.getByRole('heading', { name: 'Puzzles' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mock daily' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View on Chess.com' })).toHaveAttribute(
    'href',
    'https://www.chess.com/daily/2026-08-12',
  );

  await page.getByRole('combobox', { name: 'Themes' }).fill('advantage');
  await page.getByRole('option', { name: 'advantage' }).click();
  await page.getByRole('combobox', { name: 'Openings' }).fill('Queens Gambit');
  await page.getByRole('option', { name: 'Queens Gambit', exact: true }).click();
  await page.getByRole('button', { name: 'Find a puzzle' }).click();
  await expect(page.getByRole('heading', { name: 'Find the best move' })).toBeVisible();
  await expect(page.locator('.solver-board cg-board')).toHaveCSS(
    'background-image',
    /conic-gradient/,
  );
  await expect(page.getByText('Themes and opening tags appear after completion.')).toBeVisible();

  await page.getByRole('button', { name: 'Hint 1 of 2' }).click();
  await expect(page.getByText('The correct piece is highlighted.')).toBeVisible();
  await expect(page.locator('.solver-board .cg-shapes > g circle')).toHaveCount(1);
  await page.getByRole('button', { name: 'Hint 2 of 2' }).click();
  await expect(page.getByText('The destination is shown.')).toBeVisible();
  await expect(page.locator('.solver-board .cg-shapes > g line')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'All hints shown' })).toBeDisabled();

  const fileCoordinates = page.locator('.solver-board coords.files coord');
  await expect(fileCoordinates.nth(0)).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(fileCoordinates.nth(1)).toHaveCSS('color', 'rgb(24, 27, 21)');

  await page.getByRole('button', { name: 'Reveal' }).click();
  await expect(page.locator('.result')).toHaveText('revealed');
  await expect(
    page.locator('.result-tags').getByText('Queens Gambit', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent attempts' })).toHaveCount(0);
});

test('recovers one provider from cache when its live request fails', async ({ page }) => {
  await page.goto('/puzzles');
  await expect(page.getByRole('heading', { name: 'Mock daily' })).toBeVisible();
  await page.route('https://api.chess.com/pub/puzzle', (route) => route.abort());
  await page.reload();
  await expect(page.getByText('Live puzzle unavailable; showing the saved puzzle.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mock daily' })).toBeVisible();
});
