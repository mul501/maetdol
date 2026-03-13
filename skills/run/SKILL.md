---
name: maetdol-run
description: Execute maetdol pipeline from current phase through completion
user-invocable: false
---

# Run Skill

Executes the maetdol pipeline from the current session phase through completion. Use `/maetdol-run` to resume after blueprint approval or any interrupted session.

## Context Compression Resilience

After context compression, the active session hook outputs a reminder with session ID and checkpoint.
When you see this reminder (or when resuming any session):

1. Call `maetdol_session` with `{ action: "resume", ... }`.
2. Read the `checkpoint` field from `resume_point`.
3. Route to the correct **sub-step** within the phase — not just the phase start:
   - `stories:N_stories` → Step 3 completed, go to Step 4
   - `decompose:N_tasks` → Step 4 completed, go to Step 5
   - `ralph:taskN/total:done` → Step 5 in progress, continue from task N+1
   - `stories_verified` → Step 5b completed, go to Step 6
   - `verify:tests_passed` → Step 6.1 done, continue from Step 6.2
   - `verify:build_passed` → Step 6.2 done, continue from Step 6.3
   - `verify:review_done` → Step 6.3 done, continue from Step 6.5
   - `verify:simplified` → Step 6.5 done, continue from Step 6.6
   - `null` or unrecognized → fall back to phase-level routing (Step 2)

## When to Use

- After `/maetdol` or `/maetdol-blueprint` completes the blueprint phase and the user wants to continue.
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
| `blueprint` | If `session.blueprint` exists (blueprint recorded), proceed to Step 3. Otherwise error: "Blueprint not yet completed. Run `/maetdol-blueprint` first." |
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
5. **Checkpoint**: Call `maetdol_session` with `{ action: "save_checkpoint", session_id: "<id>", checkpoint: "stories:<N>_stories" }`.

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
7. **Checkpoint**: Call `maetdol_session` with `{ action: "save_checkpoint", session_id: "<id>", checkpoint: "decompose:<N>_tasks" }`.

### Step 5: Ralph Loop (Execute Each Task)

Iterate through subtasks one by one. Each task is dispatched to the **executor** agent (Sonnet) for cost-efficient execution.

**For each task:**

1. Call `maetdol_tasks` with `{ action: "next", session_id: "<id>" }` to get the next pending task.
2. If no tasks remain, go to Step 5b (or Step 6 if no stories).
3. Spawn the **executor** agent with:
   - `session_id`, `task_id` from the task
   - `title`, `acceptance_criteria`, `testable` from the task
   - `relevant_files` from blueprint phase (if available in `session.blueprint`)
   - `project_context`: build/test commands, conventions from the project
4. Based on the executor's returned outcome:
   - **completed** → Call `maetdol_tasks` with `{ action: "update", session_id: "<id>", task_id: <id>, status: "completed" }`.
   - **skipped** → Call `maetdol_tasks` with `{ action: "update", session_id: "<id>", task_id: <id>, status: "skipped" }`. Log the reason.
   - **stagnation** → Call `maetdol_tasks` with `{ action: "update", session_id: "<id>", task_id: <id>, status: "skipped" }`. Log what was tried.
   - **no response / error** → Mark task as skipped with reason "executor failed". Log the error and proceed to next task.
5. **Checkpoint**: Call `maetdol_session` with `{ action: "save_checkpoint", session_id: "<id>", checkpoint: "ralph:task<N>/<total>:done" }` (where N = completed task number, total = total tasks).
6. Proceed to the next task (return to step 5.1).

### Step 5b: Story Verification (if stories exist)

When all tasks in a story complete, the server sets the story status to `ready_for_verify` (awaiting verification).

```
verify_round = 0

VERIFY_LOOP:
```

1. For each story with status `ready_for_verify`:
   - Collect `git diff` for the story's tasks.
   - Spawn a **verifier** agent (`subagent_type="maetdol:verifier"`, model: Haiku) with:
     - Story title + `acceptance_criteria`
     - The collected git diff
     - Project build/test commands
   - **Do NOT pass** the executor's evidence, error_history, or implementation plan.

