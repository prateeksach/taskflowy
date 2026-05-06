import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNode, db, DB_PATH, getNodes, reorder, seedIfEmpty, softDelete, touchUpdate } from './db.js';

seedIfEmpty();

const app = express();
const port = Number(process.env.PORT || 4184);
const host = process.env.HOST || '0.0.0.0';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dbPath: DB_PATH, time: new Date().toISOString() });
});

app.get('/api/tree', (_req, res) => {
  const nodes = getNodes();
  const maxVersion = db.prepare('SELECT MAX(version) AS v FROM nodes').get().v ?? 0;
  const updatedAt = db.prepare('SELECT MAX(updated_at) AS u FROM nodes').get().u ?? null;
  res.json({ nodes, version: maxVersion, updatedAt, serverTime: new Date().toISOString() });
});

app.post('/api/nodes', (req, res) => {
  const node = createNode({ parentId: req.body.parentId ?? null, afterId: req.body.afterId ?? null, title: req.body.title ?? '' });
  res.status(201).json({ node });
});

app.patch('/api/nodes/:id', (req, res) => {
  const input = {};
  if ('title' in req.body) input.title = String(req.body.title);
  if ('completed' in req.body) input.completed = !!req.body.completed;
  if ('collapsed' in req.body) input.collapsed = !!req.body.collapsed;
  if ('parentId' in req.body) input.parent_id = req.body.parentId || null;
  if ('sortOrder' in req.body) input.sort_order = Number(req.body.sortOrder);
  const node = touchUpdate(req.params.id, input);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  res.json({ node });
});

app.post('/api/nodes/:id/move', (req, res) => {
  const direction = req.body.direction === 'up' ? 'up' : 'down';
  const node = reorder(req.params.id, direction);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  res.json({ node });
});

app.delete('/api/nodes/:id', (req, res) => {
  softDelete(req.params.id);
  res.json({ ok: true });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}

app.listen(port, host, () => {
  console.log(`Workflowy clone listening at http://${host}:${port}/ (open http://127.0.0.1:${port}/)`);
  console.log(`SQLite DB: ${DB_PATH}`);
});
