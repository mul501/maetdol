---
name: ralph
description: Iterative verify-fix-verify loop with stagnation detection
---

# Ralph Skill

Runs a verify-fix-verify loop on the current task or most recent changes. Named after the "wreck it, fix it" pattern. Can run standalone via `/maetdol:ralph` or as part of the full maetdol pipeline.

## Independent Mode

Triggered by: `/maetdol:ralph`

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
2. Invoke the **unstuck** skill to get alternative approaches.
3. Apply the suggested alternative.
4. Resume the verify-fix loop (iteration count continues, does not reset).

In independent mode, stagnation detection is done locally by comparing error outputs within the conversation.

## Session Mode

When called from the maetdol orchestration skill, use server-side tracking:

- Call `maetdol_ralph_iterate` with `{ session_id, task_id, error_hash: "<sha256 of error text>", error_summary: "<one-line description>" }` after each failed verification.
- The server tracks iteration count and error history.
- The server's response indicates whether stagnation is detected.
- Call `maetdol_detect_stagnation` with `{ error_hashes: [<recent hashes>], output_hashes: [<recent output hashes>] }` for explicit stagnation checks if needed.

## Error Hash Computation

To produce consistent hashes:
1. Take the error message text.
2. Strip line numbers, timestamps, and file paths that change between runs.
3. Hash the normalized text.

This ensures the same logical error produces the same hash even if surface details vary.

## Important Behaviors

- Always verify before declaring success — never assume a fix worked.
- Each fix attempt should be meaningfully different from the previous one. If you're about to try the same thing again, stop and invoke unstuck instead.
- In independent mode, report progress after each iteration so the user can see what's happening.
- Never modify tests to make them pass (unless the tests themselves are the bug).
