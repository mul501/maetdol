---
name: maetdol-run
description: Execute maetdol pipeline from current phase through completion
---

# Run Skill

Executes the maetdol pipeline from the current session phase through completion. Use `/maetdol-run` to resume after design approval or any interrupted session.

## When to Use

- After `/maetdol` or `/maetdol-design` completes the design phase and the user wants to continue.
- After a context loss (compression, restart) when the session is mid-pipeline.
- Any time a session exists and needs to proceed from its current phase.

## Flow

### Step 0: Identify Project

1. Run `git remote get-url origin` in the current working directory.
2. If successful: project_id = SHA-256 of the URL, first 8 hex chars.
3. If failed (no git/no remote): project_id = SHA-256 of absolute cwd, first 8 hex chars.

### Step 1: Resume Session

Call `maetdol_session` with `{ action: "resume", project_id: "<project_id>" }`.

- If no active session exists: report error — "No active session found. Start a new session with `/maetdol`."
- Read the returned `phase`, `session_id`, `current_task_id`, and `iteration` fields.

### Step 2: Phase Router

Route to the appropriate step based on the current phase:

| Phase | Action |
|-------|--------|
| `gate` | Error: "Gate not yet passed. Run `/maetdol` first." |
| `design` | If `session.design` exists (design recorded), proceed to Step 3. Otherwise error: "Design not yet completed. Run `/maetdol-design` first." |
| `stories` | Proceed to Step 3 |
| `decompose` | Proceed to Step 4 |
| `ralph` | Proceed to Step 5 |
| `verify` | Proceed to Step 6 |
| `completed` | "Session already completed." |

## Execution Model

Once started, all phases execute **continuously without interruption**. Never ask confirmation questions like "Should we continue?", "Ready to start?", or "Is it okay to proceed?"

### Step 3: Stories (optional — structure requirements as User Stories)

For complex tasks that will decompose into 3+ subtasks, structure the refined requirements into User Stories first. **Skip this step for simple tasks (1-2 subtasks) — go directly to Step 4.**

1. Analyze the gated requirements and identify independent units of user value.
2. Each story should have:
   - A clear title ("As a user, I want...")
   - Testable `acceptance_criteria` (story-level, not implementation-level)
   - Dependencies on other stories via `depends_on`
3. Call `maetdol_tasks` with `{ action: "decompose_stories", session_id: "<id>", stories: [{ id: "US-001", title, acceptance_criteria, depends_on }] }`.
4. The server stores stories and advances phase to `decompose`.

### Step 4: Decompose (break stories/task into executable subtasks)

Break the refined task (or each story) into executable subtasks.

1. Analyze the requirements and break them into ordered subtasks.
2. For each task, define `acceptance_criteria` — testable conditions that prove the task is done:
   - **Testable**: Verifiable by running a command or checking output.
   - **Specific**: References concrete values, file names, or behaviors.
   - **Forbidden**: "works correctly", "implementation complete", or other vague phrases.
   - Simple tasks (typo fixes, etc.) may have an empty criteria array — ralph will verify by inspection.
3. If stories exist, link each task to its parent story via `story_id`.
4. Tag each task as `testable`:
   - Code changes (`.ts`, `.py`, `.go`, etc.) → `testable: true`
   - Documentation, config, or asset changes → `testable: false`
   - Refactoring with existing test coverage → `testable: false` (existing tests act as guard)
5. Call `maetdol_tasks` with `{ action: "decompose", session_id: "<id>", tasks: [{ id, title, depends_on, acceptance_criteria, story_id, testable }] }`.
6. The server stores the task list and returns task IDs with criteria progress tracking.

### Step 5: Ralph Loop (Execute Each Task)

Iterate through subtasks one by one.

**For each task:**

1. Call `maetdol_tasks` with `{ action: "next", session_id: "<id>" }` to get the next pending task.
2. If no tasks remain, go to Step 5b (or Step 6 if no stories).
3. **If the task is testable**, run the TDD cycle (see ralph skill's "TDD Flow" section):
   - RED: write failing test → `ralph_iterate` with `tdd_phase="red"`
   - GREEN: minimal implementation → `ralph_iterate` with `tdd_phase="green"`
   - REFACTOR: clean up → `ralph_iterate` with `tdd_phase="refactor"`
4. **If the task is not testable**, execute using standard Claude Code tools (Read, Edit, Write, Bash, etc.).
5. **Verify** the result — run tests, check output, confirm the change is correct.
6. **Record** the result via `maetdol_ralph_iterate`:
   - **Pass:** `{ session_id: "<id>", task_id: <id>, verify_result: "pass", evidence: "<actual output>", criteria_met: [0, 2] }`.
   - **Fail:** `{ session_id: "<id>", task_id: <id>, verify_result: "fail", error_hash: "<sha256 prefix>", error_summary: "<one-line description>" }`.
7. **On pass:** Call `maetdol_tasks` with `{ action: "update", session_id: "<id>", task_id: <id>, status: "completed" }`. Return to step 5.1.
8. **On fail + should_continue:** Fix the issue and go to step 5.5.
9. **On fail + stagnation detected:** Invoke the **unstuck** skill to get alternative approaches, then retry from step 5.5.
10. **On fail + max iterations (5) reached:** Call `maetdol_tasks` with `{ action: "update", session_id: "<id>", task_id: <id>, status: "skipped" }`. Log the reason and move to the next task.

### Step 5b: Story Verification (if stories exist)

When all tasks in a story complete, the server sets the story status to `ready_for_verify` (awaiting verification).

1. For each story with status `ready_for_verify`:
   - Verify each story-level `acceptance_criteria` one by one.
   - Call `maetdol_tasks` with `{ action: "verify_story", session_id: "<id>", story_id: "US-001", criteria_met: [0, 1, 2], evidence: "<actual output>" }`.
2. If story criteria are not fully met:
   - Create additional tasks to address unmet criteria.
   - Return to Step 5 to execute them.
3. Once all stories are verified, proceed to Step 6.

### Step 6: Final Verification

After all tasks are processed:

1. Review the full set of changes made during the session.
2. Run the project's test suite if one exists.
3. Verify no regressions were introduced.
4. Check that skipped tasks (if any) don't block the overall goal.

### Step 7: Complete Session

1. Call `maetdol_session` with `{ action: "complete", session_id: "<id>" }`.
2. Summarize what was accomplished, what was skipped, and any remaining work.

## Error Handling

- If any `maetdol_*` tool call fails, report the error to the user and attempt recovery.
- If the session is corrupted, offer to create a new session with `/maetdol`.
- Never re-execute completed tasks. Always read the session state before acting.
