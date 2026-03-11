<p align="center">
  <img src="assets/maetdol-mascot.jpg" alt="maetdol mascot" width="240" />
</p>

# maetdol (맷돌)

A Claude Code plugin that grinds your tasks from research to working code — one command, start to finish.

## The Problem

Claude Code is powerful, but left to its own devices it tends to:

- **Dive into ambiguous tasks** without clarifying requirements first, then build the wrong thing
- **Loop on the same error** five times in a row, hoping it magically fixes itself
- **Burn through context** on approaches that were doomed from the start
- **Claim "done"** when the code doesn't actually compile or pass tests

You end up spending your time steering the AI instead of reviewing its output.

## The Solution

```
/maetdol "Add OAuth2 login with Google and GitHub providers"
```

One command. Maetdol handles the rest — research, requirement clarification, planning, execution, and verification. You review the result, not the process.

## How It Works

1. **Gate** — Checks whether your task is clear enough to act on. If not, asks targeted questions until it is.
2. **Blueprint** — Designs the approach and gets your approval before writing any code.
3. **Execute** — Works through subtasks in verify-fix loops. When stuck, shifts perspective and retries.
4. **Verify** — Runs tests, reviews the output, and reports what was done.

## Getting Started

1. **Add the plugin repository**
   ```
   /plugin marketplace add https://github.com/mul501/maetdol
   ```

2. **Install the plugin**
   ```
   /plugin install maetdol
   ```

3. **Restart Claude Code** (required for MCP server activation)

4. **Run setup**
   ```
   /maetdol-setup
   ```

5. **Hand your tasks to maetdol**
   ```
   /maetdol "your task here"
   ```

## Sub-commands

The main command handles everything, but you can also run individual phases:

```
/maetdol-setup                              # Verify plugin installation
/maetdol-gate "Add user authentication"     # Check ambiguity only
/maetdol-blueprint                          # Design approach for current session
/maetdol-unstuck                            # Break out of a stuck loop
/maetdol-teardown                           # Remove session data and uninstall
```

## Under the Hood

Three layers work together:

- **MCP Server** (TypeScript) — Scoring, state tracking, dependency graphs
- **Skills** (Markdown) — Workflow orchestration: question generation, error analysis, persona prompts
- **Agents** — Specialized personas: interviewer, contrarian, simplifier

Sessions persist to `~/.maetdol/sessions/` and survive context compression and restarts. See [CLAUDE.md](CLAUDE.md) for architecture details.

## License

MIT
