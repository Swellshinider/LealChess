import { expect, test } from '@playwright/test';

test('collapses the desktop panel, preserves the choice, and navigates between workspaces', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Desktop navigation behavior');
  await page.goto('/learn');

  const navigation = page.locator('#primary-navigation');
  await expect(page.getByRole('button', { name: 'Collapse navigation' })).toBeVisible();
  await expect.poll(async () => (await navigation.boundingBox())!.width).toBeGreaterThan(200);

  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  await expect.poll(async () => (await navigation.boundingBox())!.width).toBeLessThan(100);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'Play' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Choose your side' })).toBeVisible();
});

test('opens an accessible mobile drawer and restores focus after Escape', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Mobile navigation behavior');
  await page.goto('/');

  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Navigation menu' });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings, unavailable' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  await page.keyboard.press('Escape');

  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('adapts Play from a landscape tablet desk to a portrait board-first stack', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Single responsive geometry check');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');

  const board = page.locator('.board-column');
  const controls = page.locator('app-game-sidebar');
  await expect(board).toBeVisible();
  await expect(controls).toBeVisible();
  const landscapeBoard = (await board.boundingBox())!;
  const landscapeControls = (await controls.boundingBox())!;
  expect(landscapeControls.x).toBeGreaterThan(landscapeBoard.x + landscapeBoard.width - 2);

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect
    .poll(async () => {
      const portraitBoard = (await board.boundingBox())!;
      const portraitControls = (await controls.boundingBox())!;
      return portraitControls.y > portraitBoard.y + portraitBoard.height - 2;
    })
    .toBe(true);
});
