---
name: maetdol-review
description: Review code changes using an external model CLI
---

# Review Skill

Reviews code changes using an external model CLI, or falls back to inline Claude Code analysis.

## Usage

- `/maetdol-review` — review staged + unstaged changes
- `/maetdol-review main` — review diff against main branch
- `/maetdol-review HEAD~3` — review last 3 commits

## Flow

### 1. Determine Diff Range

- With argument: `git diff <argument>...HEAD`
- Without argument: `git diff HEAD` (if no changes, use `git diff HEAD~1`)

### 2. Collect Context

- Run diff → if empty, output "No changes to review" and exit.
- If over 5000 lines, summarize with `git diff --stat` + review only the first 3000 lines.

### 3. Check Review CLI

- Read `review_cli` from `cat ~/.maetdol/config.json 2>/dev/null`.
- If not configured → inline fallback (Claude Code reviews directly).
  "Review CLI is not configured. Using inline review. You can register one via `/maetdol-setup`."
- If configured → proceed to external review.

### 4. External Review

When review CLI is configured:

1. Compose review prompt — include review focus areas:
   - Bugs, security vulnerabilities, error handling, breaking changes, style consistency
2. **Determine review file path**:
   - If an active maetdol/mongdol session exists (check `maetdol_session` with `{ action: "resume", project_id }`) → use `maetdol_review_exec` with `{ action: "start", session_id, review_type: "code", prompt: PROMPT }`. Review saves to `~/.maetdol/sessions/<session_id>/code-review.md`.
   - If no active session → execute via Bash:
     ```bash
     REVIEW_FILE=/tmp/maetdol-review-$(date +%Y%m%d-%H%M%S).md
     git diff <range> | <review_cli> <review_cli_flags> > "$REVIEW_FILE" 2>&1
     echo "Review saved to: $REVIEW_FILE"
     ```
     Timeout: 120 seconds. Fall back to inline review on failure/timeout (including CLI not found).
3. **Run inline review in parallel**: Spawn a `superpowers:code-reviewer` agent (Step 5) immediately — do not wait for external CLI.
4. **Check external review** (if `maetdol_review_exec` was used): Call `maetdol_review_exec` with `{ action: "check", session_id, review_type: "code" }`.
   - If completed → read review file: `Read(review_file, limit=80)`.
   - If not completed → use inline results only.
   - Combine external + inline findings for Step 6.

### 5. Inline Fallback (when CLI is unavailable or fails)

Spawn a `superpowers:code-reviewer` agent (`subagent_type="superpowers:code-reviewer"`) with:

> Review the following code changes.
>
> ## Diff Range
> {diff range from Step 1}
>
> ## Changes
> {diff content, or git diff --stat if over 5000 lines}
>
> ## Focus Areas
> - Bugs and logic errors
> - Security vulnerabilities
> - Error handling gaps
> - Breaking changes
> - Style consistency with existing codebase
>
> Maximum 15 findings. Prioritize critical/high severity.
> Format each finding as: [severity] file:line — description

Parse the agent's response and format it according to Step 6's output format.

### 6. Present Results

```
## Code Review

**Range**: <diff range>
**Reviewer**: <external CLI name or "inline (Claude Code)">
**Changed files**: <N>

### Findings

1. **[severity]** `file:line` — <description>
2. **[severity]** `file:line` — <description>
...

### Summary
<1-2 sentence summary>
```

Severity levels: `critical`, `high`, `medium`, `low`

## Important Behaviors

- Never modify code during review (read-only).
- Maximum 15 findings. Prioritize critical/high.
- Include line numbers in file paths for easy navigation.
- `/maetdol-review` always works even without an external CLI (graceful degradation).
