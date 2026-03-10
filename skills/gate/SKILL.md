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
- **context_clarity**: How well does the task account for existing codebase/technology patterns? (1.0 = fully grounded, 0.0 = no awareness)
  - Score based on research findings — even round 1 has research context now.
- **interaction_clarity**: How clearly are user actions and flows defined? (1.0 = fully specified, 0.0 = no idea what the user can do)
  - What can the user do with the result? What actions, clicks, inputs are available?
  - For non-UI tasks (libraries, CLI tools, APIs): what developer actions/commands are available?

If any dimension scores below 0.7, generate clarifying questions for the `suggestions` array.

After scoring, pass the scores to `maetdol_score_ambiguity` which computes the weighted ambiguity and gate pass/fail. The response includes `weakest_dimension` and `weak_dimensions` — pass these to the interviewer so questions target the weak areas.

**Per-dimension threshold**: Even if the overall ambiguity score passes, any individual dimension below 0.7 causes the gate to fail. The server enforces this — `weak_dimensions` lists all dimensions below the threshold.

## Flow

### Step 0: Automated Research

Run BEFORE any scoring. This grounds the entire gate process in facts rather than assumptions.

Run A and B in parallel — they are independent of each other. Assemble findings in C after both complete.

#### A. Codebase Exploration (existing projects) — parallel with B

1. Use Glob to survey project structure (`src/**`, `package.json`, `tsconfig.json`, `*.py`, `*.go`, etc.).
2. Use Grep to search for task-related keywords (function names, module names, patterns).
3. Use Read to examine key files (entry points, config, files matching task keywords).
4. Determine `project_type`: source files exist → `'existing'`, no source files → `'new'`.

#### B. External Research (all projects) — parallel with A

1. Check tool availability: Read `research_tools` from `cat ~/.maetdol/config.json 2>/dev/null`.
   - `context7: true` → Context7 available
   - `web_search: true` → WebSearch available
   - Neither → skip external research
2. For frameworks/SDKs mentioned in the task:
   - Look up how the technology works (Context7 `resolve-library-id` → `query-docs`)
   - Specifically investigate: how does this technology serve/render UI? What are standard interaction patterns?
   - Search for known gotchas, limitations, required configurations
3. For tasks involving UI or user-facing output:
   - How does the target platform handle user interaction?
   - What are the standard patterns for CRUD, navigation, feedback?

#### C. Structure Research Findings

Assemble findings into a structured block:

```markdown
## Research Findings

### Codebase Patterns
- Project structure, existing conventions, related files

### Technology Context
- SDK/framework behavior, constraints, standard usage patterns

### Interaction Patterns
- How this technology handles user actions, UI serving, data flow
```

Store this as `research_findings` — it will be passed to scoring and the interviewer.

### Round 1: Initial Scoring (post-research)

1. Gather context:
   - The task description (from argument or conversation).
   - The `research_findings` from Step 0.
2. Score the task yourself using the criteria above. All 5 dimensions are scored — research provides context and interaction grounding.
3. Call `maetdol_score_ambiguity` with `{ context, round: 1, goal, constraints, criteria, context_clarity, interaction_clarity, suggestions, project_type, research_findings }`.
4. Evaluate the response:
   - **Passed (`passed: true`):** Continue to Acceptance Walkthrough, then output the refined requirements. Done.
   - **Not passed:** Continue to clarification.

### Common: Presenting Interviewer Questions

After the interviewer returns its structured response:

1. Parse the response (Q1, Q2, ...). Each question has `type`, `question`, `reason`, and optionally `options` or `suggestions`. Each may also have `independent: true/false`.
2. **Batch independent questions**: Collect all questions with `independent: true` and present them together in a single `AskUserQuestion` (max 4 per batch). Present each as an option with the question as label and reason as description.
3. **Sequential dependent questions**: Questions with `independent: false` or `depends_on` are presented one at a time after their dependency is answered.
4. For individual questions, use the appropriate UI for each type:
   - For `choice` type: Use `AskUserQuestion` with the interviewer's `options` as option labels.
   - For `open` type: Use `AskUserQuestion` with the interviewer's `suggestions` converted to options.
     Each suggestion becomes an option with a short summary as label and full content as description.
     If only 1 suggestion exists, add a second option: Label: "Different approach", Description: "I have a different idea".
     AskUserQuestion always includes "Other" automatically for free-text input.
5. Collect each answer before asking the next question.
6. **Check for early termination**: If the user responds with "done", "그냥 진행", "충분해", "just do it", "skip", or similar intent to stop the interview — immediately end the gate process. Note remaining ambiguities as assumptions in the output.
7. Assemble updated context: original task + research findings + all Q&A so far.

### Round 2: Clarification + Contrarian Challenge

