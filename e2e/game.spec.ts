import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByRole('heading', { name: 'Choose your side' })).toBeVisible();
});

test('starts as White, supports click moves, premoves, annotations, and restoration', async ({
  page,
}, testInfo) => {
  await startGame(page, 'White', 3190);
  await expect(
    page.locator('app-game-sidebar').getByRole('button', { name: 'Flip board' }),
  ).toHaveCount(0);
  const flipBoard = page
    .locator('.player-strip.opponent')
    .getByRole('button', { name: 'Flip board' });
  await expect(flipBoard).toBeVisible();
  await expectFlipControlAtBoardTopRight(page, '.board-frame');
  await expect(page.locator('app-chess-board .board-frame')).toHaveClass(/orientation-white/);
  await flipBoard.click();
  await expect(page.locator('app-chess-board .board-frame')).toHaveClass(/orientation-black/);
  await flipBoard.click();
  await expect(page.locator('app-chess-board .board-frame')).toHaveClass(/orientation-white/);
  if (testInfo.project.name === 'chromium') {
    // Exact computed-style equality is rendering-engine-sensitive and adds no
    // cross-browser signal beyond the orientation-class contract asserted above;
    // see src/app/core/game/board-themes.spec.ts for the unit-level coverage.
    await expect(page.locator('coords.files coord').nth(0)).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    await expect(page.locator('coords.files coord').nth(1)).toHaveCSS('color', 'rgb(24, 27, 21)');
    await expect(page.locator('coords.ranks coord').nth(0)).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    await expect(page.locator('coords.ranks coord').nth(1)).toHaveCSS('color', 'rgb(24, 27, 21)');
  }
  await clickSquare(page, 'e2');
  const legalDestinations = page.locator('square.move-dest');
  await expect(legalDestinations).toHaveCount(2);
  await expect
    .poll(() =>
      legalDestinations.first().evaluate((square) => getComputedStyle(square).backgroundImage),
    )
    .not.toBe('none');
  await clickSquare(page, 'e4');
  await expect(page.getByRole('heading', { name: 'Stockfish is thinking' })).toBeVisible();
  await clickSquare(page, 'g1');
  await clickSquare(page, 'f3');

  await expect(page.locator('.history li')).toHaveCount(2, { timeout: 15_000 });
  await expect(
    page.locator('div[aria-live="polite"]').filter({ hasText: /Premove played|Premove .* queued/ }),
  ).toBeAttached();

  await drawShape(page, 'c1', 'g5');
  await drawShape(page, 'd4', 'd4');
  await expect(page.locator('svg.cg-shapes')).toBeAttached();

  await page.reload();
  await expect(page.locator('.history li')).toHaveCount(2);
  await expect(page.getByText('Previous game restored')).toHaveCount(0);
  await expect(
    page.locator('[aria-live]').filter({ hasText: /restored previous game/i }),
  ).toHaveCount(0);
  if (testInfo.project.name === 'chromium') {
    await assertNoOuterWorkspaceOverflow(page);
  }
});

test('reviews, archives, and deletes a completed Stockfish game', async ({ page }) => {
  await startGame(page, 'Black', 1500);
  await expect(page.locator('.history li')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('.player-strip.opponent').getByText('1500 Elo')).toBeVisible();

  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep playing' })).toHaveCSS(
    'color',
    'rgb(24, 27, 21)',
  );
  await page.getByRole('button', { name: 'Resign game' }).click();
  const gameOverDialog = page.getByRole('dialog', { name: 'Game over' });
  await expect(gameOverDialog).toBeVisible();
  await expect(gameOverDialog).toContainText('You resigned');
  await expect(gameOverDialog.getByRole('button', { name: 'Review game' })).toBeFocused();

  await gameOverDialog.getByRole('button', { name: 'Review game' }).click();
  await expect(page).toHaveURL(/\/learn\/review\/local\/.+autoAnalyze=true/);
  await expect(page.locator('.review-board')).toBeVisible();
  await expect(page.locator('.game-meta')).toContainText('LealChess');
  await expect(page.locator('.player-strip')).toContainText(['Stockfish', 'You']);
  await expect(page.getByRole('button', { name: 'Analyze game' })).toHaveCount(0);

  await page.goto('/learn');
  const localGame = page.locator('.game-list article').filter({ hasText: 'LealChess' });
  await expect(localGame).toHaveCount(1);
  await localGame.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Delete this game?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep game' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete game' }).click();
  await expect(localGame).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Review your games' })).toBeFocused();

  await page.goto('/play');
  await expect(page.getByRole('heading', { name: 'Choose your side' })).toBeVisible();
});

test('supports drag-to-move', async ({ page }) => {
  await startGame(page, 'White', 2200);
  await dragSquare(page, 'e2', 'e4');
  await expect(page.locator('.history')).toContainText('e4');
});

test('promotes a pawn with a touch-friendly chooser', async ({ page }) => {
  await seedGame(page, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'white');
  await clickPiece(page, 'piece.white.pawn');
  await expect(page.locator('square.selected')).toHaveCount(1);
  await clickSquare(page, 'a8');
  await expect(page.getByRole('dialog', { name: 'Choose promotion' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Queen/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /Rook/ })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('piece.white.queen')).toBeAttached();
});

