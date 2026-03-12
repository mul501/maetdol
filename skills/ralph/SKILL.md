---
name: maetdol-ralph
description: Iterative verify-fix-verify loop with stagnation detection
user-invocable: false
---

# Ralph Skill

Runs a verify-fix-verify loop on the current task or most recent changes. Named after the "wreck it, fix it" pattern. Can run standalone via `/maetdol-ralph` or as part of the full maetdol pipeline.

## Independent Mode

Triggered by: `/maetdol-ralph`

Uses the current conversation context to determine what needs verification. Looks at:
- Most recent file changes (git diff)
- Most recent error messages in the conversation
- The task being worked on

## Flow

### 1. Verify

Run verification appropriate to the context:
- If tests exist: run them.
- If a build step exists: run it.
- If the task has explicit success criteria: check them.
- If none of the above: review the changes for correctness.

### 2. Evaluate Result

- **All checks pass:** Done. Report success.
- **Failure detected:** Continue to fix step.

### 3. Fix

Analyze the error and apply a fix using standard Claude Code tools (Read, Edit, Write, Bash).

### 4. Loop

Return to step 1. Track the iteration count.

## Safety Valve

**Maximum 5 iterations.** After 5 failed verify-fix cycles:
- Stop attempting fixes.
- Report what was tried and what failed.
- In session mode: mark the task as skipped via `maetdol_tasks` with `{ action: "update", session_id, task_id, status: "skipped" }`.

## Stagnation Detection

After each failed iteration, hash the error text and track it.

**If 3 consecutive iterations produce the same error hash:**
1. The approach is not working. Stop the current fix strategy.
2. **MANDATORY**: Use the Skill tool to invoke: `maetdol:unstuck` to get alternative approaches.
3. Apply the suggested alternative.
4. Resume the verify-fix loop (iteration count continues, does not reset).

In independent mode, stagnation detection is done locally by comparing error outputs within the conversation.

## Session Mode

When called from the maetdol orchestration skill, use server-side tracking:

- Call `maetdol_ralph_iterate` after each verification step:
  - **Pass:** `{ session_id, task_id, verify_result: "pass", evidence: "<actual terminal output, ~500 chars>", criteria_met: [0, 2] }` (indices of acceptance_criteria verified).
  - **Fail:** `{ session_id, task_id, verify_result: "fail", error_hash: "<sha256 prefix>", error_summary: "<one-line description>" }`.
- **Evidence rules**: "tests pass" or similar summaries are forbidden. Paste actual stdout/stderr from `npm test`, `npm run build`, or equivalent.
- **criteria_met**: Pass the indices (0-based) of the task's `acceptance_criteria` that were verified in this iteration.
- The server tracks iteration count, error history, evidence, and criteria results.
- The server's response indicates whether stagnation is detected.
- Call `maetdol_detect_stagnation` with `{ error_hashes: [<recent hashes>], output_hashes: [<recent output hashes>] }` for explicit stagnation checks if needed.

## TDD Flow (testable tasks)

For tasks tagged `testable: true`, follow the RED→GREEN→REFACTOR cycle before the normal verify flow:

### 1. RED — Write a failing test

- Write the minimum test that covers the task's `acceptance_criteria`.
- Run the test — it **must fail**.
- Call `maetdol_ralph_iterate` with `{ tdd_phase: "red", verify_result: "fail", error_hash, error_summary }`.
- The server records the expected failure without adding it to error history.
- If the test passes: the test is wrong. Fix the test and retry RED.

### 2. GREEN — Minimal implementation

- Write the simplest code that makes the test pass. No over-engineering.
- Run the test — it **must pass**.
- Call `maetdol_ralph_iterate` with `{ tdd_phase: "green", verify_result: "pass", evidence }`.
- On failure: normal fix loop applies (stagnation detection active).

### 3. REFACTOR — Clean up

- Remove duplication, improve naming, simplify structure.
- Run the test — it **must still pass**.
- Call `maetdol_ralph_iterate` with `{ tdd_phase: "refactor", verify_result: "pass", evidence }`.
- On failure: revert the refactoring and retry.

### 4. VERIFY — Acceptance criteria

After the TDD cycle completes (`tdd_phase` resets to `null`), proceed with the normal acceptance criteria verification flow.

## TDD Anti-patterns

- **Test passes immediately in RED** → You skipped RED. The test doesn't verify what you think.
- **Mocking the thing you're testing** → Test real behavior, not mock behavior.
- **Writing tests after implementation** → That's not TDD. Write the test first.
- **Modifying tests to make them pass** → Unless the test itself is buggy, fix the implementation.
- **Giant test in RED** → Write the smallest possible failing test. One assertion.

## Error Hash Computation

To produce consistent hashes:
1. Take the error message text.
2. Strip line numbers, timestamps, and file paths that change between runs.
3. Hash the normalized text.

This ensures the same logical error produces the same hash even if surface details vary.

## Story Verification

When a story's tasks are all completed/skipped, the server marks the story as `ready_for_verify` (awaiting verification):

1. Check each story-level acceptance criterion against actual output.
2. Record results via `maetdol_tasks` with `{ action: "verify_story", session_id, story_id, criteria_met: [<indices>], evidence: "<actual output>" }`.
3. If not all story criteria are met: create additional tasks to address unmet criteria, then resume the ralph loop.
4. Once all stories are verified (`completed`), proceed to final verification.

## Important Behaviors

- Always verify before declaring success — never assume a fix worked.
- Each fix attempt should be meaningfully different from the previous one. If you're about to try the same thing again, stop and invoke unstuck instead.
- In independent mode, report progress after each iteration so the user can see what's happening.
- Never modify tests to make them pass (unless the tests themselves are the bug).
