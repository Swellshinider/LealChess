import { expect, test } from '@playwright/test';

const responsivenessViewports = [
  { width: 320, height: 568 },
  { width: 820, height: 1180 },
  { width: 1024, height: 600 },
  { width: 1280, height: 720 },
] as const;

const publicWorkspaceRoutes = [
  '/',
  '/play',
  '/settings',
  '/learn',
  '/explorer',
  '/about',
  '/not-a-route',
] as const;

test('keeps every route shell within the supported viewport widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Responsive route-shell regression suite');

  for (const viewport of responsivenessViewports) {
    await page.setViewportSize(viewport);

    for (const route of publicWorkspaceRoutes) {
      await page.goto(route);
      await expectDocumentNotToOverflowHorizontally(page);
    }

    await page.goto('/about');
    const finalAboutLink = page.getByRole('link', { name: 'Report a security issue privately' });
    await finalAboutLink.scrollIntoViewIfNeeded();
    await expect(finalAboutLink).toBeVisible();

    await page.goto('/settings');
    await page.getByRole('button', { name: 'How storage usage is calculated' }).focus();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect.poll(() => elementFitsViewportHorizontally(tooltip)).toBe(true);
  }
});

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
  await expect(brandCopy).toHaveText('LealChess');
  await expect(navigation).not.toContainText('Play. Study. Improve.');
  await expect(page.getByRole('button', { name: 'Collapse navigation' })).toBeVisible();
  await expect.poll(async () => (await navigation.boundingBox())!.width).toBe(256);

  const expandedBrand = (await navigation.locator('.brand').boundingBox())!;
  const expandedBrandBlock = (await navigation.locator('.brand-block').boundingBox())!;
  const collapseButton = (await page
    .getByRole('button', { name: 'Collapse navigation' })
    .boundingBox())!;
  expect(rectanglesOverlap(expandedBrand, collapseButton)).toBe(false);
  expectHandleToStraddleBrandCorner(collapseButton, expandedBrandBlock);

  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  await expect.poll(async () => (await navigation.boundingBox())!.width).toBe(72);
  await expect(logo).toBeVisible();
  await expect(brandCopy).toBeHidden();

  const brandBlock = (await navigation.locator('.brand-block').boundingBox())!;
  const collapsedLogo = (await logo.boundingBox())!;
  const expandButton = (await page
    .getByRole('button', { name: 'Expand navigation' })
    .boundingBox())!;
  expect(rectanglesOverlap(collapsedLogo, expandButton)).toBe(false);
  expectHandleToStraddleBrandCorner(expandButton, brandBlock);

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
  await expect(drawer).not.toContainText('Play. Study. Improve.');

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

  const wideViewports = [
    { width: 1648, height: 828, minimumDeskWidth: 520 },
    { width: 2048, height: 941, minimumDeskWidth: 620 },
  ];

  for (const viewport of wideViewports) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const boardFrame = document
        .querySelector<HTMLElement>('app-chess-board .board-frame')!
        .getBoundingClientRect();
      const frame = document.querySelector<HTMLElement>('.app-frame')!;
      const sidebar = document.querySelector<HTMLElement>('.game-panel')!.getBoundingClientRect();
      return {
        boardHeight: boardFrame.height,
        boardRight: boardFrame.right,
        boardWidth: boardFrame.width,
        frameClientHeight: frame.clientHeight,
        frameScrollHeight: frame.scrollHeight,
        sidebarLeft: sidebar.left,
        sidebarWidth: sidebar.width,
      };
    });

    expect(Math.abs(geometry.boardWidth - geometry.boardHeight)).toBeLessThanOrEqual(1);
    expect(geometry.boardHeight).toBeGreaterThanOrEqual(viewport.height * 0.86);
    expect(geometry.frameScrollHeight).toBeLessThanOrEqual(geometry.frameClientHeight + 1);
    expect(geometry.sidebarWidth).toBeGreaterThanOrEqual(viewport.minimumDeskWidth);
    expect(geometry.sidebarWidth).toBeLessThanOrEqual(641);
    expect(geometry.sidebarLeft - geometry.boardRight).toBeGreaterThanOrEqual(13);
    expect(geometry.sidebarLeft - geometry.boardRight).toBeLessThanOrEqual(27);
  }
});