1. Spawn the **interviewer** agent with:
   - The ambiguity feedback from the scoring response.
   - The `research_findings` from Step 0 (under a `## Research Context` section).
   - "The current lowest-scoring dimension is `{weakest_dimension}` ({score})" so it targets the weakest area.
   - If `weak_dimensions` has multiple entries, list them all.
   - If `interaction` is in `weak_dimensions`, instruct: "Include interaction-focused questions (user actions, flows, feedback)."
   - "Also perform Contrarian challenge in this round."
2. Follow the "Presenting Interviewer Questions" process above.
3. Identify `relevant_files` during codebase exploration:
   - Use Grep with task-related keywords to find relevant source files.
   - Collect file paths the interviewer explored or referenced.
   - Include only files directly relevant to the task (not every file in the project).
4. Re-score the task yourself with the new context. Score all 5 dimensions.
5. Call `maetdol_score_ambiguity` with `{ context: "<updated context>", round: 2, goal, constraints, criteria, context_clarity, interaction_clarity, suggestions, project_type, relevant_files, research_findings }`.
6. **Passed:** Continue to Acceptance Walkthrough. Done.
7. **Not passed:** Continue to round 3.

### Round 3: Closing + Simplifier Challenge

1. Spawn the **interviewer** agent with:
   - The ambiguity feedback from the scoring response.
   - The `research_findings` from Step 0.
   - "The current lowest-scoring dimension is `{weakest_dimension}` ({score})".
   - If `weak_dimensions` has multiple entries, list them all.
   - If `interaction` is in `weak_dimensions`, instruct: "Include interaction-focused questions."
   - "Also perform Simplifier challenge in this round."
2. Follow the "Presenting Interviewer Questions" process above.
3. Re-score with all 5 dimensions.
4. Call `maetdol_score_ambiguity` with `{ context: "<updated context>", round: 3, goal, constraints, criteria, context_clarity, interaction_clarity, suggestions, project_type, relevant_files, research_findings }`.
5. **Passed:** Continue to Acceptance Walkthrough. Done.
6. **Not passed:** Continue to round 4.

### Round 4+: Targeted Questioning

1. Spawn the **interviewer** agent with:
   - "Current weak dimensions: `{weak_dimensions}` — only questions aimed at raising these dimensions to ≥ 0.7."
   - The `research_findings` from Step 0.
   - No challenge mode.
2. Follow the "Presenting Interviewer Questions" process above.
3. Re-score and call `maetdol_score_ambiguity` with the appropriate round number.
4. **Passed:** Continue to Acceptance Walkthrough. Done.
5. **Not passed:** Repeat round 4+ until passed or user terminates.

There is no hard round cap. The interview continues until all dimensions reach ≥ 0.7 or the user explicitly terminates.

### Acceptance Walkthrough

After scoring passes (before final output), present a concrete walkthrough for user confirmation:

**For UI/app tasks:**
```
사용자가 앱을 열면 → {첫 화면}을 보고 → {가능한 액션들}을 할 수 있고 → {각 액션의 결과}를 기대합니다. 맞나요?
```

**For non-UI tasks (libraries, CLI, APIs):**
```
개발자가 {실행 방법}을 실행하면 → {동작 설명}이 작동하고 → {확인 방법}으로 검증합니다. 맞나요?
```

Use `AskUserQuestion` with options:
1. Label: "Correct", Description: "The walkthrough accurately describes the expected behavior"
2. Label: "Needs adjustment", Description: "Some parts need to be corrected"

If "Needs adjustment": incorporate corrections, update the refined requirements, and re-run scoring if the changes are significant.

### Output Format

When the gate passes or the user terminates the interview:

```
## Refined Requirements

<Clear, unambiguous description of what needs to be done>

## User Interaction

<What the user can do: specific actions, flows, expected feedback>

## Assumptions

<Any assumptions made due to remaining ambiguity — empty if gate passed cleanly>

## Scope

- In scope: <what will be done>
- Out of scope: <what will NOT be done>
```

## Session Mode

When called from the maetdol orchestration skill:

- The session context is automatically included.
- **Pass `session_id` to `maetdol_score_ambiguity`** so the server persists the gate result to the session. When the gate passes, the server automatically advances the session phase to `blueprint`.
- **Pass `research_findings`** to `maetdol_score_ambiguity` so findings are persisted with the gate result.
- The server persists the gate result (score, passed, refined_task, project_type, relevant_files, research_findings). Round context is managed by this skill within the conversation — the server does not track individual rounds.

## Important Behaviors

- Never skip scoring. Even if the task seems obvious, run at least round 1.
- Never skip research (Step 0). Even simple tasks benefit from codebase awareness.
- Never fabricate answers to the interviewer's questions — only the user can answer them.
- If the user declines to answer or says "just do it," note the ambiguities as assumptions and proceed.
- The `context` parameter to `maetdol_score_ambiguity` should be as rich as possible — include code snippets, file paths, research findings, and existing patterns.
- Always pass `research_findings` to the interviewer so questions are grounded in facts, not assumptions.
