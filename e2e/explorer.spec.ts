import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const pgn = `[Event "Explorer test"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *`;

test('persists a custom navigation shortcut from Settings', async ({ page }) => {
  await page.goto('/settings');
  const previousShortcut = page.getByRole('button', {
    name: /Change Previous move shortcut/,
  });
  await previousShortcut.click();
  await previousShortcut.press('p');
  await expect(previousShortcut).toHaveAccessibleName(/currently P$/);

  await page.reload();
  await expect(
    page.getByRole('button', { name: /Change Previous move shortcut, currently P$/ }),
  ).toBeVisible();
  await page.goto('/explorer');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('tab', { name: 'PGN' }).click();
  await page.getByLabel('Paste a standard PGN').fill(pgn);
  await page.getByRole('button', { name: 'Analyze game' }).click();

  await expect(page.locator('app-explorer-move-score button.current')).toContainText('Nc6');
  await page.evaluate(() =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true })),
  );
  await expect(page.locator('app-explorer-move-score button.current')).toContainText('Nf3');
});

test('imports and restores a PGN, then exposes the full position editor', async ({
  page,
}, testInfo) => {
  await page.goto('/explorer');

  await expect(page.getByRole('heading', { name: 'Explorer', exact: true })).toBeAttached();
  await expect(page.getByRole('img', { name: /Analysis chessboard/ })).toBeVisible();
  const flipBoard = page.locator('.board-heading').getByRole('button', { name: 'Flip board' });
  await expect(flipBoard).toBeVisible();
  await expectFlipControlAtBoardTopRight(page, '.explorer-board');
  await expect(page.locator('.explorer-board')).toHaveClass(/orientation-white/);
  await flipBoard.click();
  await expect(page.locator('.explorer-board')).toHaveClass(/orientation-black/);
  await flipBoard.click();
  await expect(page.locator('.explorer-board')).toHaveClass(/orientation-white/);
  if (testInfo.project.name === 'chromium') {
    // Exact computed-style equality is rendering-engine-sensitive and adds no
    // cross-browser signal beyond the orientation-class contract asserted above;
    // see src/app/core/game/board-themes.spec.ts for the unit-level coverage.
    await expect(page.locator('.explorer-board cg-board')).toHaveCSS(
      'background-image',
      /rgb\(99, 122, 82\).*rgb\(215, 221, 192\)/,
    );
    await expect(page.locator('.explorer-board coords.files coord').nth(0)).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    await expect(page.locator('.explorer-board coords.files coord').nth(1)).toHaveCSS(
      'color',
      'rgb(24, 27, 21)',
    );
  }
  await expect(page.locator('.explorer-board-frame')).toHaveCSS('border-top-style', 'none');
  await expect(page.locator('.analysis-ledger')).toHaveCSS('border-top-style', 'solid');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('tab', { name: 'PGN' }).click();
  await page.getByLabel('Paste a standard PGN').fill(pgn);
  await page.getByRole('button', { name: 'Analyze game' }).click();

  await expect(page.locator('app-explorer-move-score .move')).toHaveCount(4);
  if ((page.viewportSize()?.width ?? 0) > 520) {
    await page.locator('app-explorer-move-score .move').first().focus();
    await expect(page.locator('app-explorer-move-preview .move-preview')).toBeVisible();
    await expect(page.locator('app-explorer-move-preview')).toContainText('e4');
    await page.locator('app-explorer-move-score .move').first().blur();
    await expect(page.locator('app-explorer-move-preview')).toHaveCount(0);
  }
  await expect(page.getByRole('progressbar', { name: 'PGN analysis progress' })).toBeVisible();
  // explorer-page.store.ts debounces the IndexedDB write by 250ms; poll for the
  // persisted node instead of a fixed sleep so reload never races the write.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open('leal-chess');
            request.onsuccess = () => {
              const database = request.result;
              const getRequest = database
                .transaction('explorerSessions')
                .objectStore('explorerSessions')
                .get('active');
              getRequest.onsuccess = () => {
                const session = getRequest.result as
                  { nodes: Record<string, { san?: string }> } | undefined;
                resolve(Object.values(session?.nodes ?? {}).some((node) => node.san === 'Nc6'));
                database.close();
              };
              getRequest.onerror = () => reject(getRequest.error);
            };
            request.onerror = () => reject(request.error);
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.locator('app-explorer-move-score .move')).toHaveCount(4);

  await page.getByRole('button', { name: 'Set up position' }).click();
  await expect(page.getByRole('heading', { name: 'Position setup' })).toBeVisible();
  await expect(flipBoard).toBeVisible();
  await expectFlipControlAtBoardTopRight(page, '.explorer-board');
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

  await expect(page.locator('app-explorer-move-score [data-classification] .move')).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.locator('.candidate-lines li')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('.explorer-board svg.cg-shapes line')).toHaveCount(3);
  const secondCandidate = page.getByRole('button', { name: /Play engine candidate 2:/ });
  await secondCandidate.hover();
  await expect(page.locator('.explorer-board svg.cg-shapes line')).toHaveCount(1);
  await page.locator('.board-heading').hover();
  await expect(page.locator('.explorer-board svg.cg-shapes line')).toHaveCount(3);
  await secondCandidate.focus();
  await expect(page.locator('.explorer-board svg.cg-shapes line')).toHaveCount(1);
  await secondCandidate.blur();
  await expect(page.locator('.explorer-board svg.cg-shapes line')).toHaveCount(3);
  await page.keyboard.press('Space');
  await expect(page.locator('.explorer-board svg.cg-shapes line')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(page.locator('.explorer-board svg.cg-shapes line')).toHaveCount(3);

  const board = await page.locator('.explorer-board').boundingBox();
  const evaluationTrack = await page.locator('.evaluation-track').boundingBox();
  const desk = await page.locator('.analysis-ledger').boundingBox();
  expect(board).not.toBeNull();
  expect(evaluationTrack).not.toBeNull();
  expect(desk).not.toBeNull();
  expect(board!.height).toBeGreaterThan(page.viewportSize()!.height * 0.65);
  expect(desk!.x - (board!.x + board!.width)).toBeLessThanOrEqual(30);
  expect(Math.abs(board!.height - evaluationTrack!.height)).toBeLessThanOrEqual(1);
  expect(evaluationTrack!.width).toBeGreaterThanOrEqual(27);
  await expect(page.locator('.rail-side')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Move navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'First' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Last' })).toBeDisabled();
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

  await secondCandidate.click();
  await expect(page.locator('app-explorer-move-score .move')).toHaveCount(2);
  await page.getByRole('button', { name: 'New analysis' }).click();
  const replacementDialog = page.getByRole('alertdialog', {
    name: 'Replace the current session?',
  });
  await expect(replacementDialog).toBeVisible();
  await replacementDialog.getByRole('button', { name: 'Keep session' }).click();
  await expect(page.locator('app-explorer-move-score .move')).toHaveCount(2);
  await page.getByRole('button', { name: 'New analysis' }).click();
  await replacementDialog.getByRole('button', { name: 'Replace session' }).click();
  await expect(page.locator('app-explorer-move-score .move')).toHaveCount(0);
});