test('launches each workspace and provides project information', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'LealChess' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Play/ })).toHaveAttribute('href', '/play');
  await expect(page.getByRole('link', { name: /Learn/ })).toHaveAttribute('href', '/learn');
  await expect(page.getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/settings');

  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'About LealChess' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why LealChess' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Our Mission' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'We Are Open Source' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Issues and Contributions' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Report a security issue privately' }),
  ).toHaveAttribute('href', 'https://github.com/Swellshinider/LealChess/security/advisories/new');

  await page.goto('/help');
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading', { name: 'About LealChess' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View the source on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/Swellshinider/LealChess',
  );

  if (testInfo.project.name.includes('mobile')) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toContainText(
      'Version v0.6.0',
    );
  } else {
    await expect(page.locator('#primary-navigation .version-label')).toContainText(
      'Version v0.6.0',
    );
  }
});

test('uses the shared readable typography scale across pages and controls', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Computed typography smoke test');

  await page.goto('/');
  await expectTypographyTokens(page);
  await expectFontSizeAtLeast(page.locator('.search-summary'), 16);
  await expectFontSizeAtLeast(page.locator('.kicker'), 13);
  await expectFontSizeAtLeast(page.locator('nav small').first(), 13);

  await page.goto('/settings');
  await expectFontSizeAtLeast(page.locator('#primary-navigation .route-links a').first(), 14);
  await expectFontSizeAtLeast(page.locator('form label').first(), 14);
  await expectFontSizeAtLeast(page.locator('.form-help'), 14);

  await page.goto('/play');
  const setupDialog = page.getByRole('dialog', { name: 'Choose your side' });
  await expectFontSizeAtLeast(setupDialog.locator('.kicker'), 13);
  await expectFontSizeAtLeast(setupDialog.locator('.intro'), 16);
  await expectFontSizeAtLeast(setupDialog.locator('label'), 14);
  await expectFontSizeAtLeast(setupDialog.locator('.color-options button').first(), 14);
});

test('publishes indexable metadata only for public pages', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('LealChess | Local Chess Analysis & Training');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /Play Stockfish, import Chess\.com and Lichess games/,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://lealchess.com/',
  );
  expect(await page.locator('#lealchess-structured-data').textContent()).toContain(
    'WebApplication',
  );

  await page.goto('/about');
  await expect(page).toHaveTitle('About LealChess | Local-First Chess Training');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://lealchess.com/about',
  );
  await expect(page.locator('#lealchess-structured-data')).toHaveCount(0);

  await page.goto('/play');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain('Sitemap: https://lealchess.com/sitemap.xml');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain('<loc>https://lealchess.com/about</loc>');
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

async function expectDocumentNotToOverflowHorizontally(page: import('@playwright/test').Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scrollingElement = document.scrollingElement!;
        return scrollingElement.scrollWidth <= scrollingElement.clientWidth + 1;
      }),
    )
    .toBe(true);
}

async function elementFitsViewportHorizontally(locator: import('@playwright/test').Locator) {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= window.innerWidth;
  });
}

function rectanglesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

function expectHandleToStraddleBrandCorner(
  handle: { x: number; y: number; width: number; height: number },
  brandBlock: { x: number; y: number; width: number; height: number },
) {
  expect(
    Math.abs(handle.x + handle.width / 2 - (brandBlock.x + brandBlock.width)),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(handle.y + handle.height / 2 - (brandBlock.y + brandBlock.height)),
  ).toBeLessThanOrEqual(2);
}

async function expectTypographyTokens(page: import('@playwright/test').Page) {
  const tokens = await page.locator('html').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      micro: style.getPropertyValue('--type-micro').trim(),
      caption: style.getPropertyValue('--type-caption').trim(),
      small: style.getPropertyValue('--type-small').trim(),
      body: style.getPropertyValue('--type-body').trim(),
    };
  });

  expect(tokens).toEqual({
    micro: '0.75rem',
    caption: '0.8125rem',
    small: '0.875rem',
    body: '1rem',
  });
}

async function expectFontSizeAtLeast(
  locator: import('@playwright/test').Locator,
  minimumPixels: number,
) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() => locator.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)))
    .toBeGreaterThanOrEqual(minimumPixels);
}
