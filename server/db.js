import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Prefer Taskflowy env vars while keeping the original Workflowy clone data path
// as the default so existing local data and LaunchAgents continue to work.
export const DATA_DIR = process.env.TASKFLOWY_DATA_DIR || process.env.WORKFLOWY_DATA_DIR || '/Users/prateek-openclaw/.local/share/workflowy-clone';
export const DB_PATH = process.env.TASKFLOWY_DB_PATH || process.env.WORKFLOWY_DB_PATH || path.join(DATA_DIR, 'workflowy.sqlite');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  collapsed INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_nodes_parent_order ON nodes(parent_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_title ON nodes(title) WHERE deleted_at IS NULL;
`);

const now = () => new Date().toISOString();
const id = () => randomUUID();

const toClient = (n) => n && ({
  id: n.id,
  parentId: n.parent_id ?? null,
  title: n.title,
  sortOrder: n.sort_order,
  completed: !!n.completed,
  collapsed: !!n.collapsed,
  deletedAt: n.deleted_at ?? null,
  createdAt: n.created_at,
  updatedAt: n.updated_at,
  version: n.version
});

export function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM nodes WHERE deleted_at IS NULL').get().c;
  if (count > 0) return;
  const insert = db.prepare(`INSERT INTO nodes
    (id, parent_id, title, sort_order, completed, collapsed, created_at, updated_at, version)
    VALUES (@id, @parent_id, @title, @sort_order, 0, 0, @created_at, @updated_at, 1)`);
  const t = now();
  const roots = [id(), id(), id()];
  const rows = [
    { id: roots[0], parent_id: null, title: 'Inbox', sort_order: 1000, created_at: t, updated_at: t },
    { id: id(), parent_id: roots[0], title: 'Capture a thought, then press Enter for the next one', sort_order: 1000, created_at: t, updated_at: t },
    { id: id(), parent_id: roots[0], title: 'Drag the handle to reorder or nest bullets', sort_order: 2000, created_at: t, updated_at: t },
    { id: roots[1], parent_id: null, title: 'Today', sort_order: 2000, created_at: t, updated_at: t },
    { id: id(), parent_id: roots[1], title: 'Pick one important thing', sort_order: 1000, created_at: t, updated_at: t },
    { id: id(), parent_id: roots[1], title: 'Use Cmd/Ctrl+Enter to complete it', sort_order: 2000, created_at: t, updated_at: t },
    { id: roots[2], parent_id: null, title: 'Ideas', sort_order: 3000, created_at: t, updated_at: t }
  ];
  const tx = db.transaction((items) => items.forEach((row) => insert.run(row)));
  tx(rows);
}

export function getNodes() {
  return db.prepare(`SELECT * FROM nodes WHERE deleted_at IS NULL ORDER BY parent_id IS NOT NULL, parent_id, sort_order, created_at`).all().map(toClient);
}

export function getNode(idValue) {
  return db.prepare('SELECT * FROM nodes WHERE id = ? AND deleted_at IS NULL').get(idValue);
}

export function getClientNode(idValue) {
  return toClient(getNode(idValue));
}

export function searchNodes(query, limit = 20) {
  const q = `%${String(query || '').trim()}%`;
  if (q === '%%') return [];
  return db.prepare(`SELECT * FROM nodes WHERE deleted_at IS NULL AND title LIKE ? ORDER BY updated_at DESC LIMIT ?`).all(q, Math.max(1, Math.min(Number(limit) || 20, 100))).map(toClient);
}

export function touchUpdate(idValue, fields) {
  const existing = getNode(idValue);
  if (!existing) return null;
  const allowed = ['title', 'completed', 'collapsed', 'parent_id', 'sort_order'];
  const sets = [];
  const params = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key)) continue;
    sets.push(`${key} = @${key}`);
    params[key] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  }
  if (!sets.length) return toClient(existing);
  params.id = idValue;
  params.updated_at = now();
  db.prepare(`UPDATE nodes SET ${sets.join(', ')}, updated_at = @updated_at, version = version + 1 WHERE id = @id`).run(params);
  return getClientNode(idValue);
}

function maxSortOrder(parentId) {
  return db.prepare('SELECT MAX(sort_order) AS m FROM nodes WHERE parent_id IS ? AND deleted_at IS NULL').get(parentId).m ?? 0;
}

export function createNode({ parentId = null, afterId = null, title = '' }) {
  let sortOrder;
  if (afterId) {
    const after = getNode(afterId);
    parentId = after?.parent_id ?? parentId;
    sortOrder = (after?.sort_order ?? 0) + 1000;
  } else {
    sortOrder = maxSortOrder(parentId) + 1000;
  }
  const t = now();
  const row = { id: id(), parent_id: parentId, title, sort_order: sortOrder, created_at: t, updated_at: t };
  db.prepare(`INSERT INTO nodes (id, parent_id, title, sort_order, completed, collapsed, created_at, updated_at, version)
    VALUES (@id, @parent_id, @title, @sort_order, 0, 0, @created_at, @updated_at, 1)`).run(row);
  normalizeSiblingOrder(parentId);
  return getClientNode(row.id);
}

export function softDelete(idValue) {
  const t = now();
  const tx = db.transaction((rootId) => {
    const stack = [rootId];
    while (stack.length) {
      const current = stack.pop();
      const kids = db.prepare('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL').all(current);
      stack.push(...kids.map((k) => k.id));
      db.prepare('UPDATE nodes SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?').run(t, t, current);
    }
  });
  tx(idValue);
}

export function reorder(idValue, direction) {
  const node = getNode(idValue);
  if (!node) return null;
  const sibs = db.prepare('SELECT id, sort_order FROM nodes WHERE parent_id IS ? AND deleted_at IS NULL ORDER BY sort_order, created_at').all(node.parent_id);
  const idx = sibs.findIndex((s) => s.id === idValue);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= sibs.length) return toClient(node);
  const a = sibs[idx], b = sibs[swapIdx];
  const t = now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE nodes SET sort_order = ?, updated_at = ?, version = version + 1 WHERE id = ?').run(b.sort_order, t, a.id);
    db.prepare('UPDATE nodes SET sort_order = ?, updated_at = ?, version = version + 1 WHERE id = ?').run(a.sort_order, t, b.id);
  });
  tx();
  return getClientNode(idValue);
}

function normalizeSiblingOrder(parentId) {
  const rows = db.prepare('SELECT id FROM nodes WHERE parent_id IS ? AND deleted_at IS NULL ORDER BY sort_order, created_at').all(parentId);
  const t = now();
  const update = db.prepare('UPDATE nodes SET sort_order = ?, updated_at = ?, version = version + 1 WHERE id = ?');
  rows.forEach((row, idx) => update.run((idx + 1) * 1000, t, row.id));
}

function wouldCycle(idValue, parentId) {
  let cur = parentId ? getNode(parentId) : null;
  while (cur) {
    if (cur.id === idValue) return true;
    cur = cur.parent_id ? getNode(cur.parent_id) : null;
  }
  return false;
}

export function repositionNode(idValue, { parentId = null, index = 0 }) {
  const node = getNode(idValue);
  if (!node) return null;
  if (parentId && !getNode(parentId)) throw new Error('Parent not found');
  if (wouldCycle(idValue, parentId)) throw new Error('Cannot move a node into itself or its descendants');

  const targetSiblings = db.prepare('SELECT id FROM nodes WHERE parent_id IS ? AND id != ? AND deleted_at IS NULL ORDER BY sort_order, created_at').all(parentId, idValue);
  const boundedIndex = Math.max(0, Math.min(Number(index) || 0, targetSiblings.length));
  const ordered = [...targetSiblings.slice(0, boundedIndex), { id: idValue }, ...targetSiblings.slice(boundedIndex)];
  const t = now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE nodes SET parent_id = ?, updated_at = ?, version = version + 1 WHERE id = ?').run(parentId, t, idValue);
    const update = db.prepare('UPDATE nodes SET sort_order = ?, updated_at = ?, version = version + 1 WHERE id = ?');
    ordered.forEach((row, idx) => update.run((idx + 1) * 1000, t, row.id));
    if (node.parent_id !== parentId) normalizeSiblingOrder(node.parent_id);
  });
  tx();
  return getClientNode(idValue);
}
