import { expect, test } from '@playwright/test';

test('collapses the desktop panel, preserves the choice, and navigates between workspaces', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Desktop navigation behavior');
  await page.goto('/learn');

  const navigation = page.locator('#primary-navigation');
  const brandCopy = navigation.locator('.brand-copy');
  const logo = navigation.locator('.brand-logo');
  const playLink = navigation.getByRole('link', { name: 'Play' });
  await expect(page.getByRole('heading', { name: 'Learn and Improve' })).toBeVisible();
  await expect(logo).toBeVisible();
  await expect(brandCopy).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse navigation' })).toBeVisible();
  await expect.poll(async () => (await navigation.boundingBox())!.width).toBeGreaterThan(200);

  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  await expect.poll(async () => (await navigation.boundingBox())!.width).toBeLessThan(100);
  await expect(logo).toBeVisible();
  await expect(brandCopy).toBeHidden();

  const brandBlock = (await navigation.locator('.brand-block').boundingBox())!;
  const expandButton = (await page
    .getByRole('button', { name: 'Expand navigation' })
    .boundingBox())!;
  expect(expandButton.y).toBeGreaterThanOrEqual(brandBlock.y);
  expect(expandButton.y + expandButton.height).toBeLessThanOrEqual(
    brandBlock.y + brandBlock.height,
  );
  expect(
    Math.abs(expandButton.x + expandButton.width / 2 - (brandBlock.x + brandBlock.width / 2)),
  ).toBeLessThanOrEqual(2);

  await playLink.hover();
  await expect
    .poll(() => playLink.evaluate((element) => getComputedStyle(element, '::after').opacity))
    .toBe('1');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'Play' }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole('heading', { name: 'Choose your side' })).toBeVisible();
});

test('opens an accessible mobile drawer and restores focus after Escape', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Mobile navigation behavior');
  await page.goto('/play');

  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Navigation menu' });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('adapts Play from a landscape tablet desk to a portrait board-first stack', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Single responsive geometry check');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/play');

  const board = page.locator('.board-column');
  const controls = page.locator('app-game-sidebar');
  await expect(board).toBeVisible();
  await expect(controls).toBeVisible();
  const landscapeBoard = (await board.boundingBox())!;
  const landscapeControls = (await controls.boundingBox())!;
  expect(landscapeControls.x).toBeGreaterThan(landscapeBoard.x + landscapeBoard.width - 2);
  await expectWorkspaceToFitViewport(page);

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect
    .poll(async () => {
      const portraitBoard = (await board.boundingBox())!;
      const portraitControls = (await controls.boundingBox())!;
      return portraitControls.y > portraitBoard.y + portraitBoard.height - 2;
    })
    .toBe(true);
});

test('launches each workspace from the landing page and redirects unknown routes home', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'LealChess' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Play/ })).toHaveAttribute('href', '/play');
  await expect(page.getByRole('link', { name: /Learn/ })).toHaveAttribute('href', '/learn');
  await expect(page.getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/settings');

  await page.goto('/not-a-route');
  await expect(page).toHaveURL(/\/$/);
});

test('previews and persists board preferences, then clears LealChess data', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel(/Mute sounds/)).not.toBeChecked();
  await expect(page.getByLabel(/Move classifications/)).not.toBeChecked();

  await page.getByLabel(/Move classifications/).check();
  await clickSettingsSquare(page, 'e2');
  await expect(page.locator('square.move-dest')).toHaveCount(2);
  await clickSettingsSquare(page, 'e4');
  await expect(page.getByText('Black to move', { exact: true })).toBeVisible();
  await expect(page.locator('.preview-classification')).toHaveText('Good');
  await expect
    .poll(() =>
      page.locator('.preview-classification').evaluate((badge) => {
        const board = badge.closest('.preview-board')!.getBoundingClientRect();
        const bounds = badge.getBoundingClientRect();
        const zIndex = Number(getComputedStyle(badge).zIndex);
        return (
          zIndex > 2 &&
          bounds.left >= board.left &&
          bounds.top >= board.top &&
          bounds.right <= board.right &&
          bounds.bottom <= board.bottom
        );
      }),
    )
    .toBe(true);

  await clickSettingsSquare(page, 'e7');
  await clickSettingsSquare(page, 'e5');
  await expect(page.getByText('White to move', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Reset board' }).click();
  await expect(page.locator('.preview-classification')).toHaveCount(0);
  await expect(page.locator('square.last-move')).toHaveCount(0);
  await page.getByLabel('Board palette').selectOption('rosewood');
  await expect(page.locator('.preview-board')).toHaveAttribute('data-board-theme', 'rosewood');
  await page.reload();
  await expect(page.getByLabel(/Move classifications/)).toBeChecked();
  await expect(page.getByLabel('Board palette')).toHaveValue('rosewood');

  await page.getByRole('button', { name: 'Clear all data' }).first().click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Clear all data' }).last().click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/settings');
  await expect(page.getByLabel(/Move classifications/)).not.toBeChecked();
  await expect(page.getByLabel('Board palette')).toHaveValue('tournament');
});

async function clickSettingsSquare(page: import('@playwright/test').Page, square: string) {
  const boardLocator = page.locator('.preview-board cg-board');
  await boardLocator.scrollIntoViewIfNeeded();
  const board = await boardLocator.boundingBox();
  if (!board) {
    throw new Error('Settings preview board is not visible.');
  }
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  await page.mouse.click(
    board.x + ((file + 0.5) * board.width) / 8,
    board.y + ((8 - rank + 0.5) * board.height) / 8,
  );
}

async function expectWorkspaceToFitViewport(page: import('@playwright/test').Page) {
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
