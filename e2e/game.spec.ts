import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Choose your side' })).toBeVisible();
});

test('starts as White, supports click moves, premoves, annotations, and restoration', async ({
  page,
}) => {
  await startGame(page, 'White', 'Advanced');
  await expect(page.locator('coords.files coord').nth(0)).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('coords.files coord').nth(1)).toHaveCSS('color', 'rgb(23, 36, 44)');
  await expect(page.locator('coords.ranks coord').nth(0)).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('coords.ranks coord').nth(1)).toHaveCSS('color', 'rgb(23, 36, 44)');
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
  await expect(page.getByText(/Premove played|Premove .* queued/)).toBeAttached();

  await drawShape(page, 'c1', 'g5');
  await drawShape(page, 'd4', 'd4');
  await expect(page.locator('svg.cg-shapes')).toBeAttached();

  await page.reload();
  await expect(page.getByText('Previous game restored')).toBeVisible();
  await expect(page.locator('.history li')).toHaveCount(2);
});

test('starts as Black, receives an opening move, changes difficulty, and resigns', async ({
  page,
}) => {
  await startGame(page, 'Black', 'Casual');
  await expect(page.locator('.history li')).toHaveCount(1, { timeout: 15_000 });
  await page.locator('#difficulty').selectOption('intermediate');
  await expect(page.locator('#difficulty')).toHaveValue('intermediate');

  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep playing' })).toHaveCSS(
    'color',
    'rgb(23, 36, 44)',
  );
  await page.getByRole('button', { name: 'Resign game' }).click();
  await expect(page.getByRole('heading', { name: 'You resigned' })).toBeVisible();
});

test('supports drag-to-move and cancels a premove that becomes illegal', async ({ page }) => {
  await startGame(page, 'White', 'Advanced');
  await dragSquare(page, 'e2', 'e4');
  await clickSquare(page, 'e4');
  await clickSquare(page, 'f5');
  await expect(page.locator('.history li')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByText(/no longer legal and was cancelled/i)).toBeAttached();
});

test('promotes a pawn with a touch-friendly chooser', async ({ page }) => {
  await seedGame(page, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'white');
  await clickPiece(page, 'piece.white.pawn');
  await expect(page.locator('square.selected')).toHaveCount(1);
  await clickSquare(page, 'a8');
  await expect(page.getByRole('dialog', { name: 'Choose promotion' })).toBeVisible();
  await page.getByRole('button', { name: /Queen/ }).click();
  await expect(page.locator('piece.white.queen')).toBeAttached();
});

test('completes a checkmate flow from a restored position', async ({ page }) => {
  await seedGame(page, '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', 'white');
  await dragPieceTo(page, 'piece.white.queen', 'g7');
  await expect(page.getByText(/wins by checkmate/i).first()).toBeVisible();

  await page.getByRole('button', { name: 'New game' }).first().click();
  await startGame(page, 'White', 'Casual');
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  await expect(page.locator('.history')).toContainText('e4');
});

test('keeps the board primary on a mobile viewport', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Mobile layout check');
  await startGame(page, 'White', 'Beginner');
  const board = await page.locator('.board-frame').boundingBox();
  const viewport = page.viewportSize();
  expect(board).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(board!.width).toBeGreaterThan(viewport!.width * 0.85);
  await expect(page.getByRole('button', { name: 'New game' }).first()).toBeVisible();
});

async function startGame(page: Page, color: 'White' | 'Black', difficulty: string) {
  await page.getByRole('button', { name: color, exact: true }).click();
  await page.locator('#new-difficulty').selectOption(difficulty.toLowerCase());
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
  const board = await page.locator('cg-board').boundingBox();
  if (!board) {
    throw new Error('Chessboard is not visible.');
  }
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return {
    x: board.x + ((file + 0.5) * board.width) / 8,
    y: board.y + ((8 - rank + 0.5) * board.height) / 8,
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
          schemaVersion: 1,
          gameId: crypto.randomUUID(),
          pgn: storedPgn,
          fen: storedFen,
          moves: [],
          playerColor: color,
          orientation: color,
          difficulty: 'casual',
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
  await expect(page.getByText('Previous game restored')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({
    timeout: 20_000,
  });
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
