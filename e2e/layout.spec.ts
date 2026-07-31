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

test('launches each workspace and provides project information', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'LealChess' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Play/ })).toHaveAttribute('href', '/play');
  await expect(page.getByRole('link', { name: /Learn/ })).toHaveAttribute('href', '/learn');
  await expect(page.getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/settings');

  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Private report' })).toHaveAttribute(
    'href',
    'https://github.com/Swellshinider/LealChess/security/advisories/new',
  );

  await page.goto('/help');
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await expect(page.getByText('v0.5.0', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Swellshinider/LealChess' })).toHaveAttribute(
    'href',
    'https://github.com/Swellshinider/LealChess',
  );
});

test('keeps unknown routes visible and offers a route home', async ({ page }) => {
  await page.goto('/not-a-route');
  await expect(page).toHaveURL(/\/not-a-route$/);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'LealChess' })).toBeVisible();
});

test('previews and persists board preferences, then clears LealChess data', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('LealChess storage used', { exact: true })).toBeVisible();
  await expect(page.getByTestId('storage-usage-value')).toHaveText(/\d+(?:\.\d+)? (?:B|KB|MB|GB)/);
  await page.evaluate(() => {
    localStorage.setItem(
      'lealchess.stockfish.downloads',
      JSON.stringify(['stockfish-18-single@18.0.8']),
    );
  });
  await page.reload();
  await expect(page.getByTestId('storage-usage-value')).toContainText('107.8 MB');
  await expect(page.getByLabel(/Mute sounds/)).not.toBeChecked();
  const soundVolume = page.getByLabel('Sound volume');
  const soundVolumeTrack = soundVolume.locator('xpath=..');
  await expect(soundVolume).toHaveValue('100');
  await expect(soundVolumeTrack).toHaveCSS('--sound-volume', '100%');
  const soundVolumeBounds = await soundVolume.boundingBox();
  await soundVolume.fill('0');
  await expect(soundVolumeTrack).toHaveCSS('--sound-volume', '0%');
  await expect
    .poll(async () => {
      const bounds = await soundVolume.boundingBox();
      return bounds ? { x: bounds.x, width: bounds.width } : null;
    })
    .toEqual(soundVolumeBounds ? { x: soundVolumeBounds.x, width: soundVolumeBounds.width } : null);
  await soundVolume.fill('100');
  await expect(soundVolumeTrack).toHaveCSS('--sound-volume', '100%');
  await soundVolume.fill('35');
  await expect(page.getByText('35%', { exact: true })).toBeVisible();

  await clickSettingsSquare(page, 'e2');
  await expect(page.locator('square.move-dest')).toHaveCount(2);
  await clickSettingsSquare(page, 'e4');
  await expect(page.getByText('Black to move', { exact: true })).toBeVisible();

  await clickSettingsSquare(page, 'e7');
  await clickSettingsSquare(page, 'e5');
  await expect(page.getByText('White to move', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Reset board' }).click();
  await expect(page.locator('square.last-move')).toHaveCount(0);
  await page.getByLabel('Board palette').selectOption('rosewood');
  await expect(page.locator('.preview-board')).toHaveAttribute('data-board-theme', 'rosewood');
  await page.reload();
  await expect(page.getByLabel('Board palette')).toHaveValue('rosewood');
  await expect(page.getByLabel('Sound volume')).toHaveValue('35');

  await page.getByRole('button', { name: 'How storage usage is calculated' }).focus();
  await expect(page.getByRole('tooltip')).toContainText('saved games, preferences, profiles');
  await expect(page.getByRole('tooltip')).toContainText(
    'Stockfish engines loaded since LealChess data was last cleared',
  );
  await page.getByRole('button', { name: 'Clear all data' }).first().click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Clear all data' }).last().click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/settings');
  await expect(page.getByLabel('Board palette')).toHaveValue('tournament');
  await expect(page.getByLabel('Sound volume')).toHaveValue('100');
  await expect(page.getByTestId('storage-usage-value')).toHaveText(/\s*\d+ B\s*/);
  expect(
    await page.evaluate(() => localStorage.getItem('lealchess.stockfish.downloads')),
  ).toBeNull();
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
  const x = board.x + ((file + 0.5) * board.width) / 8;
  const y = board.y + ((8 - rank + 0.5) * board.height) / 8;
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (hasTouch) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
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
