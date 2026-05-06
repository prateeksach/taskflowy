# Backups

Runtime data stays outside the OpenClaw workspace.

- SQLite DB: `/Users/prateek-openclaw/.local/share/workflowy-clone/workflowy.sqlite`
- Backup directory: `/Users/prateek-openclaw/Backups/workflowy-clone/daily/`

## Run backup

```bash
cd /Users/prateek-openclaw/.openclaw/workspace/repos/workflowy-clone
npm run backup
```

Each run writes both:

- `workflowy-<timestamp>.sqlite`
- `workflowy-<timestamp>.json`

## Restore check

```bash
cd /Users/prateek-openclaw/.openclaw/workspace/repos/workflowy-clone
npm run restore-check
```

The check copies the latest SQLite backup to a temp directory, opens it, runs SQLite `integrity_check`, and verifies no active node references a missing parent.

## Daily schedule

A cron entry can run the backup daily at 2:45am PT:

```cron
45 2 * * * cd /Users/prateek-openclaw/.openclaw/workspace/repos/workflowy-clone && /opt/homebrew/bin/npm run backup >> /Users/prateek-openclaw/Library/Logs/workflowy-clone-backup.log 2>&1
```

This subagent did not install a cron entry; the scripts are ready for the main agent/operator to schedule if desired.
