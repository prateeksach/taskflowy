# Workflowy Clone

A first testable local Workflowy-style outliner/to-do app for Prateek. It is desktop-first, single-user, React + TypeScript + Vite in front, Node/Express + SQLite behind.

## Paths

- Repo: `/Users/prateek-openclaw/.openclaw/workspace/repos/workflowy-clone`
- Runtime SQLite DB: `/Users/prateek-openclaw/.local/share/workflowy-clone/workflowy.sqlite`
- Backups: `/Users/prateek-openclaw/Backups/workflowy-clone/daily/`

## Install and run

```bash
cd /Users/prateek-openclaw/.openclaw/workspace/repos/workflowy-clone
npm install
npm run build
npm start
```

Open:

- Mac/browser: http://127.0.0.1:4184/
- Tailscale if reachable from the host/network: http://100.105.93.6:4184/

## Use

- Edit any bullet inline.
- `Enter`: create sibling below.
- `Tab` / `Shift+Tab`: indent / outdent.
- `Cmd/Ctrl+Up` or `Cmd/Ctrl+Down`: move among siblings.
- `Cmd/Ctrl+Enter`: toggle complete.
- `Cmd/Ctrl+Backspace`: soft-delete node and descendants.
- Click the bullet dot to zoom into that node.
- Use breadcrumbs/Home/Back to navigate zoom.
- Use ✓ and × buttons for complete/delete.

## Offline/cache model

The server is the source of truth. The browser caches the latest loaded tree in `localStorage`. If the server/API is unavailable, the app shows an offline banner and displays the cached tree read-only. Editing is disabled offline for MVP safety. Refocus and a 30-second interval pull latest server data.

## API checks

```bash
curl http://127.0.0.1:4184/api/health
curl http://127.0.0.1:4184/api/tree
```

See `BACKUP.md` and `SERVICE.md` for backups and reboot-safe service setup.
