# Reboot-safe service

The app includes a LaunchAgent plist at:

`service/com.prateek.workflowy-clone.plist`

It runs `/opt/homebrew/bin/node server/index.js` from the repo, with `NODE_ENV=production`, `PORT=4184`, `HOST=0.0.0.0`, and the DB outside the workspace.

## Install/start

```bash
cd /Users/prateek-openclaw/.openclaw/workspace/repos/workflowy-clone
mkdir -p /Users/prateek-openclaw/Library/LaunchAgents /Users/prateek-openclaw/Library/Logs
cp service/com.prateek.workflowy-clone.plist /Users/prateek-openclaw/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) /Users/prateek-openclaw/Library/LaunchAgents/com.prateek.workflowy-clone.plist
launchctl enable gui/$(id -u)/com.prateek.workflowy-clone
launchctl kickstart -k gui/$(id -u)/com.prateek.workflowy-clone
```

## Status

```bash
launchctl print gui/$(id -u)/com.prateek.workflowy-clone
curl http://127.0.0.1:4184/api/health
```

## Stop/uninstall

```bash
launchctl bootout gui/$(id -u)/com.prateek.workflowy-clone
rm /Users/prateek-openclaw/Library/LaunchAgents/com.prateek.workflowy-clone.plist
```

## Logs

- stdout: `/Users/prateek-openclaw/Library/Logs/workflowy-clone.out.log`
- stderr: `/Users/prateek-openclaw/Library/Logs/workflowy-clone.err.log`
