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
/maetdol-blueprint # Requirements analysis and architecture blueprint
/maetdol-run       # Execute from current phase through completion
/maetdol-unstuck   # Break out of a stuck loop
/maetdol-review    # Review code changes using external model CLI
/mongdol "desc"    # Post-completion polishing — targeted adjustments
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

**maetdol**: `gate`(research→score→interview→walkthrough) → [`blueprint`(design + optional deep research) + `plan-review`] → [`stories`] → `decompose` → `ralph` → [`story verify`] → `verify` → [`simplify`] → [`external review`] → `completed`

**mongdol** (polishing): `decompose` → `ralph` → `verify` → `completed` (gate/blueprint 스킵, tight iteration caps)

Research happens inside the gate phase (before first scoring), not in blueprint. Blueprint receives `research_findings` from the gate and only does additional deep research when gate findings are insufficient (e.g., API-level detail).

The `blueprint` phase is optional — simple/clear tasks can skip it. The `stories` phase is optional — only for complex tasks with 3+ subtasks. Simple tasks skip directly from gate to decompose. Story verification happens automatically as task groups complete.

Sessions persist to `~/.maetdol/sessions/{id}/session.json` and survive context compression and process restarts. Review files (blueprint-review.md, code-review.md, final-review.md) are stored alongside session.json in the same directory. Each session has a `checkpoint` field updated at milestones — after compression, the `UserPromptSubmit` hook detects active sessions and the run skill uses `checkpoint` to resume at the exact sub-step, not just the phase start.

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
| `BLUEPRINT_SKIP_THRESHOLD` | 0.15 | `constants.ts` | Blueprint 스킵 기준. 매우 명확한 태스크(< 0.15)이고 관련 파일 2개 이하면 아키텍처 설계 생략. |
| `MAX_POLISH_ITERATIONS` | 3 | `constants.ts` | mongdol per-task retry cap. 폴리싱은 3회면 충분. |
| `MAX_MONGDOL_SESSION_ITERATIONS` | 10 | `constants.ts` | mongdol session-wide safety net. |
| `MAX_POLISH_ITEMS` | 5 | `constants.ts` | mongdol 최대 폴리싱 항목. 5개 초과 시 maetdol 사용 권장. |
| `MAX_ARCHIVE_PER_PROJECT` | 5 | `constants.ts` | 프로젝트당 최근 아카이브 보관 수. 초과 시 oldest 자동 삭제. |
| `DEFAULT_REVIEW_TIMEOUT` | 1800 | `constants.ts` | 외부 리뷰 CLI 타임아웃(초). config.json `review_timeout`으로 오버라이드 가능. |

## Model Selection

Ambiguity scoring is delegated to the host Claude Code model — there is no direct Anthropic API dependency. The gate skill instructs Claude Code to evaluate goal/constraints/criteria scores, then passes them to `maetdol_score_ambiguity` for weighted calculation and threshold gating. This removes the need for an `ANTHROPIC_API_KEY`.

The interviewer agent (skill-side) inherits the caller's model. The contrarian and simplifier agents use Haiku — they need a different *perspective*, not deeper reasoning.

## Non-Obvious Details

