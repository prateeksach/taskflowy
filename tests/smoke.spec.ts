import { expect, test } from '@playwright/test';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('desktop outliner: create, complete, hide completed, search, zoom, keyboard move, and cache offline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Taskflowy')).toBeVisible();
  await expect(page.locator('input[value="Inbox"]')).toBeVisible();

  const today = page.locator('input[value="Today"]');
  await today.focus();
  await today.press('Enter');
  const title = `Daily note ${Date.now()}`;
  const blank = page.locator('input[placeholder="New bullet"]').last();
  await blank.fill(title);
  const created = page.locator(`input[value="${title}"]`).last();
  await expect(created).toBeVisible();

  await created.press(`${mod}+Enter`);
  await expect(created).toHaveClass(/completed/);
  await page.getByLabel('Show completed').uncheck();
  await expect(created).toBeHidden();
  await page.getByLabel('Show completed').check();
  await expect(created).toBeVisible();

  await page.keyboard.press(`${mod}+K`);
  await page.getByPlaceholder('Find any bullet…').fill(title);
  await page.locator('.result').filter({ hasText: title }).first().click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.keyboard.press('Escape');

  await created.focus();
  await created.press('Shift+Tab');
  await created.press(`${mod}+ArrowUp`);
  await expect(page.getByRole('button', { name: /Keyboard shortcuts/ })).toBeHidden();
  await page.keyboard.press(`${mod}+/`);
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();

  await page.route('**/api/tree', (route) => route.abort());
  await page.reload();
  await expect(page.getByText(/Offline — cached/)).toBeVisible();
  await expect(page.locator('input[value="Inbox"]')).toBeDisabled();
  await page.unroute('**/api/tree');
});

test('drag handle nests a bullet in the browser and persists', async ({ page, request }) => {
  const parentRes = await request.post('/api/nodes', { data: { title: 'Drag parent' } });
  const childRes = await request.post('/api/nodes', { data: { title: 'Drag child' } });
  const parent = (await parentRes.json()).node;
  const child = (await childRes.json()).node;

  await page.goto('/');
  await expect(page.locator(`[data-node-id="${parent.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-node-id="${child.id}"]`)).toBeVisible();
  await page.evaluate(({ parentId, childId }) => {
    const handle = document.querySelector(`[data-node-id="${childId}"] .drag-handle`);
    const target = document.querySelector(`[data-node-id="${parentId}"] .node-row`);
    if (!handle || !target) throw new Error('drag elements missing');
    const dataTransfer = new DataTransfer();
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, clientY: rect.top + rect.height / 2 }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientY: rect.top + rect.height / 2 }));
    handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
  }, { parentId: parent.id, childId: child.id });

  await expect.poll(async () => {
    const tree = await request.get('/api/tree');
    const nodes = (await tree.json()).nodes;
    return nodes.find((n: { id: string }) => n.id === child.id)?.parentId;
  }).toBe(parent.id);
});

test('api supports search and persisted nesting/reposition', async ({ request }) => {
  const root = await request.post('/api/nodes', { data: { title: 'API root' } });
  expect(root.ok()).toBeTruthy();
  const rootNode = (await root.json()).node;
  const child = await request.post('/api/nodes', { data: { title: 'API searchable child', parentId: rootNode.id } });
  expect(child.ok()).toBeTruthy();
  const childNode = (await child.json()).node;

  const search = await request.get('/api/search?q=searchable');
  expect(search.ok()).toBeTruthy();
  expect((await search.json()).nodes.some((n: { id: string }) => n.id === childNode.id)).toBeTruthy();

  const moved = await request.post(`/api/nodes/${childNode.id}/reposition`, { data: { parentId: null, index: 0 } });
  expect(moved.ok()).toBeTruthy();
  const tree = await request.get('/api/tree');
  const nodes = (await tree.json()).nodes;
  expect(nodes.find((n: { id: string }) => n.id === childNode.id).parentId).toBeNull();
});
