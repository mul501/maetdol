import { createHash } from 'node:crypto'

/** SHA-256 hash, truncated to first 8 hex chars */
export function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}
