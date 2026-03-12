---
name: maetdol-blueprint
description: Requirements analysis and architecture blueprint for a maetdol session
user-invocable: false
---

# Blueprint Skill

Analyzes requirements and produces an architecture blueprint before task decomposition. Can run standalone via `/maetdol-blueprint` or as part of the full maetdol pipeline.

## Independent Mode

Triggered by: `/maetdol-blueprint`

Requires an active session in `blueprint` phase. If no session exists, instruct the user to run `/maetdol-gate` first.

## Flow

### 1. Load Session Context

Read the session to get:
- `gate.refined_task` — the gated task description
- `gate.project_type` — `'new'` or `'existing'` (may be absent for simple tasks)
- `gate.relevant_files` — files discovered during gate exploration (may be empty)
- `gate.research_findings` — structured research from the gate phase (codebase patterns, technology context, interaction patterns)
- `gate.score` — ambiguity score

### 2. Decide: Skip or Blueprint

**Skip conditions** (all must be true):
- `gate.score < BLUEPRINT_SKIP_THRESHOLD (0.15)` (very clear task)
- `relevant_files` has 2 or fewer entries (small scope)

If skipping:
- Call `maetdol_blueprint` with `{ session_id, skip: true }`.
- Output: "Blueprint skipped — task is simple enough for direct decomposition."
- Done.

### 2.5. Deep Research (optional — only when gate research is insufficient)

Gate already performed automated research (codebase exploration + external docs). Only do additional research here if:
- The task requires **API-level detail** not covered in gate research (e.g., exact method signatures, configuration schemas)
- The task involves **complex integration patterns** between multiple systems
- `gate.research_findings` explicitly notes gaps or open questions

**If gate research is sufficient** → skip directly to Step 3.

**If additional research is needed:**

#### A. Code Research → Explore agent (existing projects only)

Skip if `gate.project_type` is `'new'`.

Spawn an `Explore` agent (`subagent_type="Explore"`, thoroughness="very thorough") with:

> Deep-dive into the codebase for: "{refined_task}"
>
> Files to read in full: {gate.relevant_files}
> (If no files listed, explore the src/ directory broadly for files related to the task.)
>
> 1. Read each file in full — understand structure, not just keywords
> 2. Search for code patterns: {task-related function/class/module names}
> 3. Search for existing instances of the pattern (e.g., registerTool, routes, handlers)
> 4. Check for test files alongside related source files
> 5. Identify import style, naming conventions, error handling patterns
>
> Return: detailed analysis of relevant code patterns, conventions, and test coverage

#### B. External Research → general-purpose agent

Spawn a `general-purpose` agent (`subagent_type="general-purpose"`) with:

> Research external documentation for: "{refined_task}"
>
> Available tools: WebSearch{if context7 in config: ", Context7 (mcp__context7__resolve-library-id → mcp__context7__query-docs)"}
> - Use WebSearch for official docs, best practices, known gotchas
> - If context7 available: Use mcp__context7__resolve-library-id → mcp__context7__query-docs for frameworks/SDKs
>
> Focus on API-level detail not covered in gate research:
> - Exact method signatures, configuration schemas
> - Complex integration patterns between systems
> - Known gotchas, limitations, required configurations
>
> Return a structured summary:
> - Technology context (API details, constraints)
> - Integration patterns
> - Gotchas or limitations found

Launch Agent A and Agent B in the **same message** (parallel). Read `~/.maetdol/config.json` for Context7 availability to include in Agent B's prompt.

#### C. Consolidate Findings

Merge gate research + any additional findings into notes for the Step 3 blueprint:

```
## Research Findings

### From Gate Research
- <key findings from gate.research_findings>

### Additional Deep Research
- <new findings from this step, if any>

### Open Questions
- <items to confirm with user before blueprint>
```

If there are Open Questions, ask the user before proceeding to Step 3.

### 3. Blueprint (when not skipping)

#### For `existing` projects:

1. Proceed with blueprint based on gate research findings + any additional research from Step 2.5.
2. Identify:
   - **Modules to change** — which existing files need modification and why.
   - **Pattern consistency** — do proposed changes align with existing conventions?
   - **Impact scope** — what else might break or need updating?
3. Determine:
   - `files_to_modify` — existing files that need changes.
   - `files_to_create` — new files needed (if any).
4. Write a `summary` covering:
   - Approach: how the task will be accomplished.
   - Key decisions and rationale.
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
   - Key decisions and rationale.
   - Dependencies (if any).

### 3.5. Plan Review (external or internal model review)

Get a critical second opinion, then verify findings against the codebase. Review always happens — either via an external CLI or an internal agent.

1. **Check config**: Read `review_cli` from `cat ~/.maetdol/config.json 2>/dev/null`.
   - If configured → proceed to step 2 (external path).
   - If not configured → skip to step 5 (internal path).

