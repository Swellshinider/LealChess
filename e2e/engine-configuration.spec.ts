import { expect, test } from '@playwright/test';

test('persists the Lite game-review profile and keeps the board selector synchronized', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Configure Game review engine' }).click();
  const settings = page.getByRole('dialog', { name: 'Game review' });
  await settings.getByRole('radio', { name: /Stockfish 18 Lite/ }).click();
  const sliders = settings.locator('input[type="range"]');
  await sliders.nth(0).fill('18');
  await sliders.nth(1).fill('4');
  await expect
    .poll(() => storedAnalysisProfile(page, 'game-review'))
    .toEqual({
      engineId: 'stockfish-18-lite',
      depth: 18,
      lines: 4,
    });
  await page.getByRole('button', { name: 'Close engine settings' }).click();

  await page.reload();
  await expect(page.getByRole('group', { name: 'Game review' })).toContainText(
    'Lite · D18 · 4 lines',
  );
});

async function storedAnalysisProfile(page: import('@playwright/test').Page, workflow: string) {
  return page.evaluate(async (profileWorkflow) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('leal-chess');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('state', 'readonly');
    const request = transaction.objectStore('state').get('analysis-settings');
    const record = await new Promise<
      { value?: { profiles?: Record<string, unknown> } } | undefined
    >((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return record?.value?.profiles?.[profileWorkflow];
  }, workflow);
}

test('deduplicates the shared Lite inventory across workflow dialogs', async ({ page }) => {
  await page.route('**/assets/stockfish/stockfish-18-lite-single.*', async (route) => {
    await route.fulfill({ body: 'fake', status: 200 });
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Configure Explorer engine' }).click();
  const dialog = page.getByRole('dialog', { name: 'Explorer' });
  await dialog.getByRole('button', { name: 'Download' }).last().click();
  await expect(dialog.getByRole('button', { name: 'Remove' }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Close engine settings' }).click();

  await page.getByRole('button', { name: 'Configure Practice engine' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Practice' }).getByRole('button', { name: 'Remove' }).last(),
  ).toBeVisible();
});