- **Session ID truncation**: UUIDs are sliced to 12 chars (`randomUUID().slice(0, 12)`). Short enough for human use, long enough to avoid collisions in practice.
- **project_id**: Computed by the skill layer as `sha256(git remote URL)[:8]`, falling back to `sha256(cwd)[:8]` if no git remote exists. Passed to the server as `project_id`. If omitted, the server falls back to `shortHash(task)` for backward compatibility.
- **Auto-unblocking**: When a task completes, `unblockDependents()` automatically moves blocked tasks to `pending` if all their deps are met. Called on both `update` and `next` actions.
- **Cycle detection**: Task decomposition runs DFS cycle detection before accepting a dependency graph. Circular deps are rejected with an error, not silently broken.
- **Ambiguity formula**: 5 dimensions (goal, constraints, criteria, context, interaction). Round 1 (post-research, pre-interview): `goal×0.30 + constraints×0.20 + criteria×0.20 + interaction×0.15 + context×0.15`. Round 2+: `goal×0.25 + constraints×0.20 + criteria×0.20 + interaction×0.15 + context×0.20`. The `interaction` dimension measures how clearly user actions/flows are defined. Response includes `weakest_dimension` and `weak_dimensions` for targeted interviewing.
- **Stagnation detection uses two patterns**: Spinning (last 3 hashes identical) and oscillation (ABAB pattern in last 4 hashes). Each maps to a different persona recommendation.
- **`dist/` commit rule**: When `src/` or `package.json` dependencies change, always run `npm run build` and commit `dist/server.js` together. Marketplace users have no `node_modules/` — they run `node dist/server.js` directly. Source/bundle mismatch breaks user environments.
- **Review CLI is registered in setup**: No auto-detection. `/maetdol-setup` asks the user, verifies, and saves to config.json.
- **Plan review is graceful**: Silently skips the review step if no external CLI is registered. Does not break the blueprint workflow.
- **Session archive**: `session complete` moves the session directory (`~/.maetdol/sessions/{id}/`) to `~/.maetdol/archive/{id}/` — review files are archived alongside session.json. Keeps the last 5 per project (by `created_at`). Mongdol uses archives to understand what was originally done. `uninstall confirm` (full) deletes archives too.
- **Session type field**: `session.type` is `'maetdol'` (default) or `'mongdol'`. `findActiveSession` filters by type — maetdol and mongdol sessions coexist independently. Mongdol sessions start at `phase: decompose` (skip gate/blueprint).
- **Checkpoint field**: `session.checkpoint` (string | null, max 200 chars) records sub-step progress within a phase. Format examples: `ralph:task3/5:done`, `verify:tests_passed`. Saved via `maetdol_session save_checkpoint`. The run skill saves checkpoints at each milestone; after context compression, it reads the checkpoint to resume at the exact sub-step rather than replaying the entire phase.
- **Active session hook**: `hooks/active-session-check.sh` is a `UserPromptSubmit` hook registered by `/maetdol-setup` (Step 4.7). It computes project_id from git remote/cwd, scans `~/.maetdol/sessions/` for matching execution-phase sessions (`ralph`, `decompose`, `verify`, `stories`), and outputs a reminder with session ID, checkpoint, and resume instructions. Gate/blueprint sessions are excluded (user is already interacting).
- **Step 6.6 — Final External Review**: After simplification (Step 6.5), if an external review CLI is configured, the run skill starts the external CLI via `maetdol_review_exec` (background) while running an internal code-reviewer agent in parallel. Results are combined. Distinct from Step 6.3 (internal code-reviewer agent for plan alignment) — Step 6.6 uses an external model for a fresh perspective on bugs and security.
- **`maetdol_review_exec` tool**: Server-side process management for external review CLIs. Spawns the CLI as a detached process group, pipes the prompt to stdin, redirects stdout+stderr to the session directory. Supports `start` (spawn + timer) and `check` (poll status + read preview). `check` returns explicit 3-state `status`: `"not_started"` (no review file exists), `"in_progress"` (process still running), `"completed"` (process finished or timed out). `completed` field retained for backward compatibility. Timeout kills the entire process group to prevent orphans.
- **Independent verification**: The verifier agent (`agents/verifier.md`, Haiku) independently checks acceptance criteria without seeing the executor's evidence. Server-side evidence quality checks (`MIN_EVIDENCE_LENGTH`, newline check, unmet criteria warning) run on every `ralph_iterate` pass and populate `evidence_warnings` in the result. Story verification (Step 5b) always uses the verifier. Final verification (Step 6, step 3.5) runs for all completed tasks with non-empty `acceptance_criteria` in non-story sessions — regardless of `evidence_warnings`. Max 2 rejection rounds before escalating to the user.
- **Task completion gate**: `tasks.ts` `update` action rejects `status: "completed"` on tasks with non-empty `acceptance_criteria` unless (1) all criteria are met via `criteria_results` and (2) `verify_result === "pass"`. Tasks without acceptance criteria (typo fixes, etc.) bypass the gate. Same pattern as `verify_story`'s `allCriteriaMet` check.
