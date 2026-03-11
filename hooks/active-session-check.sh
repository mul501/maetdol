#!/usr/bin/env bash
# maetdol active session check — UserPromptSubmit hook
# Detects active sessions for the current project and outputs a system reminder
# so Claude Code knows to resume after context compression.

set -euo pipefail

SESSIONS_DIR="$HOME/.maetdol/sessions"

# Exit silently if no sessions directory
[[ -d "$SESSIONS_DIR" ]] || exit 0

# Compute project_id: sha256(git remote URL)[:8], fallback to sha256(cwd)[:8]
if remote_url=$(git remote get-url origin 2>/dev/null); then
  project_id=$(printf '%s' "$remote_url" | shasum -a 256 | cut -c1-8)
else
  project_id=$(printf '%s' "$PWD" | shasum -a 256 | cut -c1-8)
fi

# Scan session files for matching project_id in execution phases
for file in "$SESSIONS_DIR"/*.json; do
  [[ -f "$file" ]] || continue

  # Extract fields with lightweight parsing (no jq dependency)
  file_project_id=$(grep -o '"project_id"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | head -1 | sed 's/.*"project_id"[[:space:]]*:[[:space:]]*"//;s/"//')
  [[ "$file_project_id" == "$project_id" ]] || continue

  phase=$(grep -o '"phase"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | head -1 | sed 's/.*"phase"[[:space:]]*:[[:space:]]*"//;s/"//')

  # Only alert for execution phases (gate/blueprint are interactive, user knows)
  case "$phase" in
    ralph|decompose|verify|stories) ;;
    *) continue ;;
  esac

  session_id=$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | head -1 | sed 's/.*"id"[[:space:]]*:[[:space:]]*"//;s/"//')
  task=$(grep -o '"task"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | head -1 | sed 's/.*"task"[[:space:]]*:[[:space:]]*"//;s/"//')
  checkpoint=$(grep -o '"checkpoint"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | head -1 | sed 's/.*"checkpoint"[[:space:]]*:[[:space:]]*"//;s/"//')

  # Count task progress
  total_tasks=$(grep -c '"id"[[:space:]]*:[[:space:]]*[0-9]' "$file" 2>/dev/null || echo "0")
  completed_tasks=$(grep -c '"status"[[:space:]]*:[[:space:]]*"completed"' "$file" 2>/dev/null || echo "0")

  # Output reminder
  echo "[maetdol] Active session detected"
  echo "Session: $session_id | Phase: $phase | Progress: $completed_tasks/$total_tasks tasks"
  if [[ -n "$checkpoint" ]]; then
    echo "Checkpoint: $checkpoint"
  fi
  echo "Task: ${task:0:80}..."
  echo "Resume with: /maetdol-run"

  # Only report the first matching session
  exit 0
done
