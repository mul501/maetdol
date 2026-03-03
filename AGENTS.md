# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-03T06:40:00Z
**Commit:** aaa6065
**Branch:** main

## OVERVIEW

Claude Code productivity MCP plugin. Ambiguity gate, task decomposition, verify-fix loops, and stagnation detection. TypeScript + Node.js + MCP SDK.

## STRUCTURE

```
/
├── src/           # MCP server implementation
│   ├── tools/     # 5 MCP tools (session, tasks, score-ambiguity, ralph-iterate, detect-stagnation)
│   ├── lib/       # Utilities (storage, hash, response helpers)
│   ├── types.ts   # Shared type definitions
│   └── server.ts  # Entry point — registers all tools
├── agents/        # Persona definitions for unstuck skill
├── commands/      # Claude Code slash command definitions
├── skills/        # Claude Code skills (maetdol, gate, ralph, unstuck)
└── .mcp.json      # MCP server registration config
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new MCP tool | `src/tools/` | Register in `server.ts`, add types to `types.ts` |
| Modify session logic | `src/tools/session.ts` | Create/get/resume/complete |
| Change stagnation detection | `src/tools/detect-stagnation.ts` | Spinning/oscillation patterns |
| Adjust iteration limits | `src/tools/ralph-iterate.ts` | MAX_TASK_ITERATIONS=5, MAX_SESSION_ITERATIONS=30 |
| State storage | `~/.maetdol/sessions/` | JSON files per session |
| Add agent persona | `agents/` | Markdown with frontmatter (name, model) |
| Add skill | `skills/{name}/SKILL.md` | Claude Code skill format |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `registerSessionTool` | fn | `src/tools/session.ts` | Session lifecycle (create/get/resume/complete) |
| `registerTasksTool` | fn | `src/tools/tasks.ts` | Task decomposition + dependency management |
| `registerScoreAmbiguityTool` | fn | `src/tools/score-ambiguity.ts` | Ambiguity scoring (accepts pre-computed scores) |
| `registerRalphIterateTool` | fn | `src/tools/ralph-iterate.ts` | Iteration tracking + stagnation detection |
| `registerDetectStagnationTool` | fn | `src/tools/detect-stagnation.ts` | Hash-based pattern detection |
| `Session` | interface | `src/types.ts` | Main session state |
| `TaskItem` | interface | `src/types.ts` | Task with status, deps, error history |
| `saveSession` | fn | `src/lib/storage.ts` | Persist session to ~/.maetdol/sessions/ |

## CONVENTIONS

- **TypeScript strict mode** — all type errors fail compilation
- **ESM-only** — no CommonJS (`"type": "module"` in package.json)
- **No tests** — project lacks test infrastructure
- **No CI/CD** — manual builds only

## ANTI-PATTERNS (THIS PROJECT)

### Agent Constraints
- **Interviewer**: Max 5 questions per round. No suggestions/opinions. No "what do you want?"
- **Contrarian**: No code writing. Max 10 lines output. Must disagree.
- **Simplifier**: No code writing. Max 3 alternatives. Max 10 lines output.

### Code Constraints
- **Circular dependencies forbidden** — detected at task decomposition
- **Max 5 task iterations** — enforced in ralph-iterate
- **Max 30 session iterations** — enforced in ralph-iterate
- **Stagnation: 3 consecutive same errors** — triggers persona suggestion

## UNIQUE STYLES

### MCP Tool Pattern
Each tool exports `register*Tool(server: McpServer)` function. Server is passed in, tool registers itself. See `src/tools/*.ts` for examples.

### Skill Structure
Skills are subdirectories with `SKILL.md` containing frontmatter (`name`, `description`) and step-by-step instructions for Claude to follow.

### Agent Personas
Markdown files with frontmatter specifying `name` and `model` (haiku for contrarian/simplifier, inherit for interviewer).

## COMMANDS

```bash
npm run dev        # Run MCP server via tsx
npm run build      # Build to dist/ via tsup (ESM + .d.ts)
npm run typecheck  # TypeScript validation (tsc --noEmit)
```

## NOTES

- **State survives restarts** — sessions stored in `~/.maetdol/sessions/`
- **No test framework** — consider adding Vitest if tests needed
- **Skills vs Commands**: Skills contain orchestration logic; commands are thin wrappers that invoke skills
