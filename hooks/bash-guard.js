#!/usr/bin/env node
// PreToolUse hook: blocks dangerous Bash commands.
// Reads JSON from stdin, checks tool_input.command against blocked patterns,
// outputs allow/deny JSON to stdout.
// Fail-open: any error → allow (never break the session).

const BLOCKED = [
  { p: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--force)\b/, m: 'Recursive forced deletion' },
  { p: /\bgit\s+push\s+.*--force\b/, m: 'Force push' },
  { p: /\bgit\s+reset\s+--hard\b/, m: 'Hard reset' },
  { p: /\bgit\s+checkout\s+\.\s*$/, m: 'Wholesale file discard' },
  { p: /\bgit\s+clean\s+-[a-zA-Z]*f/, m: 'Git clean with force' },
  { p: /\bcurl\b.*\|\s*(sh|bash)\b/, m: 'Remote code execution' },
  { p: /\bchmod\s+777\b/, m: 'chmod 777' },
  { p: />\s*\/etc\//, m: 'Write to system file' },
];

function check(command) {
  for (const { p, m } of BLOCKED) {
    if (p.test(command)) {
      return { decision: 'block', reason: `bash-guard: ${m} — "${command.slice(0, 80)}"` };
    }
  }
  return null;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  const input = JSON.parse(raw);

  const command = input.tool_input?.command ?? '';
  const result = check(command);

  if (result) {
    process.stdout.write(JSON.stringify(result));
  } else {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
  }
}

main().catch(() => {
  // Fail-open: never block on hook errors
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
});