2. **Compose review prompt** as a shell variable `PROMPT` containing:
   ```
   You are a critical reviewer examining a coding blueprint BEFORE implementation begins.
   Your job is to find blind spots, not to approve.

   ## Task
   <refined_task>

   ## Blueprint
   <summary>

   ## Files to Modify
   <files_to_modify — each file with its planned change and rationale>

   ## Files to Create
   <files_to_create — each file with its purpose>

   ## Challenge Directives
   1. Missing files — are there files that should be changed but aren't listed?
   2. Unnecessary files — are there files listed that aren't actually needed?
   3. Pattern violations — does this approach contradict existing codebase conventions?
   4. Scope gaps — is anything missing from the task requirements? Anything unnecessarily added?
   5. Implementation risk — what part is most likely to break during implementation?
   6. Simpler alternative — is there a meaningfully simpler approach?

   > Maintenance note: These directives mirror `agents/review-analyst.md` Internal Mode.
   > If directives change, update both locations.

   For each finding: state the problem, why it matters, and suggest an alternative.
   Maximum 8 findings. Skip trivial issues.
   ```

3. **Start external review** (if CLI configured):
   Call `maetdol_review_exec` with `{ action: "start", session_id: "<session_id>", review_type: "blueprint", prompt: PROMPT }`.
   On error (no CLI configured) → skip to step 4.

4. **Dispatch review-analyst agent** (Sonnet subagent) — immediately, do not wait for external CLI:
   - Input: refined_task, blueprint summary, files_to_modify, files_to_create,
     relevant_files (from gate), research_findings (from gate)
   - Omit `review_output` — agent enters internal mode (generates findings using challenge directives, then self-verifies).
   - Returns structured digest: accepted/acknowledged/rejected findings
   - On agent failure → note "Internal review unavailable" and check external.

5. **Check external review** (if started in step 3):
   Call `maetdol_review_exec` with `{ action: "check", session_id: "<session_id>", review_type: "blueprint" }`.
   - If completed → read review file: `Read(review_file, limit=80)`.
   - If not completed → external review skipped (result will be available in session folder later).

6. **Combine results**:
   - Both available → merge findings. Items found by both get higher confidence. Unique items from each source are included.
   - Internal only → use internal digest as-is.
   - External only (internal failed) → present raw external review under "External Review".
   - Neither → note "Review unavailable" and proceed to Step 4 (Present to User).

7. **Apply combined digest to blueprint**:
   - If any ACCEPTED findings: update `summary`, `files_to_modify`, or `files_to_create`.
     For each change, annotate: "Review reflected: <finding summary>".
   - If no ACCEPTED findings: note "N findings reviewed, no blueprint changes needed."

### 4. Present to User

Output the blueprint summary in a clear format:

```
## Blueprint Summary

<If any ACCEPTED findings were applied, prepend:>
**Revised** — external review reflected N items (see Review Digest below)

<Approach and key decisions>

## Files to Modify
- <file path> — <what changes and why>

## Files to Create
- <file path> — <purpose>

## Review Digest

**Reviewer**: <CLI name> or `internal (Claude Code)` | **Findings**: N (A accepted, B acknowledged, C rejected)

### Accepted (blueprint revised)
- <finding summary> → <what was changed>

### Acknowledged (noted in Risks)
- <finding summary>

### Rejected
- <finding summary> — <rejection reason>

## Risks / Trade-offs
- <any notable risks>
- <ACKNOWLEDGED findings from review digest>
```

After presenting the blueprint, use `AskUserQuestion` to get the user's decision:
- Question: "How should we proceed with this blueprint?"
- Header: "Blueprint"
- Options:
  1. Label: "Approve", Description: "Accept the blueprint and continue to execution"
  2. Label: "Revise", Description: "Request specific changes to the blueprint"
  3. Label: "Cancel", Description: "Cancel this session"

- If **Approve**: Call `maetdol_blueprint` to record (Step 5). In pipeline mode, automatically continue. In standalone mode, instruct user to run `/maetdol-run`.
- If **Revise**: Incorporate the user's requested changes, regenerate blueprint, present again.
- If **Cancel**: Do not record. Session remains in `blueprint` phase for later resumption.

### 5. Record Blueprint

Call `maetdol_blueprint` with `{ session_id, summary, files_to_modify, files_to_create }`.

The server stores the blueprint and advances the phase to `stories`.

## Session Mode

When called from the maetdol orchestration skill:
- Session context is automatically available.
- The server enforces phase guard — `maetdol_blueprint` only works when `session.phase === 'blueprint'`.
- After recording, the session advances to `stories` phase.

## Important Behaviors

- Never skip the user confirmation step unless the blueprint is being skipped entirely.
- Keep the summary concise — focus on decisions that affect decomposition, not implementation details.
- For existing projects, always read the relevant files before producing the blueprint. Don't guess at patterns.
- If `relevant_files` is empty for an existing project, do a quick codebase scan before producing the blueprint.
- **Do not duplicate gate research.** Start from `gate.research_findings` and only add deep research when genuinely needed.
