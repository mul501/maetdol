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

**Total: N session(s) will be deleted.**
```

If no sessions exist, display:

```
No session data found. ~/.maetdol/ is clean.
```

Then skip to **Step 3** (no data to delete, so confirmation is unnecessary).

### 2. Confirm

Ask the user for confirmation before proceeding. Use AskUserQuestion:
- "Delete all session data? This cannot be undone."
- Options: "Yes, delete" / "Cancel"

If the user cancels, stop here.

If confirmed, call `maetdol_uninstall` with `{ action: "confirm" }`.

Display the result:

```
Deleted N session(s). ~/.maetdol/ removed.
```

### 3. Plugin removal guide

Display:

```
## Complete uninstall

Session data is gone. To fully remove the maetdol plugin:

1. `/plugin` → Installed 탭에서 maetdol 제거
```

## Error: MCP server unreachable

If `maetdol_uninstall` fails (server not running), display:

```
## Manual cleanup

The MCP server is not responding. To clean up manually:

1. Delete session data: `rm -rf ~/.maetdol/`
2. `/plugin` → Installed 탭에서 maetdol 제거
```
