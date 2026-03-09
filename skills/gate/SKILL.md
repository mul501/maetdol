---
name: maetdol-gate
description: Check task ambiguity and refine requirements through socratic questioning
---

# Gate Skill

Scores a task for ambiguity and iteratively refines it through clarifying questions. Can run standalone via `/maetdol-gate` or as part of the full maetdol pipeline.

## Independent Mode

Triggered by: `/maetdol-gate "task description"`

The argument is the task description to evaluate. If no argument is provided, use the most recent user message as the task description.

## Scoring (performed by Claude Code directly)

You must score the task yourself before calling the MCP tool. Evaluate the task on a 0.0–1.0 scale for each dimension:

- **goal**: How clear is the end goal? (1.0 = completely unambiguous, 0.0 = no idea what to build)
- **constraints**: How well-defined are the constraints and scope? (1.0 = fully bounded, 0.0 = wide open)
- **criteria**: How measurable are the success criteria? (1.0 = objectively verifiable, 0.0 = "make it better")
- **context_clarity**: How well does the task account for existing codebase patterns? (1.0 = fully grounded, 0.0 = no codebase awareness)
  - **Round 1**: `context_clarity: 0` fixed. Not scored before codebase exploration.
  - **Round 2+**: Actual scoring after interviewer reads code. "How well does the task account for existing patterns/conventions?"

If any dimension scores below 0.7, generate clarifying questions for the `suggestions` array.

After scoring, pass the scores to `maetdol_score_ambiguity` which computes the weighted ambiguity and gate pass/fail. The response includes `weakest_dimension` and `weak_dimensions` — pass these to the interviewer so questions target the weak areas.

**Per-dimension threshold**: Even if the overall ambiguity score passes, any individual dimension below 0.7 causes the gate to fail. The server enforces this — `weak_dimensions` lists all dimensions below the threshold.

## Flow

### Round 1: Initial Scoring

1. Gather context:
   - The task description (from argument or conversation).
   - Relevant codebase context — use Read, Glob, Grep to understand the project structure if the task references specific code.
2. Determine `project_type`:
   - Use Glob to check for source files (`src/**`, `lib/**`, `app/**`, `*.ts`, `*.py`, `*.go`, `*.js`, etc.).
   - If source files exist → `project_type: 'existing'`.
   - If no source files → `project_type: 'new'`.
3. Score the task yourself using the criteria above. Use `context_clarity: 0` for round 1.
4. Call `maetdol_score_ambiguity` with `{ context, round: 1, goal, constraints, criteria, context_clarity: 0, suggestions, project_type }`.
5. Evaluate the response:
   - **Passed (`passed: true`):** Output the refined requirements. Done.
   - **Not passed:** Continue to clarification.

### Common: Presenting Interviewer Questions

After the interviewer returns its structured response:

1. Parse the response (Q1, Q2, ...). Each question has `type`, `question`, `reason`, and optionally `options` or `suggestions`.
2. Present **all questions at once** using a single `AskUserQuestion` call:
   - Format each question with its number, question text, and reason.
   - For `choice` type questions, list the numbered options below the question.
   - For `open` type questions, show the `suggestions` as reference answers the user can pick or modify.
3. Collect the user's answers.
4. **Check for early termination**: If the user responds with "done", "그냥 진행", "충분해", "just do it", "skip", or similar intent to stop the interview — immediately end the gate process. Note remaining ambiguities as assumptions in the output.
5. Assemble updated context: original task + all Q&A so far.

### Round 2: Clarification + Contrarian Challenge

1. Spawn the **interviewer** agent with:
   - The ambiguity feedback from the scoring response.
   - "The current lowest-scoring dimension is `{weakest_dimension}` ({score})" so it targets the weakest area.
   - If `weak_dimensions` has multiple entries, list them all.
   - "Also perform Contrarian challenge in this round."
2. Follow the "Presenting Interviewer Questions" process above.
3. Identify `relevant_files` during codebase exploration:
   - Use Grep with task-related keywords to find relevant source files.
   - Collect file paths the interviewer explored or referenced.
   - Include only files directly relevant to the task (not every file in the project).
4. Re-score the task yourself with the new context. Now score `context_clarity` properly based on codebase exploration.
5. Call `maetdol_score_ambiguity` with `{ context: "<updated context>", round: 2, goal, constraints, criteria, context_clarity, suggestions, project_type, relevant_files }`.
6. **Passed:** Output refined requirements. Done.
7. **Not passed:** Continue to round 3.

### Round 3: Closing + Simplifier Challenge

1. Spawn the **interviewer** agent with:
   - The ambiguity feedback from the scoring response.
   - "The current lowest-scoring dimension is `{weakest_dimension}` ({score})".
   - If `weak_dimensions` has multiple entries, list them all.
   - "Also perform Simplifier challenge in this round."
2. Follow the "Presenting Interviewer Questions" process above.
3. Re-score with `context_clarity`.
4. Call `maetdol_score_ambiguity` with `{ context: "<updated context>", round: 3, goal, constraints, criteria, context_clarity, suggestions, project_type, relevant_files }`.
5. **Passed:** Output refined requirements. Done.
6. **Not passed:** Continue to round 4.

### Round 4+: Targeted Questioning

1. Spawn the **interviewer** agent with:
   - "Current weak dimensions: `{weak_dimensions}` — only questions aimed at raising these dimensions to ≥ 0.7."
   - No challenge mode.
2. Follow the "Presenting Interviewer Questions" process above.
3. Re-score and call `maetdol_score_ambiguity` with the appropriate round number.
4. **Passed:** Output refined requirements. Done.
5. **Not passed:** Repeat round 4+ until passed or user terminates.

There is no hard round cap. The interview continues until all dimensions reach ≥ 0.7 or the user explicitly terminates.

### Output Format

When the gate passes or the user terminates the interview:

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
- **Pass `session_id` to `maetdol_score_ambiguity`** so the server persists the gate result to the session. When the gate passes, the server automatically advances the session phase to `design`.
- The server persists the gate result (score, passed, refined_task, project_type, relevant_files). Round context is managed by this skill within the conversation — the server does not track individual rounds.

## Important Behaviors

- Never skip scoring. Even if the task seems obvious, run at least round 1.
- Never fabricate answers to the interviewer's questions — only the user can answer them.
- If the user declines to answer or says "just do it," note the ambiguities as assumptions and proceed.
- The `context` parameter to `maetdol_score_ambiguity` should be as rich as possible — include code snippets, file paths, and existing patterns discovered through codebase exploration.
