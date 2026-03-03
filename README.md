# maetdol (맷돌)

Claude Code productivity plugin. Ambiguity gate, task decomposition, verify-fix loops, and stagnation detection.

## What it does

1. **Gate** — Scores task ambiguity. If too vague, asks socratic questions until requirements are clear.
2. **Decompose** — Breaks refined task into subtasks with dependency tracking.
3. **Ralph** — Executes each task in a verify-fix loop with error tracking.
4. **Unstuck** — Detects stagnation patterns (spinning, oscillation) and suggests alternative approaches.

## Usage

```
/maetdol "Fix all TypeScript errors in src/"
```

Sub-commands (work standalone or within a session):

```
/maetdol:gate "Add user authentication"    # Check ambiguity only
/maetdol:unstuck                           # Break out of a stuck loop
```

## Install

```bash
cd maetdol
npm install
```

Add to your Claude Code MCP config or use as a plugin:

```json
{
  "mcpServers": {
    "maetdol": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "/path/to/maetdol"
    }
  }
}
```

## MCP Tools

| Tool | Purpose |
|------|---------|
| `maetdol_session` | Session lifecycle (create/get/resume/complete) |
| `maetdol_tasks` | Task decomposition and dependency management |
| `maetdol_score_ambiguity` | LLM-based ambiguity scoring |
| `maetdol_ralph_iterate` | Per-task iteration tracking and stagnation detection |
| `maetdol_detect_stagnation` | Hash-based spinning/oscillation pattern detection |

## Architecture

- **MCP Server** (TypeScript) — Deterministic logic: scoring, hashing, state tracking, file I/O
- **Skills** (Markdown) — Creative orchestration: question generation, error analysis, persona-based thinking
- **Agents** — Specialized personas: interviewer, contrarian, simplifier

State is stored in `~/.maetdol/sessions/`. Sessions survive context compression and process restarts.

## License

MIT
