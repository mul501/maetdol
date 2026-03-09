# CLAUDE.md — maetdol

## Philosophy

AI agents fail by being **eager, not cautious**. They dive into ambiguous tasks, loop on the same error, and never change approach. Maetdol (맷돌, "millstone") grinds tasks through five principles:

1. **Gate firmly** — Don't start until requirements are clear. Score ambiguity; if too vague, ask socratic questions.
2. **Plan meticulously** — Decompose into subtasks with explicit dependencies. Circular deps are rejected.
3. **Loop narrowly** — Each task gets a verify-fix loop (ralph) with hard iteration caps.
4. **Detect patterns** — Track error hashes. Same error 3x = stagnation. Alternating errors = oscillation.
5. **Shift thinking** — When stuck, switch persona. Spinning → contrarian. Oscillating → simplifier.

## Commands

```bash
npm run dev        # Run with tsx (development)
npm run build      # Build with tsup → dist/
npm run typecheck  # tsc --noEmit
```

```
/maetdol-setup     # Install deps and verify MCP server
/maetdol "task"    # Full pipeline — gate → decompose → ralph → verify
/maetdol-gate      # Check ambiguity only
/maetdol-design    # Requirements analysis and architecture design
/maetdol-unstuck   # Break out of a stuck loop
```

## Architecture

Three layers, each with a clear responsibility boundary:

| Layer | Location | Responsibility | Rule |
|-------|----------|---------------|------|
| **Server** | `src/` (TypeScript) | Deterministic logic: scoring math, hash comparison, state persistence, dependency graphs | State and computation go here |
| **Skills** | `.claude/skills/` (Markdown) | Creative orchestration: question generation, error analysis, persona prompts | Workflow choreography goes here |
| **Agents** | `.claude/agents/` (Markdown) | Specialized personas: interviewer, contrarian, simplifier | Perspective shifts go here |

All three layers are bundled in this repo. Skills live in `skills/`, agents in `agents/`. The `.claude-plugin/plugin.json` references them for plugin marketplace discovery.

### Session lifecycle

`gate` → [`design`] → [`stories`] → `decompose` → `ralph` → [`story verify`] → `verify` → `completed`

The `design` phase is optional — simple/clear tasks can skip it. The `stories` phase is optional — only for complex tasks with 3+ subtasks. Simple tasks skip directly from gate to decompose. Story verification happens automatically as task groups complete.

Sessions persist to `~/.maetdol/sessions/{id}.json` and survive context compression and process restarts.

## Code Patterns

### Tool registration

Each tool is a standalone `register*Tool(server)` function in `src/tools/`. The server entry point just calls them in sequence. To add a tool: create a file, export a register function, call it from `server.ts`.

### Response helpers

All tool handlers return via `ok(data)` or `toolError(message)` from `src/lib/response.ts`. These wrap MCP's `{ content: [{ type: 'text', text }] }` format. Never construct tool responses manually.

### Zod schemas

Input validation uses zod schemas passed directly to `registerTool`'s `inputSchema`. No separate validation step — the MCP SDK handles it.

### State mutation

State is generally immutable (spread-copy in `session.ts:86`, `storage.ts:26`). **Exception:** `tasks.ts` mutates `task.status` and `task.iterations` in-place on loaded session objects before saving. This is intentional — the task update/unblock logic is simpler with mutation, and the session is saved immediately after.

## Key Constants

| Constant | Value | File | Why |
|----------|-------|------|-----|
| `AMBIGUITY_THRESHOLD` | 0.3 | `score-ambiguity.ts` | Tasks must be 70%+ clear to pass. Calibrated so "Fix all TS errors in src/" passes but "Make it better" doesn't. |
| `DIMENSION_THRESHOLD` | 0.7 | `score-ambiguity.ts` | Per-dimension minimum. Any individual dimension below 0.7 fails the gate regardless of overall score. Prevents "suggestions generated but ignored" scenarios. |
| `MAX_TASK_ITERATIONS` | 5 | `ralph-iterate.ts` | Per-task retry cap. 5 attempts is enough to fix a real issue; more means the approach is wrong. |
| `MAX_SESSION_ITERATIONS` | 30 | `ralph-iterate.ts` | Session-wide safety net. Prevents runaway sessions across many small tasks. |
| `STAGNATION_THRESHOLD` | 3 | `ralph-iterate.ts` | Consecutive identical errors before flagging stagnation. 2 could be coincidence; 3 is a pattern. |

## Model Selection

Ambiguity scoring is delegated to the host Claude Code model — there is no direct Anthropic API dependency. The gate skill instructs Claude Code to evaluate goal/constraints/criteria scores, then passes them to `maetdol_score_ambiguity` for weighted calculation and threshold gating. This removes the need for an `ANTHROPIC_API_KEY`.

The interviewer agent (skill-side) inherits the caller's model. The contrarian and simplifier agents use Haiku — they need a different *perspective*, not deeper reasoning.

## Non-Obvious Details

- **Session ID truncation**: UUIDs are sliced to 12 chars (`randomUUID().slice(0, 12)`). Short enough for human use, long enough to avoid collisions in practice.
- **project_id**: Computed by the skill layer as `sha256(git remote URL)[:8]`, falling back to `sha256(cwd)[:8]` if no git remote exists. Passed to the server as `project_id`. If omitted, the server falls back to `shortHash(task)` for backward compatibility.
- **Auto-unblocking**: When a task completes, `unblockDependents()` automatically moves blocked tasks to `pending` if all their deps are met. Called on both `update` and `next` actions.
- **Cycle detection**: Task decomposition runs DFS cycle detection before accepting a dependency graph. Circular deps are rejected with an error, not silently broken.
- **Ambiguity formula**: Round 1: `goal×0.4 + constraints×0.3 + criteria×0.3` (context excluded pre-exploration). Round 2+: `goal×0.35 + constraints×0.25 + criteria×0.25 + context×0.15`. Response includes `weakest_dimension` for targeted interviewing.
- **Stagnation detection uses two patterns**: Spinning (last 3 hashes identical) and oscillation (ABAB pattern in last 4 hashes). Each maps to a different persona recommendation.
- **`dist/` commit rule**: When `src/` or `package.json` dependencies change, always run `npm run build` and commit `dist/server.js` together. Marketplace users have no `node_modules/` — they run `node dist/server.js` directly. Source/bundle mismatch breaks user environments.
