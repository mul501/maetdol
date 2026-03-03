const SECRET_PATTERNS = [
  /(?:sk-|pk-|key-)[a-zA-Z0-9_-]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{20,}/g,
  /(?:ghp_|gho_|ghs_|ghr_)[a-zA-Z0-9_]{36,}/g,
  /(?:xox[bpras]-)[a-zA-Z0-9-]{10,}/g,
]

export function redactSecrets(text: string): string {
  if (!text) return text
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}
