---
name: maetdol-uninstall
description: Remove all maetdol session data and guide plugin uninstall
---

# Uninstall Skill

Removes maetdol session data and guides plugin uninstall.

Triggered by: `/maetdol-uninstall`

## Flow

### 1. Preview

Call `maetdol_uninstall` with `{ action: "preview" }`.

Display the result:

```
# maetdol (맷돌) — Uninstall

## Session data (~/.maetdol/)

| ID | Task | Phase | Created |
|----|------|-------|---------|
| ... | ... | ... | ... |

**Total: N session(s)**

Additional data:
- Archives: N file(s)
- Config: config.json (exists / none)
- Reviews: N file(s)
```

If everything is empty (0 sessions, 0 archives, no config, 0 reviews), display:

```
No data found. ~/.maetdol/ is clean.
```

Then skip to **Step 3**.

### 2. Confirm

Ask the user for confirmation before proceeding. Use AskUserQuestion:
- "Delete all session data? This cannot be undone."
- Options: "Yes, delete" / "Cancel"

If the user cancels, stop here.

If confirmed:

1. Call `maetdol_uninstall` with `{ action: "confirm" }`.
2. Remove the `active-session-check.sh` hook from `~/.claude/settings.json`:
   - Read `~/.claude/settings.json`
   - Find and remove any hook entries (in any hook type array) where the command contains `active-session-check.sh`
   - Write the updated settings back
   - If the file doesn't exist or has no matching hooks, skip silently

Display the result:

```
Deleted N session(s). ~/.maetdol/ cleaned.
Hook removed from ~/.claude/settings.json.
```

### 3. Plugin removal guide

Display:

```
## Complete uninstall

Session data and hooks are gone. To fully remove the maetdol plugin:

1. `/plugin` → Installed 탭에서 maetdol 제거
```

## Error: MCP server unreachable

If `maetdol_uninstall` fails (server not running), display:

```
## Manual cleanup

The MCP server is not responding. To clean up manually:

1. Delete session data: `rm -rf ~/.maetdol/`
2. Remove `active-session-check.sh` entries from `~/.claude/settings.json`
3. `/plugin` → Installed 탭에서 maetdol 제거
```
