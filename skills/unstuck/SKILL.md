---
name: unstuck
description: Detect stagnation patterns and suggest alternative approaches
---

# Unstuck Skill

Breaks out of stuck loops by detecting stagnation patterns and spawning specialized agents to suggest alternative approaches. Can run standalone via `/maetdol:unstuck` or be invoked by the ralph skill during execution.

## Independent Mode

Triggered by: `/maetdol:unstuck`

Collects context from the current conversation:
1. Scan the conversation for recent error messages and failed attempts.
2. Normalize and hash each distinct error.
3. Call `maetdol_detect_stagnation` with `{ error_hashes: [<hashes>], output_hashes: [<output hashes>] }`.
4. Based on the response, determine the stagnation pattern and spawn the appropriate agent.

## Stagnation Patterns and Responses

### Pattern: Repeated Same Error

The same error keeps recurring despite fix attempts. The current approach has a flawed assumption.

**Action:** Spawn the **contrarian** agent.
- Feed it the error, the current approach, and the fix attempts.
- The contrarian challenges the underlying assumption and suggests opposite approaches.
- Take the contrarian's best suggestion and attempt it.

### Pattern: Oscillating Errors

Fixes toggle between two or more different errors. Fixing one breaks the other.

**Action:** Spawn the **simplifier** agent.
- Feed it the oscillating errors and the code involved.
- The simplifier proposes a minimal approach that avoids the conflicting constraints.
- Take the simplifier's suggestion and attempt it.

### Pattern: Increasing Complexity

Each fix adds more code but the errors keep changing. The solution is growing out of control.

**Action:** Spawn the **simplifier** agent.
- Feed it the current implementation and the original goal.
- The simplifier proposes stripping back to the minimum viable approach.
- Consider reverting to a known-good state before applying the simplified approach.

### Pattern: No Clear Pattern

Errors are varied and no obvious stagnation, but the user invoked unstuck manually.

**Action:** Spawn both **contrarian** and **simplifier** agents.
- Present both sets of suggestions to the user.
- Let the user choose which direction to take.

## Session Mode

When invoked from the ralph skill during a maetdol session:

- Error hashes are already tracked by the server via `maetdol_ralph_iterate`.
- Call `maetdol_detect_stagnation` with the session's accumulated `error_hashes` and `output_hashes`.
- The server's response includes the detected pattern type, which determines agent selection.
- The chosen alternative is applied within the ralph loop (iteration count continues).

## Important Behaviors

- Never just retry the same approach. The whole point of this skill is to change strategy.
- Agent suggestions are advisory, not commands. Evaluate them for feasibility before applying.
- If both agents fail to produce a viable alternative, report to the user with a summary of what was tried and ask for guidance.
- Keep agent prompts focused. Give them the specific error and context, not the entire conversation history.