2. If `verifier.overall === "pass"`:
   - Call `maetdol_tasks` with `{ action: "verify_story", session_id: "<id>", story_id: "US-001", criteria_met: [verified indices], evidence: "<verifier's evidence>" }`.
   - Proceed to next story.

3. If `verifier.overall === "fail"`:
   - Increment `verify_round`.
   - If `verify_round > 2` (MAX_VERIFY_ROUNDS):
     - Report to user: "Independent verification failed 2 times. UNVERIFIED criteria: [list from verifier]"
     - Stop and await user decision.
   - Otherwise:
     - For each UNVERIFIED criterion, create a remediation task with the verifier's rejection reason in its context.
     - Call `maetdol_tasks` with `{ action: "decompose", ... }` to register remediation tasks.
     - Return to Step 5 (ralph loop executes remediation tasks).
     - When remediation completes, story returns to `ready_for_verify`.
     - GOTO VERIFY_LOOP.

4. Once all stories are verified:
   - **Checkpoint**: Call `maetdol_session` with `{ action: "save_checkpoint", session_id: "<id>", checkpoint: "stories_verified" }`.
   - Proceed to Step 6.

### Step 6: Final Verification

After all tasks are processed, run verification inline:

1. **Run test suite** — execute the project's test command (e.g., `npm test`, `pytest`, `go test ./...`). Record full output. Skip if no test suite exists.
   - On pass: **Checkpoint**: `maetdol_session save_checkpoint` → `"verify:tests_passed"`.
2. **Run build** — execute the project's build/typecheck command (e.g., `npm run build`, `npm run typecheck`). Record full output.
   - On pass: **Checkpoint**: `maetdol_session save_checkpoint` → `"verify:build_passed"`.
3. **Code review checkpoint** — **Skip if test suite or build failed above.**
   Capture the full diff once: `git diff {session_start_ref}`.
   If the diff exceeds 5000 lines, use `git diff --stat {session_start_ref}` instead — pass only the stat summary to the agent.
   Then spawn a `superpowers:code-reviewer` agent (`subagent_type="superpowers:code-reviewer"`) with:
   > Review the complete implementation against the original plan.
   >
   > ## Task
   > {refined_task from session}
   >
   > ## Blueprint
   > {summary from session.blueprint}
   >
   > ## Diff
   > {captured diff content, or --stat summary if over 5000 lines}
   >
   > Verify: implementation matches the plan, no scope creep, no missed requirements.
   > Maximum 10 findings. Focus on plan alignment and correctness.

   If the agent reports critical/high findings, present them to the user before completing.
   Low/medium findings are noted in the completion summary.
   - **Checkpoint**: `maetdol_session save_checkpoint` → `"verify:review_done"`.

3.5. **Independent criteria verification** — **Only for sessions without stories. Skip if stories exist (Step 5b already verified).**
   Re-derive which tasks need verification from session state (resilient to context compression):
   - Call `maetdol_tasks` with `{ action: "list", session_id: "<id>" }` to get current task list.
   - For each completed task, check: does it have non-empty `acceptance_criteria`?
   - If no tasks have acceptance criteria, skip this step.

   ```
   verify_round = 0

   FINAL_VERIFY_LOOP:
   ```

   1. Collect acceptance_criteria from completed tasks that have non-empty `acceptance_criteria`.
   2. Spawn a **verifier** agent (`subagent_type="maetdol:verifier"`, model: Haiku) with:
      - The warned/unverified criteria list
      - Full `git diff {session_start_ref}`
      - Project build/test commands
      - **Do NOT pass** executor's evidence or error_history.

   3. If `verifier.overall === "pass"`:
      - Verification complete, continue to step 4.

   4. If `verifier.overall === "fail"`:
      - Increment `verify_round`.
      - If `verify_round > 2` (MAX_VERIFY_ROUNDS):
        - Report to user: "Independent verification failed 2 times. UNVERIFIED criteria: [list]"
        - Stop and await user decision.
      - Otherwise:
        - Spawn an **executor** agent with:
          - UNVERIFIED criteria + verifier's rejection reasons
          - Relevant files (from diff)
          - Context: "Verifier rejected for: [reasons]. Fix required."
        - After executor completes, GOTO FINAL_VERIFY_LOOP.

