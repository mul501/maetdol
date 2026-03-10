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
  "Review CLI is not configured. You can register one via `/maetdol-setup`."
- If configured → proceed to external review.

### 4. External Review

When review CLI is configured:

1. Compose review prompt — include review focus areas:
   - Bugs, security vulnerabilities, error handling, breaking changes, style consistency
2. Execute CLI (Bash), piping the diff directly:
   `git diff <range> | <review_cli> <review_cli_flags>`
   Timeout: 120 seconds. Fall back to inline review on failure/timeout (including CLI not found).

### 5. Inline Fallback (when CLI is unavailable or fails)

Claude Code analyzes the diff directly without an external CLI:
- Read and analyze the diff directly
- Apply the same review focus areas
- Output results in the same format

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
