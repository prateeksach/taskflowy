# Backups

Runtime data stays outside the OpenClaw workspace. Taskflowy now supports `TASKFLOWY_DB_PATH` and `TASKFLOWY_BACKUP_DIR`; the original Workflowy clone env vars and paths remain supported so existing data/backups keep working.

- SQLite DB: `/Users/prateek-openclaw/.local/share/workflowy-clone/workflowy.sqlite`
- Backup directory: `/Users/prateek-openclaw/Backups/workflowy-clone/daily/`

## Run backup

```bash
cd /Users/prateek-openclaw/.openclaw/workspace/repos/workflowy-clone
npm run backup
```

Each run writes both:

- `taskflowy-<timestamp>.sqlite`
- `taskflowy-<timestamp>.json`

## Restore check

```bash
cd /Users/prateek-openclaw/.openclaw/workspace/repos/workflowy-clone
npm run restore-check
```

The check copies the latest SQLite backup to a temp directory, opens it, runs SQLite `integrity_check`, and verifies no active node references a missing parent.

## Daily schedule

A cron entry can run the backup daily at 2:45am PT:

```cron
45 2 * * * cd /Users/prateek-openclaw/.openclaw/workspace/repos/workflowy-clone && /opt/homebrew/bin/npm run backup >> /Users/prateek-openclaw/Library/Logs/taskflowy-backup.log 2>&1
```

This subagent did not install a cron entry; the scripts are ready for the main agent/operator to schedule if desired.