4. **Regression check** — analyze the same diff captured in step 3 for unintended side effects, broken imports, or files that shouldn't have changed.
5. **Skipped task assessment** — if any tasks were skipped, assess whether they block the overall goal.
6. Report findings to the user before completing the session.

### Step 6.5: Code Simplification (only if Step 6 verification passed)

Skip this step if test suite or build failed in Step 6.

Invoke the built-in `simplify` skill via `Skill(skill: "simplify")`.
The skill reviews changed code for reuse, quality, and efficiency, then applies fixes.

Include the simplification results in the Step 7 completion output.

**Checkpoint**: `maetdol_session save_checkpoint` → `"verify:simplified"`.

### Step 6.6: Final External Review (optional — external CLI only)

**Skip this step if:**
- Step 6 tests or build failed
- `~/.maetdol/config.json` has no `review_cli` configured

1. Read `review_cli` and `review_cli_flags` from `~/.maetdol/config.json`.
   - If not configured → skip to Step 7.
2. Capture full diff: `git diff {session_start_ref}`.
   If the diff exceeds 5000 lines, use `git diff --stat {session_start_ref}` instead.
   (Reuse from Step 6.3 if already captured.)
3. Compose review prompt:
   ```
   You are reviewing a completed implementation. Focus on bugs, security issues, and missing error handling.

   ## Task
   <refined_task from session>

   ## Diff
   <full diff, or --stat if >5000 lines>

   For each finding: state the problem, severity (critical/high/medium), and suggested fix.
   Maximum 10 findings. Skip style and formatting issues.

   ## Output Format
   Begin your response with "## Review Findings" on its own line.
   End your response with "## End Review" on its own line.
   Include ONLY your findings between these markers — no preamble, no summary, no metadata.
   ```
4. **Start external review** via `maetdol_review_exec` with `{ action: "start", session_id: "<session_id>", review_type: "final", prompt: PROMPT }`.
   On error → skip to Step 7.
5. **Run internal review in parallel**: Spawn a `superpowers:code-reviewer` agent with the same diff and task context. Focus on bugs, security, and missing error handling. Maximum 10 findings.
6. **Await external review**: Call `maetdol_review_exec` with `{ action: "check", session_id: "<session_id>", review_type: "final" }`.
   - `status: "completed"` → read review file: `Read(review_file)`. Combine external + internal findings.
   - `status: "not_started"` → external review was not started or config missing. Use internal results only.
   - `status: "in_progress"` → poll: wait 30 seconds (`sleep 30`), then check again.
     Repeat until completed. The server's `DEFAULT_REVIEW_TIMEOUT` (default 30 minutes) is the only timeout — when the server kills the process, the next check returns `status: "completed"` (with `exit_code: -1`), ending the loop naturally. Do NOT add a skill-level timeout.
7. For actionable issues (bugs, security, missing error handling):
   - Apply fixes directly.
   - Re-run tests to confirm no regression.
8. Include combined review findings and any fixes in the Step 7 completion summary.

### Step 7: Complete Session

1. Call `maetdol_session` with `{ action: "complete", session_id: "<id>" }`.
2. Summarize what was accomplished, what was skipped, and any remaining work.

## Error Handling

- If any `maetdol_*` tool call fails, report the error to the user and attempt recovery.
- If the session is corrupted, offer to create a new session with `/maetdol`.

- Never re-execute completed tasks. Always read the session state before acting.