test('stacks the Review-style workspace at the shared mobile breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await page.goto('/explorer');
  const board = await page.locator('.board-workbench').boundingBox();
  const desk = await page.locator('.analysis-ledger').boundingBox();

  expect(board).not.toBeNull();
  expect(desk).not.toBeNull();
  expect(desk!.y).toBeGreaterThan(board!.y + board!.height - 2);
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
});

test('uses the board column and viewport space like the Play board', async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1000 });
  await page.goto('/explorer');
  await expect(page.locator('.explorer-board')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('.explorer-board')!.getBoundingClientRect();
    const workbench = document
      .querySelector<HTMLElement>('.board-workbench')!
      .getBoundingClientRect();
    const pageElement = document.querySelector<HTMLElement>('.explorer-page')!;
    const pageStyles = getComputedStyle(pageElement);
    const verticalLimit =
      innerHeight -
      Number.parseFloat(pageStyles.paddingTop) -
      Number.parseFloat(pageStyles.paddingBottom) -
      68 -
      2;
    return {
      actual: board.width,
      expected: Math.min(1024, workbench.width - 44, verticalLimit),
    };
  });

  expect(Math.abs(geometry.actual - geometry.expected)).toBeLessThanOrEqual(2);
  expect(geometry.actual).toBeGreaterThan(820);
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

async function expectFlipControlAtBoardTopRight(page: Page, boardSelector: string): Promise<void> {
  const control = await page.getByRole('button', { name: 'Flip board' }).boundingBox();
  const board = await page.locator(boardSelector).boundingBox();
  expect(control).not.toBeNull();
  expect(board).not.toBeNull();
  expect(Math.abs(control!.x + control!.width - (board!.x + board!.width))).toBeLessThanOrEqual(5);
  expect(control!.y + control!.height).toBeLessThanOrEqual(board!.y + 1);
}
