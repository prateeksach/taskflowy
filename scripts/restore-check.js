import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Taskflowy env vars are preferred; Workflowy vars/paths remain supported for the existing local install.
const backupRoot = process.env.TASKFLOWY_BACKUP_DIR || process.env.WORKFLOWY_BACKUP_DIR || '/Users/prateek-openclaw/Backups/workflowy-clone/daily';
if (!fs.existsSync(backupRoot)) {
  console.error(`Backup directory not found: ${backupRoot}`);
  process.exit(1);
}
const backups = fs.readdirSync(backupRoot)
  .filter((f) => f.endsWith('.sqlite'))
  .sort()
  .map((f) => path.join(backupRoot, f));
if (!backups.length) {
  console.error(`No SQLite backups found in ${backupRoot}`);
  process.exit(1);
}
const latest = backups.at(-1);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflowy-restore-check-'));
const tempDb = path.join(tempDir, 'restore.sqlite');
fs.copyFileSync(latest, tempDb);
const db = new Database(tempDb, { readonly: true });
const integrity = db.pragma('integrity_check', { simple: true });
const orphanCount = db.prepare(`SELECT COUNT(*) AS c FROM nodes child
  LEFT JOIN nodes parent ON child.parent_id = parent.id
  WHERE child.parent_id IS NOT NULL AND parent.id IS NULL AND child.deleted_at IS NULL`).get().c;
const activeCount = db.prepare('SELECT COUNT(*) AS c FROM nodes WHERE deleted_at IS NULL').get().c;
db.close();
if (integrity !== 'ok') {
  console.error(`Integrity check failed: ${integrity}`);
  process.exit(1);
}
if (orphanCount !== 0) {
  console.error(`Orphaned active nodes found: ${orphanCount}`);
  process.exit(1);
}
console.log(`Restore check OK: ${latest}`);
console.log(`Temp restore opened at: ${tempDb}`);
console.log(`Active nodes: ${activeCount}; orphaned active nodes: ${orphanCount}`);
