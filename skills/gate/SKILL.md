---
name: gate
description: Check task ambiguity and refine requirements through socratic questioning
---

# Gate Skill

Scores a task for ambiguity and iteratively refines it through clarifying questions. Can run standalone via `/maetdol:gate` or as part of the full maetdol pipeline.

## Independent Mode

Triggered by: `/maetdol:gate "task description"`

The argument is the task description to evaluate. If no argument is provided, use the most recent user message as the task description.

## Flow

### Round 1: Initial Scoring

1. Gather context:
   - The task description (from argument or conversation).
   - Relevant codebase context — use Read, Glob, Grep to understand the project structure if the task references specific code.
2. Call `maetdol_score_ambiguity` with `{ context: "<assembled context>", round: 1 }`.
3. Evaluate the response:
   - **Passed:** Output the refined requirements. Done.
   - **Not passed:** Continue to clarification.

### Rounds 2-3: Clarification Loop

1. Spawn the **interviewer** agent with the ambiguity feedback from the scoring response.
2. The interviewer asks the user pointed clarifying questions (scope, constraints, success criteria, edge cases).
3. Collect the user's answers.
4. Assemble updated context: original task + all Q&A so far.
5. Call `maetdol_score_ambiguity` with `{ context: "<updated context>", round: <N> }`.
6. **Passed:** Output refined requirements. Done.
7. **Not passed and round < 3:** Go to step 1 of this section.
8. **Not passed and round = 3:** Output the best requirements available. List remaining ambiguities as explicit assumptions.

### Output Format

When the gate passes (or max rounds reached), output:

```
## Refined Requirements

<Clear, unambiguous description of what needs to be done>

## Assumptions

<Any assumptions made due to remaining ambiguity — empty if gate passed cleanly>

## Scope

- In scope: <what will be done>
- Out of scope: <what will NOT be done>
```

## Session Mode

When called from the maetdol orchestration skill:

- The session context is automatically included.
- Gate results are stored in the session for recovery.
- The round number is persisted so a resumed session can continue where it left off.

## Important Behaviors

- Never skip scoring. Even if the task seems obvious, run at least round 1.
- Never fabricate answers to the interviewer's questions — only the user can answer them.
- If the user declines to answer or says "just do it," note the ambiguities as assumptions and proceed.
- The `context` parameter to `maetdol_score_ambiguity` should be as rich as possible — include code snippets, file paths, and existing patterns discovered through codebase exploration.
