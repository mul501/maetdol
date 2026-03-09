---
name: maetdol-teardown
description: Remove all maetdol session data and guide plugin uninstall
---

# Teardown Skill

Removes maetdol session data and guides plugin uninstall.

Triggered by: `/maetdol-teardown`

## Flow

### 1. Preview

Call `maetdol_teardown` with `{ action: "preview" }`.

Display the result:

```
# maetdol (맷돌) — Teardown

## Session data (~/.maetdol/)

| ID | Task | Phase | Created |
|----|------|-------|---------|
| ... | ... | ... | ... |

**Total: N session(s) will be deleted.**
```

If no sessions exist, display:

```
No session data found. ~/.maetdol/ is clean.
```

### 2. Confirm

Ask the user for confirmation before proceeding. Use AskUserQuestion:
- "Delete all session data? This cannot be undone."
- Options: "Yes, delete" / "Cancel"

If the user cancels, stop here.

If confirmed, call `maetdol_teardown` with `{ action: "confirm" }`.

Display the result:

```
Deleted N session(s). ~/.maetdol/ removed.
```

### 3. Plugin removal guide

Display:

```
## Complete uninstall

Session data is gone. To fully remove the maetdol plugin:

1. Run: `/plugin remove maetdol`

This will:
- Remove plugin registration from ~/.claude/plugins/installed_plugins.json
- Delete cached skills, agents, and commands from ~/.claude/plugins/cache/
- Unregister the MCP server

No manual cleanup needed after that.
```

## Error: MCP server unreachable

If `maetdol_teardown` fails (server not running), display:

```
## Manual cleanup

The MCP server is not responding. To clean up manually:

1. Delete session data: `rm -rf ~/.maetdol/`
2. Remove plugin: `/plugin remove maetdol`
```
