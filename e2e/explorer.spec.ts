import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const pgn = `[Event "Explorer test"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *`;

test('imports and restores a PGN, then exposes the full position editor', async ({ page }) => {
  await page.goto('/explorer');

  await expect(page.getByRole('heading', { name: 'Explorer', exact: true })).toBeAttached();
  await expect(page.getByRole('img', { name: /Analysis chessboard/ })).toBeVisible();
  await expect(page.locator('.explorer-board cg-board')).toHaveCSS(
    'background-image',
    /rgb\(82, 122, 120\).*rgb\(200, 213, 207\)/,
  );
  await expect(page.locator('.explorer-board coords.files coord').nth(0)).toHaveCSS(
    'color',
    'rgb(255, 255, 255)',
  );
  await expect(page.locator('.explorer-board coords.files coord').nth(1)).toHaveCSS(
    'color',
    'rgb(23, 36, 44)',
  );
  await expect(page.locator('.explorer-board-frame')).toHaveCSS('border-top-style', 'none');
  await expect(page.locator('.analysis-ledger')).toHaveCSS('border-top-style', 'none');
  await page.getByRole('button', { name: 'Import FEN or PGN' }).click();
  await page.getByRole('tab', { name: 'PGN' }).click();
  await page.getByLabel('Paste a standard PGN').fill(pgn);
  await page.getByRole('button', { name: 'Analyze game' }).click();

  await expect(page.locator('.move-node')).toHaveCount(4);
  await expect(page.getByRole('progressbar', { name: 'PGN analysis progress' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('.move-node')).toHaveCount(4);

  await page.getByRole('button', { name: 'Set up position' }).click();
  await expect(page.getByRole('heading', { name: 'Position setup' })).toBeVisible();
  await expect(page.getByLabel('Side to move')).toHaveValue('w');
  await page.getByRole('button', { name: 'Clear board' }).click();
  await expect(page.getByRole('button', { name: 'Analyze position' })).toBeDisabled();
  await page.getByRole('button', { name: 'Starting position' }).click();
  await expect(page.getByRole('button', { name: 'Analyze position' })).toBeEnabled();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
});

test('grades a manual board move and displays ranked engine lines', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Real Stockfish smoke test');
  test.setTimeout(90_000);
  await page.goto('/explorer');

  await movePiece(page, 'e2', 'e4');

  await expect(page.locator('.move-node[data-classification]')).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.locator('.candidate-lines li')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('.explorer-board svg.cg-shapes line')).toHaveCount(3);

  const board = await page.locator('.explorer-board').boundingBox();
  const evaluationTrack = await page.locator('.evaluation-track').boundingBox();
  expect(board).not.toBeNull();
  expect(evaluationTrack).not.toBeNull();
  expect(Math.abs(board!.height - evaluationTrack!.height)).toBeLessThanOrEqual(1);
  expect(evaluationTrack!.width).toBeGreaterThanOrEqual(27);
  await expect(page.locator('.rail-side')).toHaveCount(0);
  const navigation = await page.locator('.position-navigation').boundingBox();
  expect(navigation).not.toBeNull();
  expect(Math.abs(board!.width - navigation!.width)).toBeLessThanOrEqual(1);
  const scoreBeforeFlip = await page.locator('.evaluation-score').getAttribute('class');
  expect(scoreBeforeFlip).toMatch(/\b(top|bottom)\b/);

  await page.getByRole('button', { name: 'Flip board' }).click();
  await expect(page.locator('.evaluation-track')).toHaveClass(/flipped/);
  const scoreAfterFlip = await page.locator('.evaluation-score').getAttribute('class');
  expect(scoreAfterFlip).toMatch(/\b(top|bottom)\b/);
  expect(scoreAfterFlip?.includes('top')).not.toBe(scoreBeforeFlip?.includes('top'));

  const geometry = await page.evaluate(() => {
    const documentRoot = document.scrollingElement!;
    const explorer = document.querySelector<HTMLElement>('.explorer-page')!;
    return {
      documentHeight: documentRoot.scrollHeight,
      documentClientHeight: documentRoot.clientHeight,
      explorerHeight: explorer.scrollHeight,
      explorerClientHeight: explorer.clientHeight,
    };
  });
  expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.documentClientHeight + 1);
  expect(geometry.explorerHeight).toBeLessThanOrEqual(geometry.explorerClientHeight + 1);
});

async function movePiece(page: Page, from: string, to: string): Promise<void> {
  const boardLocator = page.locator('.explorer-board');
  await expect(boardLocator).toBeVisible();
  await boardLocator.scrollIntoViewIfNeeded();
  const board = await boardLocator.boundingBox();
  if (!board) throw new Error('Explorer board is not visible.');
  const point = (square: string) => ({
    x: board.x + ((square.charCodeAt(0) - 97 + 0.5) * board.width) / 8,
    y: board.y + ((8 - Number(square[1]) + 0.5) * board.height) / 8,
  });
  const origin = point(from);
  const destination = point(to);
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 10 });
  await page.mouse.up();
}
