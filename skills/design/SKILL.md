---
name: maetdol-design
description: Requirements analysis and architecture design for a maetdol session
---

# Design Skill

Analyzes requirements and produces an architecture design before task decomposition. Can run standalone via `/maetdol-design` or as part of the full maetdol pipeline.

## Independent Mode

Triggered by: `/maetdol-design`

Requires an active session in `design` phase. If no session exists, instruct the user to run `/maetdol-gate` first.

## Flow

### 1. Load Session Context

Read the session to get:
- `gate.refined_task` — the gated task description
- `gate.project_type` — `'new'` or `'existing'` (may be absent for simple tasks)
- `gate.relevant_files` — files discovered during gate exploration (may be empty)
- `gate.score` — ambiguity score

### 2. Decide: Skip or Design

**Skip conditions** (all must be true):
- `gate.score < 0.15` (very clear task)
- `relevant_files` has 2 or fewer entries (small scope)

If skipping:
- Call `maetdol_design` with `{ session_id, skip: true }`.
- Output: "Design skipped — task is simple enough for direct decomposition."
- Done.

### 3. Design (when not skipping)

#### For `existing` projects:

1. Read `relevant_files` to understand current patterns and conventions.
2. Identify:
   - **Modules to change** — which existing files need modification and why.
   - **Pattern consistency** — do proposed changes align with existing conventions?
   - **Impact scope** — what else might break or need updating?
3. Determine:
   - `files_to_modify` — existing files that need changes.
   - `files_to_create` — new files needed (if any).
4. Write a `summary` covering:
   - Approach: how the task will be accomplished.
   - Key design decisions and rationale.
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
   - Key design decisions and rationale.
   - Dependencies (if any).

### 4. Present to User

Output the design summary in a clear format:

```
## Design Summary

<Approach and key decisions>

## Files to Modify
- <file path> — <what changes and why>

## Files to Create
- <file path> — <purpose>

## Risks / Trade-offs
- <any notable risks>
```

Ask the user to confirm or adjust before proceeding. This is the **only user checkpoint** in the entire maetdol pipeline. After the user confirms, return control to the orchestrator without asking any additional questions.

### 5. Record Design

Call `maetdol_design` with `{ session_id, summary, files_to_modify, files_to_create }`.

The server stores the design and advances the phase to `stories`.

## Session Mode

When called from the maetdol orchestration skill:
- Session context is automatically available.
- The server enforces phase guard — `maetdol_design` only works when `session.phase === 'design'`.
- After recording, the session advances to `stories` phase.

## Important Behaviors

- Never skip the user confirmation step unless the design is being skipped entirely.
- Keep the summary concise — focus on decisions that affect decomposition, not implementation details.
- For existing projects, always read the relevant files before designing. Don't guess at patterns.
- If `relevant_files` is empty for an existing project, do a quick codebase scan before designing.
