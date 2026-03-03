---
name: maetdol
description: Run the full maetdol productivity pipeline (gate → decompose → ralph → verify)
skill: maetdol
---

Run the full maetdol pipeline on a task.

**Usage:**

```
/maetdol <task description>
```

Runs: ambiguity gate, task decomposition, iterative execution with ralph loops, final verification, and session completion. Resumes automatically if a previous session exists for the current project.
