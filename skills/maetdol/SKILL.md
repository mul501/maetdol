---
name: maetdol
description: Full productivity pipeline — gate, decompose, ralph loop, verify, complete
---

# Maetdol Orchestration Skill

Entry point for the `/maetdol` command. Runs the full pipeline: session management, ambiguity gate, task decomposition, iterative execution with ralph loops, and session completion.

## Flow Overview

```
session create/resume → gate → [stories] → decompose → [ralph loop per task] → [story verify] → final verify → session complete
```

The `stories` phase is optional — only for complex tasks with 3+ subtasks. Simple tasks skip directly to `decompose`.

## Step 1: Session

Determine whether to create a new session or resume an existing one.

**New session:**
- Call `maetdol_session` with `{ action: "create", task: "<user's task description>" }`.
- Store the returned `session_id` for all subsequent calls.

**Resume session:**
- Call `maetdol_session` with `{ action: "resume", project_hash: "<hash>" }`.
- Read the returned `phase`, `current_task_id`, and `iteration` fields.
- Jump directly to the corresponding step below (skip completed phases).

**Get session info:**
- Call `maetdol_session` with `{ action: "get", session_id: "<id>" }` to inspect current state without modifying it.

## Step 2: Gate (Ambiguity Check)

Before any work begins, verify the task is well-defined.

1. Call `maetdol_score_ambiguity` with `{ context: "<task description + any gathered context>", round: 1, goal: <score>, constraints: <score>, criteria: <score>, context_clarity: 0, suggestions: [<questions>], session_id: "<id>" }`.
2. If the score indicates the task **passes** the gate:
   - Proceed to Step 3 with the refined requirements from the response.
3. If the score indicates the task **does not pass**:
   - Spawn the **interviewer** agent to ask the user socratic clarifying questions. Pass `weakest_dimension` from the response so questions target the weakest area.
   - After the user answers, call `maetdol_score_ambiguity` again with `{ context: "<original + answers>", round: 2, goal: <score>, constraints: <score>, criteria: <score>, context_clarity: <score>, suggestions: [<questions>], session_id: "<id>" }`.
   - Repeat up to 3 rounds. If still ambiguous after round 3, proceed with best-effort requirements and note the remaining ambiguities.

## Step 3a: Stories (optional — structure requirements as User Stories)

For complex tasks that will decompose into 3+ subtasks, structure the refined requirements into User Stories first. **Skip this step for simple tasks (1-2 subtasks) — go directly to Step 3b.**

1. Analyze the gated requirements and identify independent units of user value.
2. Each story should have:
   - A clear title ("As a user, I want...")
   - Testable `acceptance_criteria` (story-level, not implementation-level)
   - Dependencies on other stories via `depends_on`
3. Call `maetdol_tasks` with `{ action: "decompose_stories", session_id: "<id>", stories: [{ id: "US-001", title, acceptance_criteria, depends_on }] }`.
4. The server stores stories and advances phase to `decompose`.

## Step 3b: Decompose (break stories/task into executable subtasks)

Break the refined task (or each story) into executable subtasks.

1. Analyze the requirements and break them into ordered subtasks.
2. For each task, define `acceptance_criteria` — testable conditions that prove the task is done:
   - **Testable**: Verifiable by running a command or checking output.
   - **Specific**: References concrete values, file names, or behaviors.
   - **Forbidden**: "works correctly", "implementation complete", or other vague phrases.
   - Simple tasks (typo fixes, etc.) may have an empty criteria array — ralph will verify by inspection.
3. If stories exist, link each task to its parent story via `story_id`.
4. Call `maetdol_tasks` with `{ action: "decompose", session_id: "<id>", tasks: [{ id, title, depends_on, acceptance_criteria, story_id }] }`.
5. The server stores the task list and returns task IDs with criteria progress tracking.

## Step 4: Ralph Loop (Execute Each Task)

Iterate through subtasks one by one.

**For each task:**

1. Call `maetdol_tasks` with `{ action: "next", session_id: "<id>" }` to get the next pending task.
2. If no tasks remain, go to Step 4b (or Step 5 if no stories).
3. **Execute** the task using standard Claude Code tools (Read, Edit, Write, Bash, etc.).
4. **Verify** the result — run tests, check output, confirm the change is correct.
5. **Record** the result via `maetdol_ralph_iterate`:
   - **Pass:** `{ session_id: "<id>", task_id: <id>, verify_result: "pass", evidence: "<actual output>", criteria_met: [0, 2] }`.
   - **Fail:** `{ session_id: "<id>", task_id: <id>, verify_result: "fail", error_hash: "<sha256 prefix>", error_summary: "<one-line description>" }`.
6. **On pass:** Call `maetdol_tasks` with `{ action: "update", session_id: "<id>", task_id: <id>, status: "completed" }`. Return to step 4.1.
7. **On fail + should_continue:** Fix the issue and go to step 4.4.
8. **On fail + stagnation detected:** Invoke the **unstuck** skill to get alternative approaches, then retry from step 4.4.
9. **On fail + max iterations (5) reached:** Call `maetdol_tasks` with `{ action: "update", session_id: "<id>", task_id: <id>, status: "skipped" }`. Log the reason and move to the next task.

## Step 4b: Story Verification (if stories exist)

When all tasks in a story complete, the server sets the story status to `in_progress` (awaiting verification).

1. For each story with status `in_progress`:
   - Verify each story-level `acceptance_criteria` one by one.
   - Call `maetdol_tasks` with `{ action: "verify_story", session_id: "<id>", story_id: "US-001", criteria_met: [0, 1, 2], evidence: "<actual output>" }`.
2. If story criteria are not fully met:
   - Create additional tasks to address unmet criteria.
   - Return to Step 4 to execute them.
3. Once all stories are verified, proceed to Step 5.

## Step 5: Final Verification

After all tasks are processed:

1. Review the full set of changes made during the session.
2. Run the project's test suite if one exists.
3. Verify no regressions were introduced.
4. Check that skipped tasks (if any) don't block the overall goal.

## Step 6: Complete Session

1. Call `maetdol_session` with `{ action: "complete", session_id: "<id>" }`.
2. Summarize what was accomplished, what was skipped, and any remaining work.

## Session Recovery

When resuming a session, the server returns the exact state:

| Phase | Recovery Action |
|-------|----------------|
| `gate` | Re-run gate from round 1 (round context is not persisted server-side) |
| `stories` | Stories already exist, skip to decompose |
| `decompose` | Task list already exists, skip to ralph loop |
| `ralph` | Read `current_task_id` and `iteration`, resume ralph loop from that point |
| `verify` | Re-run final verification |

Never re-execute completed tasks. Always read the session state before acting.

## Error Handling

- If any `maetdol_*` tool call fails, report the error to the user and attempt recovery.
- If the session is corrupted, offer to create a new session.
- Never silently skip the gate phase — ambiguity checking is mandatory.