test('keeps dialogs keyboard-contained and restores focus', async ({ page }) => {
  const setupDialog = page.getByRole('dialog', { name: 'Choose your side' });
  await expect(page.getByRole('button', { name: 'White', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(setupDialog).toBeHidden();
  const newGame = page.getByRole('button', { name: 'New game' }).first();
  await expect(newGame).toBeFocused();

  await newGame.click();
  await expect(page.getByRole('button', { name: 'White', exact: true })).toBeFocused();
  const rating = page.locator('#new-bot-rating');
  await rating.focus();
  await page.keyboard.press('End');
  await expect(rating).toHaveAttribute('aria-valuetext', '3190 Elo');
  await page.keyboard.press('Home');
  await expect(rating).toHaveAttribute('aria-valuetext', '1320 Elo');
  await page.keyboard.press('Escape');
  await expect(setupDialog).toBeHidden();
  await expect(newGame).toBeFocused();

  await newGame.click();
  await startGame(page, 'White', 1500);
  const resign = page.getByRole('button', { name: 'Resign', exact: true });
  await resign.click();
  await expect(page.getByRole('button', { name: 'Keep playing' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(resign).toBeFocused();
});

test('shows Stockfish startup failure and recovers on retry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Worker startup recovery smoke test');
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('leal-chess');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('engineAssets', 'readwrite');
    transaction.objectStore('engineAssets').clear();
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.route('**/stockfish-18-lite-single.js', (route) => route.abort());
  await page.reload();

  const dialog = page.getByRole('dialog', { name: 'Choose your side' });
  await expect(dialog.getByRole('alert')).toContainText('Stockfish could not start', {
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Start game' })).toBeDisabled();

  await page.unroute('**/stockfish-18-lite-single.js');
  await dialog.getByRole('button', { name: 'Retry engine' }).click();
  await expect(dialog.getByText('Stockfish is ready')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Start game' })).toBeEnabled();
});

test('has no serious accessibility violations in setup and active play', async ({ page }) => {
  await assertNoSeriousA11yViolations(page);
  await startGame(page, 'White', 1500);
  await expect(page.getByRole('img', { name: 'Chessboard' })).toHaveAttribute(
    'aria-describedby',
    'play-board-description',
  );
  await assertNoSeriousA11yViolations(page);
});

test('completes a checkmate flow from a restored position', async ({ page }) => {
  await seedGame(page, '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', 'white');
  await dragPieceTo(page, 'piece.white.queen', 'g7');
  const gameOverDialog = page.getByRole('dialog', { name: 'Game over' });
  await expect(gameOverDialog).toBeVisible();
  await expect(gameOverDialog).toContainText('White wins by checkmate');
  await expect(gameOverDialog.getByRole('button', { name: 'Review game' })).toBeFocused();
  await assertNoSeriousA11yViolations(page);

  await gameOverDialog.getByRole('button', { name: 'Restart' }).click();
  const restartConfirmation = page.getByRole('alertdialog', { name: 'Restart this game?' });
  await expect(restartConfirmation).toBeVisible();
  await expect(restartConfirmation.getByRole('button', { name: 'Keep result' })).toBeFocused();
  await restartConfirmation.getByRole('button', { name: 'Keep result' }).click();
  await expect(gameOverDialog.getByRole('button', { name: 'Restart' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(gameOverDialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'White wins by checkmate' })).toBeVisible();
  await expect(gameOverDialog).toHaveCount(0);

  await page.getByRole('button', { name: 'New game' }).first().click();
  await startGame(page, 'White', 1500);
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  await expect(page.locator('.history')).toContainText('e4');
});

test('keeps game controls visible while move history scrolls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Single desktop flex geometry check');
  await startGame(page, 'White', 1500);
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  await expect(page.locator('.history li')).toHaveCount(1, { timeout: 15_000 });

  await page.locator('.history ol').evaluate((list) => {
    const row = list.querySelector('li')!;
    for (let index = 0; index < 40; index += 1) {
      list.append(row.cloneNode(true));
    }
  });

  const geometry = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>('.sidebar')!.getBoundingClientRect();
    const history = document.querySelector<HTMLElement>('.history')!;
    const controls = document.querySelector<HTMLElement>('.controls-card')!.getBoundingClientRect();

    return {
      controlsBottom: controls.bottom,
      historyClientHeight: history.clientHeight,
      historyScrollHeight: history.scrollHeight,
      sidebarBottom: sidebar.bottom,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry.historyScrollHeight).toBeGreaterThan(geometry.historyClientHeight);
  expect(geometry.controlsBottom).toBeLessThanOrEqual(geometry.sidebarBottom + 1);
  expect(geometry.sidebarBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
});

test('keeps the board primary on a mobile viewport', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Mobile layout check');
  await startGame(page, 'White', 1320);
  const board = await page.locator('.board-frame').boundingBox();
  const viewport = page.viewportSize();
  expect(board).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(board!.width).toBeGreaterThan(viewport!.width * 0.85);
  await expect(page.getByRole('button', { name: 'New game' }).first()).toBeVisible();
});

async function startGame(page: Page, color: 'White' | 'Black', botRating: number) {
  const ratingStops = [
    1320, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800,
    2900, 3000, 3100, 3190,
  ];
  await page.getByRole('button', { name: color, exact: true }).click();
  await page.locator('#new-bot-rating').fill(String(ratingStops.indexOf(botRating)));
  await expect(page.locator('#new-bot-rating')).toHaveAttribute(
    'aria-valuetext',
    `${botRating} Elo`,
  );
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('heading', { name: /Your move|Stockfish is thinking/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('cg-board')).toBeVisible();
  await settleLayout(page);
}

async function clickSquare(page: Page, square: string) {
  const point = await squarePoint(page, square);
  await page.mouse.click(point.x, point.y);
}

async function dragSquare(page: Page, from: string, to: string) {
  const origin = await squarePoint(page, from);
  const destination = await squarePoint(page, to);
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 8 });
  await page.mouse.up();
}

async function dragPieceTo(page: Page, selector: string, to: string) {
  const piece = await page.locator(selector).boundingBox();
  if (!piece) {
    throw new Error(`Piece ${selector} is not visible.`);
  }
  const destination = await squarePoint(page, to);
  await page.mouse.move(piece.x + piece.width / 2, piece.y + piece.height / 2);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 8 });
  await page.mouse.up();
}

async function clickPiece(page: Page, selector: string) {
  const piece = await page.locator(selector).boundingBox();
  if (!piece) {
    throw new Error(`Piece ${selector} is not visible.`);
  }
  await page.mouse.click(piece.x + piece.width / 2, piece.y + piece.height / 2);
}

async function drawShape(page: Page, from: string, to: string) {
  const origin = await squarePoint(page, from);
  const destination = await squarePoint(page, to);
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(destination.x, destination.y, { steps: 5 });
  await page.mouse.up({ button: 'right' });
}

async function squarePoint(page: Page, square: string) {
  const board = page.locator('cg-board');
  await expect(board).toBeVisible();
  const bounds = await board.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    return { x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height };
  });
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return {
    x: bounds.x + ((file + 0.5) * bounds.width) / 8,
    y: bounds.y + ((8 - rank + 0.5) * bounds.height) / 8,
  };
}

async function seedGame(page: Page, fen: string, playerColor: 'white' | 'black') {
  const pgn = pgnForFen(fen);
  await page.evaluate(
    async ({ storedFen, storedPgn, color }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('leal-chess');
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('state')) {
            request.result.createObjectStore('state', { keyPath: 'key' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction('state', 'readwrite');
      transaction.objectStore('state').put({
        key: 'active-game',
        value: {
          schemaVersion: 2,
          gameId: crypto.randomUUID(),
          pgn: storedPgn,
          fen: storedFen,
          moves: [],
          playerColor: color,
          orientation: color,
          botRating: 1500,
          pendingPremove: null,
          result: null,
          updatedAt: new Date().toISOString(),
        },
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
    { storedFen: fen, storedPgn: pgn, color: playerColor },
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Previous game restored')).toHaveCount(0);
  await expect(page.locator('cg-board')).toBeVisible();
  await settleLayout(page);
}

function pgnForFen(fen: string): string {
  return `[Event "?"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "?"]
[Black "?"]
[Result "*"]
[SetUp "1"]
[FEN "${fen}"]

 *`;
}

async function settleLayout(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
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

async function assertNoOuterWorkspaceOverflow(page: Page) {
  const geometry = await page.evaluate(() => {
    const scrollingElement = document.scrollingElement!;
    const frame = document.querySelector<HTMLElement>('.app-frame')!;
    const board = document.querySelector<HTMLElement>('.board-column')!.getBoundingClientRect();
    const controls = document
      .querySelector<HTMLElement>('app-game-sidebar')!
      .getBoundingClientRect();

    return {
      documentHeight: scrollingElement.scrollHeight,
      documentWidth: scrollingElement.scrollWidth,
      frameHeight: frame.scrollHeight,
      frameWidth: frame.scrollWidth,
      clientHeight: scrollingElement.clientHeight,
      clientWidth: scrollingElement.clientWidth,
      frameClientHeight: frame.clientHeight,
      frameClientWidth: frame.clientWidth,
      boardBottom: board.bottom,
      controlsBottom: controls.bottom,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.frameHeight).toBeLessThanOrEqual(geometry.frameClientHeight + 1);
  expect(geometry.frameWidth).toBeLessThanOrEqual(geometry.frameClientWidth + 1);
  expect(geometry.boardBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.controlsBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
}

async function expectFlipControlAtBoardTopRight(page: Page, boardSelector: string): Promise<void> {
  const control = await page.getByRole('button', { name: 'Flip board' }).boundingBox();
  const board = await page.locator(boardSelector).boundingBox();
  expect(control).not.toBeNull();
  expect(board).not.toBeNull();
  expect(Math.abs(control!.x + control!.width - (board!.x + board!.width))).toBeLessThanOrEqual(2);
  expect(control!.y + control!.height).toBeLessThanOrEqual(board!.y + 1);
}
