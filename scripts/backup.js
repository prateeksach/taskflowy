import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.WORKFLOWY_DB_PATH || '/Users/prateek-openclaw/.local/share/workflowy-clone/workflowy.sqlite';
const backupRoot = process.env.WORKFLOWY_BACKUP_DIR || '/Users/prateek-openclaw/Backups/workflowy-clone/daily';
fs.mkdirSync(backupRoot, { recursive: true });

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const sqliteOut = path.join(backupRoot, `workflowy-${stamp}.sqlite`);
const jsonOut = path.join(backupRoot, `workflowy-${stamp}.json`);

const db = new Database(dbPath, { readonly: true });
await db.backup(sqliteOut);
const nodes = db.prepare('SELECT * FROM nodes ORDER BY parent_id, sort_order').all();
const metadata = { exportedAt: new Date().toISOString(), dbPath, nodeCount: nodes.length };
fs.writeFileSync(jsonOut, JSON.stringify({ metadata, nodes }, null, 2));
db.close();
console.log(`SQLite backup: ${sqliteOut}`);
console.log(`JSON export: ${jsonOut}`);
