---
name: setup
description: Install dependencies and verify maetdol plugin
---

# Setup Skill

Verifies that the maetdol plugin is correctly installed and the MCP server is functional.

Triggered by: `/maetdol:setup`

## Flow

### 1. Welcome

Display:

```
# maetdol (맷돌) — Setup

AI agents fail by being eager, not cautious. Maetdol grinds tasks through five principles:

1. **Gate firmly** — Score ambiguity; if too vague, ask socratic questions.
2. **Plan meticulously** — Decompose into subtasks with dependency tracking.
3. **Loop narrowly** — Verify-fix loop with hard iteration caps.
4. **Detect patterns** — Track error hashes for stagnation detection.
5. **Shift thinking** — Switch persona when stuck.
```

### 2. Verify MCP Server

Call `maetdol_session` with `{ action: "create", task: "setup-verify" }` to confirm the MCP server is reachable and functional.

If this **succeeds**, skip to Step 4 (Clean Up).

If this **fails**, proceed to Step 3 (Install Dependencies).

### 3. Install Dependencies (only if Step 2 failed)

This step is for **local development** users only. Marketplace users should never need this — `dist/server.js` is pre-bundled.

Run `npm install && npm run build` in the plugin directory, then retry the MCP server call from Step 2.

If it still fails, report the error and suggest troubleshooting steps:
- Check that `npm install` completed successfully
- Verify the MCP server configuration in `mcp-config.json`
- Try running `npm run dev` manually to see server output

### 4. Clean Up Test Session

Call `maetdol_session` with `{ action: "complete", session_id: "<id from step 2>" }` to remove the test session.

### 5. Success Summary

Display:

```
## Setup Complete

maetdol is ready. Available commands:

| Command | Description |
|---------|-------------|
| `/maetdol "task"` | Full pipeline — gate → decompose → ralph → verify |
| `/maetdol:gate "task"` | Check ambiguity only |
| `/maetdol:design "task"` | Requirements analysis and architecture design |
| `/maetdol:unstuck` | Break out of a stuck loop |
| `/maetdol:setup` | Re-run this setup |
```
