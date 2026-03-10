---
name: maetdol-blueprint
description: Requirements analysis and architecture blueprint for a maetdol session
---

# Blueprint Skill

Analyzes requirements and produces an architecture blueprint before task decomposition. Can run standalone via `/maetdol-blueprint` or as part of the full maetdol pipeline.

## Independent Mode

Triggered by: `/maetdol-blueprint`

Requires an active session in `blueprint` phase. If no session exists, instruct the user to run `/maetdol-gate` first.

## Flow

### 1. Load Session Context

Read the session to get:
- `gate.refined_task` — the gated task description
- `gate.project_type` — `'new'` or `'existing'` (may be absent for simple tasks)
- `gate.relevant_files` — files discovered during gate exploration (may be empty)
- `gate.score` — ambiguity score

### 2. Decide: Skip or Blueprint

**Skip conditions** (all must be true):
- `gate.score < 0.15` (very clear task)
- `relevant_files` has 2 or fewer entries (small scope)

If skipping:
- Call `maetdol_blueprint` with `{ session_id, skip: true }`.
- Output: "Blueprint skipped — task is simple enough for direct decomposition."
- Done.

### 2.5. Research (required before blueprint)

Research on two tracks: **Code Research** + **External Research**. Run both tracks in parallel — they are independent of each other.

#### A. Code Research (existing projects) (parallel with B)

Skip if `gate.project_type` is `'new'`.

1. **Read files**: Read each file in `gate.relevant_files` in full using Read. Full files, not scans.
2. **Search patterns**: Search for code patterns related to the task using Grep.
   - If the task mentions function/class/module names → search for usage sites
   - If the task implies a code pattern (e.g., "add a tool") → search for existing instances (e.g., `registerTool`)
   - Check for test files alongside related source files
3. **Identify conventions**: Identify import style, naming conventions, and error handling patterns.

#### B. External Research (all projects) (parallel with A)

Collect external evidence for libraries, frameworks, or technologies used in the task.
**Use only available tools** — refer to `research_tools` in `~/.maetdol/config.json`.

1. **Check tool availability**: Read `research_tools` from `cat ~/.maetdol/config.json 2>/dev/null`.
   - `context7: true` → Context7 available
   - `web_search: true` → WebSearch available
   - No config or both false → skip external research. Proceed with code research only.

2. **Context7 docs lookup** (when context7 is available):
   - Resolve library ID with `mcp__context7__resolve-library-id`
   - Query relevant API/pattern docs with `mcp__context7__query-docs`
   - E.g.: MCP SDK tool registration, Zod schema patterns, React hook rules, etc.

3. **Web search** (when web_search is available):
   - When information is not in Context7 or latest changes are needed
   - Search for official docs, best practices, known issues via WebSearch
   - E.g.: "MCP plugin hooks.json format", "tsup library bundling", etc.

4. **When neither is available**: Skip external research, but note in the blueprint's External References section: "External research tools not configured — can be enabled via `/maetdol-setup`."

5. **Assess applicability**: Determine how to apply findings to the task:
   - If official docs recommend a pattern → reflect in blueprint
   - If known gotchas exist → note in Risks
   - If uncertain areas remain → ask the user

#### C. Consolidate Findings

Merge code research + external research results into notes for the Step 3 blueprint:

```
## Research Findings

### Codebase Patterns
- <patterns and conventions found in code>

### External References
- <evidence from Context7/web, with sources>
  E.g.: "MCP SDK docs: registerTool accepts Zod schema directly (context7)"
  E.g.: "tsup official docs: external option controls bundle size"

### Open Questions
- <items to confirm with user before blueprint>
```

If there are Open Questions, ask the user before proceeding to Step 3.

#### Skip Conditions

- **Code research**: Skip if `new` project.
- **External research**: Skip if the task is purely internal refactoring (no external library involvement).
- **Both skipped**: Rare but possible (e.g., simple file rename) → proceed directly to Step 3.

### 3. Blueprint (when not skipping)

#### For `existing` projects:

1. Proceed with blueprint based on Step 2.5 research findings (code patterns + external evidence).
2. Identify:
   - **Modules to change** — which existing files need modification and why.
   - **Pattern consistency** — do proposed changes align with existing conventions?
   - **Impact scope** — what else might break or need updating?
3. Determine:
   - `files_to_modify` — existing files that need changes.
   - `files_to_create` — new files needed (if any).
4. Write a `summary` covering:
   - Approach: how the task will be accomplished.
   - Key decisions and rationale.
   - Risks or trade-offs.

#### For `new` projects:

1. Propose:
   - **Directory structure** — where code will live.
   - **Key modules** — what the main components are.
   - **Design decisions** — patterns, libraries, conventions.
2. Determine:
   - `files_to_modify` — typically empty for new projects.
   - `files_to_create` — all files to be created.
3. Write a `summary` covering:
   - Architecture overview.
   - Key decisions and rationale.
   - Dependencies (if any).

### 3.5. Plan Review (external model review)

Get a second opinion from an external model before sharing the blueprint with the user.

1. **Check config**: Read `review_cli` from `cat ~/.maetdol/config.json 2>/dev/null`.
   - If configured → proceed to step 2.
   - If not configured → skip review. Proceed to Step 4.

2. **Compose review prompt** as a shell variable `PROMPT` containing:
   - gate.refined_task
   - Blueprint summary, files_to_modify, files_to_create
   - Instruction: "Review this coding task blueprint. Identify potential issues, missing considerations, and better approaches. Be concise — 10 bullets max."

3. **Execute CLI** (Bash):
   `echo "$PROMPT" | <review_cli> <review_cli_flags>`
   Timeout: 120 seconds. On failure/timeout → skip review and proceed to Step 4.

4. **Save review results**: Retain CLI output to present alongside the blueprint in Step 4.

### 4. Present to User

Output the blueprint summary in a clear format:

```
## Blueprint Summary

<Approach and key decisions>

## Files to Modify
- <file path> — <what changes and why>

## Files to Create
- <file path> — <purpose>

## External Review
<review CLI output, or "Skipped — review CLI not configured">

## Risks / Trade-offs
- <any notable risks>
```

After presenting the blueprint, use `AskUserQuestion` to get the user's decision:
- Question: "How should we proceed with this blueprint?"
- Header: "Blueprint"
- Options:
  1. Label: "Approve", Description: "Accept the blueprint and continue to execution"
  2. Label: "Revise", Description: "Request specific changes to the blueprint"
  3. Label: "Cancel", Description: "Cancel this session"

- If **Approve**: Call `maetdol_blueprint` to record (Step 5). In pipeline mode, automatically continue. In standalone mode, instruct user to run `/maetdol-run`.
- If **Revise**: Incorporate the user's requested changes, regenerate blueprint, present again.
- If **Cancel**: Do not record. Session remains in `blueprint` phase for later resumption.

### 5. Record Blueprint

Call `maetdol_blueprint` with `{ session_id, summary, files_to_modify, files_to_create }`.

The server stores the blueprint and advances the phase to `stories`.

## Session Mode

When called from the maetdol orchestration skill:
- Session context is automatically available.
- The server enforces phase guard — `maetdol_blueprint` only works when `session.phase === 'blueprint'`.
- After recording, the session advances to `stories` phase.

## Important Behaviors

- Never skip the user confirmation step unless the blueprint is being skipped entirely.
- Keep the summary concise — focus on decisions that affect decomposition, not implementation details.
- For existing projects, always read the relevant files before producing the blueprint. Don't guess at patterns.
- If `relevant_files` is empty for an existing project, do a quick codebase scan before producing the blueprint.
