import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('walks through the real workspaces and can replay from Settings', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/play$/);

  const tour = page.getByRole('dialog', { name: 'Set the board, then make the first plan' });
  const setup = page.getByRole('dialog', { name: 'Choose your side' });
  await expect(tour).toBeVisible();
  await expect(setup).toBeVisible();
  await expect(page.locator('.target-frame')).toBeVisible();

  const white = setup.getByRole('button', { name: 'White' });
  await white.click();
  await expect(white).toHaveAttribute('aria-pressed', 'true');

  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(
    page.getByRole('dialog', { name: 'Bring your games to the study desk' }),
  ).toBeVisible();
  await page.getByLabel('Chess.com username').fill('Learner');
  await expect.poll(() => storedChessComUsername(page)).toBe('Learner');

  await page
    .getByRole('dialog', { name: 'Bring your games to the study desk' })
    .getByRole('button', {
      name: 'Next',
    })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'See the patterns across your play' }),
  ).toBeVisible();

  await page
    .getByRole('dialog', { name: 'See the patterns across your play' })
    .getByRole('button', {
      name: 'Next',
    })
    .click();
  await expect(page.getByRole('dialog', { name: 'Turn each game into a lesson' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review your games' })).toBeVisible();

  await page
    .getByRole('dialog', { name: 'Turn each game into a lesson' })
    .getByRole('button', {
      name: 'Next',
    })
    .click();
  await expect(page).toHaveURL(/\/explorer$/);
  const explorerTour = page.getByRole('dialog', { name: 'Follow the position beyond the game' });
  await expect(explorerTour).toBeVisible();
  await expect(page.getByRole('img', { name: /Analysis chessboard/ })).toBeVisible();

  await explorerTour.getByRole('button', { name: 'Finish on Learn' }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByRole('dialog', { name: /./ })).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole('dialog', { name: 'Set the board, then make the first plan' }),
  ).toHaveCount(0);

  await page.goto('/learn');
  await expect(page.getByLabel('Chess.com username')).toHaveValue('Learner');
  await page.goto('/settings');
  const replay = page.getByRole('button', { name: 'Replay onboarding' });
  await replay.click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(
    page.getByRole('dialog', { name: 'Set the board, then make the first plan' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Set the board, then make the first plan' }),
  ).toHaveCount(0);
});

async function storedChessComUsername(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('leal-chess');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('state', 'readonly');
    const request = transaction.objectStore('state').get('import-preferences');
    const record = await new Promise<{ value?: { chessComUsername?: string } } | undefined>(
      (resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    database.close();
    return record?.value?.chessComUsername ?? '';
  });
}

test('does not interrupt a first-time direct link', async ({ page }) => {
  await page.goto('/learn');

  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByRole('heading', { name: 'Learn and Improve' })).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Set the board, then make the first plan' }),
  ).toHaveCount(0);
});

test('skips once and uses a bottom-sheet coachmark on mobile', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Mobile onboarding behavior');
  await page.goto('/');

  const tour = page.getByRole('dialog', { name: 'Set the board, then make the first plan' });
  await expect(tour).toHaveAttribute('data-placement', 'mobile');
  const bounds = await tour.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height);

  await tour.getByRole('button', { name: 'Skip tour' }).click();
  await page.goto('/');
  await expect(tour).toHaveCount(0);
});
