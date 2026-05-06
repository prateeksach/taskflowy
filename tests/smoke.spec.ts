import { expect, test } from '@playwright/test';

test('loads seed data, edits, completes, indents, zooms, and uses cache offline', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('input[value="Welcome to your local outliner"]')).toBeVisible();
  const today = page.locator('input[value="Today"]');
  await today.focus();
  await today.press('Enter');
  const title = `Smoke test ${Date.now()}`;
  const blank = page.locator('input[placeholder="Untitled"]').last();
  await blank.fill(title);
  const created = page.locator(`input[value="${title}"]`).last();
  await expect(created).toBeVisible();
  await created.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await expect(created).toHaveClass(/completed/);
  await created.press('Shift+Tab');
  await page.getByLabel(/Zoom Today/).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  await page.route('**/api/tree', (route) => route.abort());
  await page.reload();
  await expect(page.getByText(/Offline — viewing cached copy/)).toBeVisible();
  await expect(page.locator('input[value="Today"]')).toBeDisabled();
  await page.unroute('**/api/tree');
});
