import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { StagnationResult, StagnationPattern } from '../types.js'
import { ok } from '../lib/response.js'
import { STAGNATION_THRESHOLD, OSCILLATION_WINDOW } from '../lib/constants.js'

export function registerDetectStagnationTool(server: McpServer) {
  server.registerTool(
    'maetdol_detect_stagnation',
    {
      description:
        'Detect stagnation patterns (spinning, oscillation) from error/output hash sequences. Recommends a persona to break the pattern.',
      inputSchema: {
        error_hashes: z.array(z.string()).describe('Sequence of error output hashes'),
        output_hashes: z.array(z.string()).describe('Sequence of general output hashes'),
      },
    },
    async ({ error_hashes, output_hashes }) => {
      const patterns: StagnationPattern[] = []

      // Spinning: last 3 hashes identical
      const spinning = detectSpinning(error_hashes) || detectSpinning(output_hashes)
      patterns.push({
        type: 'spinning',
        detected: spinning,
        confidence: spinning ? 1.0 : 0.0,
      })

      // Oscillation: even-index hashes same, odd-index same, but even ≠ odd
      const oscillation = detectOscillation(error_hashes) || detectOscillation(output_hashes)
      patterns.push({
        type: 'oscillation',
        detected: oscillation,
        confidence: oscillation ? 0.9 : 0.0,
      })

      // Recommend persona
      let recommended_persona: StagnationResult['recommended_persona'] = null
      if (spinning) {
        recommended_persona = 'contrarian' // Challenge assumptions
      } else if (oscillation) {
        recommended_persona = 'simplifier' // Strip complexity
      }

      const result: StagnationResult = { patterns, recommended_persona }

      return ok(result)
    },
  )
}

function detectSpinning(hashes: string[]): boolean {
  if (hashes.length < STAGNATION_THRESHOLD) return false
  const last = hashes.slice(-STAGNATION_THRESHOLD)
  return last.every((h) => h === last[0])
}

function detectOscillation(hashes: string[]): boolean {
  if (hashes.length < OSCILLATION_WINDOW) return false
  const last = hashes.slice(-OSCILLATION_WINDOW)
  const evenSame = last[0] === last[2]
  const oddSame = last[1] === last[3]
  const different = last[0] !== last[1]
  return evenSame && oddSame && different
}
