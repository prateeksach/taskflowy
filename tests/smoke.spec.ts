import { expect, test } from '@playwright/test';

test('loads seed data, edits, completes, indents, zooms, and uses cache offline', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByDisplayValue('Welcome to your local outliner')).toBeVisible();
  const today = page.getByDisplayValue('Today');
  await today.focus();
  await today.press('Enter');
  const blank = page.locator('input[placeholder="Untitled"]').last();
  await blank.fill(`Smoke test ${Date.now()}`);
  await blank.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await expect(blank).toHaveClass(/completed/);
  await blank.press('Shift+Tab');
  await page.getByLabel(/Zoom Today/).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Offline — viewing cached copy/)).toBeVisible();
  await expect(page.getByDisplayValue('Today')).toBeDisabled();
  await context.setOffline(false);
});
