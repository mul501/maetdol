---
name: maetdol-setup
description: Verify maetdol plugin setup
---

# Setup Skill

Verifies that the maetdol plugin is correctly installed and the MCP server is functional.

Triggered by: `/maetdol-setup`

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

If this **fails**, proceed to Step 3 (Troubleshoot).

### 3. Troubleshoot (only if Step 2 failed)

MCP server connection failed. Ask the user to restart Claude Code — MCP servers may require a restart after plugin installation.

After restart, run `/maetdol-setup` again.

### 4. Clean Up Test Session

Call `maetdol_session` with `{ action: "complete", session_id: "<id from step 2>" }` to remove the test session.

### 4.5. Research Tools Check

Verify that MCP tools needed for external research in the blueprint phase are installed.

1. **Check Context7**: Attempt to call `mcp__context7__resolve-library-id` with `{ libraryName: "test" }`.
   - Success (response received) → `context7: true`
   - Failure (tool missing/error) → `context7: false`

2. **Check WebSearch**: Verify whether the WebSearch tool is available.
   - Available → `web_search: true`
   - Unavailable → `web_search: false`

3. **Save results**: Record `research_tools` in `~/.maetdol/config.json`:
   ```json
   {
     "research_tools": {
       "context7": true,
       "web_search": false
     }
   }
   ```
   If config.json already exists, update only the `research_tools` field. Otherwise, create a new file.

4. **Report results**:
   - Both available: "Research tools: Context7 + WebSearch available."
   - Partial: "Research tools: <available> available. Installing <missing> will improve research quality."
     - Context7 install: `claude mcp add context7-mcp -- npx -y @context7/mcp`
   - Neither available: "No external research tools installed. Proceeding with code research only."

### 4.6. Review CLI Setup

Ask the user whether to configure an external review model. Used in two places:
- **Blueprint review** (blueprint Step 3.5) — external model reviews the blueprint before showing it to the user
- **Code review** (`/maetdol-review`) — external model reviews code changes

1. **Present choices** (AskUserQuestion):
   "Choose an external model CLI for blueprint and code review."
   - **Codex** — OpenAI Codex CLI (`codex` command). Prerequisite: `npm i -g @openai/codex` + OpenAI login.
   - **Claude** — Anthropic Claude CLI (`claude` command). Prerequisite: Claude Code installed + logged in.
   - **Gemini** — Google Gemini CLI (`gemini` command). Prerequisite: Gemini CLI installed + logged in.
   - **Skip** — Do not use external review. Can be added later via `/maetdol-setup`.

2. If "Skip" is selected:
   - Do not write review_cli to config.json.
   - "Proceeding without an external review CLI. You can add one later via `/maetdol-setup`."
   - Proceed to Step 5.

3. **Verify installation**: Run `which <selected CLI>`.
   - Success → proceed to step 4.
   - Failure → show installation instructions:
     - Codex: `npm install -g @openai/codex && codex login`
     - Claude: Already running Claude Code, so likely installed. Check with `claude --version`.
     - Gemini: Refer to Gemini CLI installation guide.
   - Output "Re-run `/maetdol-setup` after installation."
   - Do not write to config.json. Proceed to Step 5.

4. **Test run**: Verify CLI works with a simple prompt.
   `echo "Say OK" | <cli> <flags>` (timeout 30 seconds)
   - Success → save to config.json:
     ```json
     { "review_cli": "<name>", "review_cli_flags": "<flags>" }
     ```
     Default flags per CLI:
     - codex: `exec --ephemeral --skip-git-repo-check`
     - claude: `--print`
     - gemini: `--prompt ""`
   - Failure → "CLI is not responding. Check your login status." then skip.

5. **Confirmation message**: "Review CLI `<name>` registered. It will be used in blueprint review and /maetdol-review."

### 5. Success Summary

Display:

```
## Setup Complete

maetdol is ready. Available commands:

| Command | Description |
|---------|-------------|
| `/maetdol "task"` | Full pipeline — gate → decompose → ralph → verify |
| `/maetdol-gate "task"` | Check ambiguity only |
| `/maetdol-blueprint "task"` | Requirements analysis and architecture blueprint |
| `/maetdol-unstuck` | Break out of a stuck loop |
| `/maetdol-review` | Review code changes using external model CLI |
| `/maetdol-setup` | Re-run this setup |
```
