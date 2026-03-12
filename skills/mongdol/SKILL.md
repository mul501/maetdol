---
name: mongdol
description: Post-completion polishing — targeted adjustments based on archive context and git diff
user-invocable: true
---

# Mongdol (몽돌) — Post-Completion Polishing

Lightweight polishing command for targeted adjustments. Uses archived maetdol session context + git diff to scope and execute small fixes without re-running the full pipeline.

Triggered by: `/mongdol "description"` or `/mongdol` (resume active session)

## Context Compression Resilience

When resuming after context compression:

1. Call `maetdol_session` with `{ action: "resume", project_id, type: "mongdol" }`.
2. Read the `checkpoint` field from `resume_point`.
3. Route to the correct sub-step:
   - `decompose:N_items` → Step 3 completed, go to Step 4
   - `polish:itemN/total:done` → Step 4 in progress, continue from item N+1
   - `null` or unrecognized → fall back to phase-level routing

## Argument Parsing

Parse the user's input for:
- **Description**: The main argument (required for new sessions, not for resume)
- **`--files`**: Optional space-separated file list to override scope (e.g., `--files src/foo.ts src/bar.ts`)

If no arguments and no active mongdol session exists → error: "Usage: `/mongdol \"description\"` or `/mongdol` to resume."

## Flow

### Step 0: Identify Project

1. Run `git remote get-url origin` in the current working directory.
2. If successful: project_id = SHA-256 of the URL, first 8 hex chars.
3. If failed (no git/no remote): project_id = SHA-256 of absolute cwd, first 8 hex chars.

### Step 1: Context Collection + Resume Check

1. Call `maetdol_session` with `{ action: "resume", project_id, type: "mongdol" }`.
2. If active session exists:
   - Read `checkpoint` for sub-step routing.
   - Jump to Step 4 (or correct sub-step per checkpoint).
3. If no active session — continue:
   - **Archive query**: Call `maetdol_session` with `{ action: "list_archives", project_id }`.
   - **If archives exist**: Extract from the most recent archive:
     - Task titles and acceptance criteria
     - Verify results per task
     - Relevant files (from gate phase)
     - Refined task description
     - Store as `archive_context`.
   - **If no archives**: Run `git diff HEAD~1 --name-only` to get recently changed files → `fallback_files`.

### Step 2: Scope Analysis

1. Analyze the user's problem description together with `archive_context` (or `fallback_files`).
2. **If archive exists**:
   - Match the user's description to specific tasks from the archive.
   - Identify which files are relevant based on the matched tasks and `relevant_files`.
3. **If no archive**:
   - Match the user's description against `fallback_files`.
   - Read the matched files to understand current implementation.
4. **If `--files` override provided**: Use those files directly (skip matching).
5. Read identified files to understand current implementation state.
6. Determine `scope_files` (the files that need modification) and write a brief `scope_summary`.

### Step 3: Session Creation + Decompose

1. Call `maetdol_session` with `{ action: "create", type: "mongdol", task: "<user's description>", project_id, scope_files }`.
   - If an active mongdol session already exists, the server returns it with a suggestion to resume → follow the suggestion.
2. Analyze: `scope_summary` + user's description + `archive_context`.
3. Decompose into 1–5 discrete polish items. For each:
   - Clear `title` describing the adjustment
   - Specific `acceptance_criteria`
   - `testable: false` (polishing skips TDD)
   - `depends_on: []` (always independent)
4. **If more than 5 items**: Ask the user — proceed as-is, or use `/maetdol` for the full pipeline?
5. Call `maetdol_tasks` with `{ action: "decompose", session_id, tasks: [...] }`.
6. **Checkpoint**: `maetdol_session save_checkpoint` → `"decompose:<N>_items"`.

### Step 4: Execute Polish Items (Ralph Loop)

Capture the current diff for context: `git diff HEAD~1` (or use `git_ref_range` if set).

**For each item:**

1. Call `maetdol_tasks` with `{ action: "next", session_id }` → next pending item.
2. If no items remain → go to Step 5.
3. Spawn the **polisher** agent with:
   - `session_id`, `task_id` from the task
   - `title`, `acceptance_criteria` from the task
   - `scope_files` from the session
   - `scope_diff`: the captured git diff
   - `project_context`: build/test commands, conventions
4. Based on the polisher's returned outcome:
   - **completed** → `maetdol_tasks { action: "update", session_id, task_id, status: "completed" }`.
   - **skipped** → `maetdol_tasks { action: "update", session_id, task_id, status: "skipped" }`. Log the reason.
5. **Checkpoint**: `maetdol_session save_checkpoint` → `"polish:item<N>/<total>:done"`.
6. Continue to next item (return to 4.1).

### Step 5: Verification

1. Run the project's test suite (e.g., `npm test`, `pytest`, `go test ./...`). Skip if no test suite.
2. Run build/typecheck (e.g., `npm run build`, `npm run typecheck`).
3. **All pass** → proceed to Step 6.
4. **Failure** → attempt 1 fix cycle:
   - Analyze the failure, apply a targeted fix.
   - Re-run the failing command.
   - If still failing → report to user with error details. Do not loop further.

### Step 6: Complete

1. Call `maetdol_session` with `{ action: "complete", session_id }`.
2. Output summary:

```
## mongdol complete

| Item | Status |
|------|--------|
| <title> | completed / skipped (reason) |
| ... | ... |

**Tests**: passed / failed / skipped
**Build**: passed / failed / skipped
```

## Execution Model

Once started, all steps execute **continuously without interruption**. Never ask "Should we continue?" or "Ready to proceed?" — just execute.

## Error Handling

- If any `maetdol_*` tool call fails, report the error and attempt recovery.
- If the session is corrupted, offer to start fresh with `/mongdol "description"`.
- Never re-execute completed items. Always read session state before acting.
