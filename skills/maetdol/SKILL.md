---
name: maetdol
description: Full productivity pipeline — gate, decompose, ralph loop, verify, complete
---

# Maetdol Orchestration Skill

Entry point for the `/maetdol` command. Thin dispatcher that delegates each phase to its dedicated skill via the Skill tool.

## Flow Overview

```
session create/resume → gate → [blueprint] → [stories] → decompose → [ralph loop per task] → [story verify] → final verify → session complete
```

## Execution Model

Blueprint (Step 2.5) is the **only user checkpoint** in the pipeline. Once the user approves the blueprint, all subsequent phases execute **continuously without interruption**. Never ask confirmation questions like "Should we continue?", "Ready to start?", or "Is it okay to proceed?"

## Step 0: Identify Project

1. Run `git remote get-url origin` in the current working directory.
2. If successful: project_id = SHA-256 of the URL, first 8 hex chars.
3. If failed (no git/no remote): project_id = SHA-256 of absolute cwd, first 8 hex chars.
4. Pass this project_id to all `maetdol_session` calls.

## Step 1: Session

Determine whether to create a new session or resume an existing one.

**New session:**
- Call `maetdol_session` with `{ action: "create", task: "<user's task description>", project_id: "<project_id>" }`.
- Store the returned `session_id` for all subsequent calls.

**Resume session:**
- Call `maetdol_session` with `{ action: "resume", project_id: "<project_id>" }`.
- Read the returned `phase`, `current_task_id`, and `iteration` fields.
- Jump directly to the corresponding step using the Session Recovery table below.

**Get session info:**
- Call `maetdol_session` with `{ action: "get", session_id: "<id>" }` to inspect current state without modifying it.

## Step 2: Gate

**MANDATORY**: Use the Skill tool to invoke: `maetdol:gate`

The gate skill handles all scoring rounds, interviewer agent spawning, and user interaction.
Do not perform scoring or questioning here — the gate skill is self-contained.
After the gate skill completes, read the session to confirm phase advanced to `blueprint`.

## Step 2.5: Blueprint

**MANDATORY**: Use the Skill tool to invoke: `maetdol:blueprint`

The blueprint skill handles research, architecture planning, plan review, user confirmation, and recording.
Do not perform research or blueprint generation here — the blueprint skill is self-contained.
After the blueprint skill completes, automatically continue to Step 3.

## Step 3+: Execute Pipeline

**MANDATORY**: Use the Skill tool to invoke: `maetdol:run`

The run skill handles stories, decomposition, ralph loops, story verification, final verification, and session completion.
Do not perform task execution here — the run skill is self-contained.

## Session Recovery

When resuming a session, route to the appropriate skill based on the session phase:

| Phase | Recovery Action |
|-------|----------------|
| `gate` | **MANDATORY**: Use the Skill tool to invoke: `maetdol:gate` |
| `blueprint` | If `session.blueprint` exists → invoke `maetdol:run`. Otherwise → invoke `maetdol:blueprint` |
| `stories`~`verify` | **MANDATORY**: Use the Skill tool to invoke: `maetdol:run` |
| `completed` | Report session already completed |

Never re-execute completed tasks. Always read the session state before acting.

## Error Handling

- If any `maetdol_*` tool call fails, report the error to the user and attempt recovery.
- If the session is corrupted, offer to create a new session.
- Never silently skip the gate phase — ambiguity checking is mandatory.
