import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AmbiguityResult } from '../types.js'
import { scoreAmbiguity } from '../lib/anthropic.js'
import { ok } from '../lib/response.js'

const AMBIGUITY_THRESHOLD = 0.3

export function registerScoreAmbiguityTool(server: McpServer) {
  server.registerTool(
    'maetdol_score_ambiguity',
    {
      description:
        'Score task ambiguity using LLM. Returns ambiguity score (0.0=clear, 1.0=vague) and whether it passes the gate.',
      inputSchema: {
        context: z.string().describe('The task description to evaluate'),
        round: z.number().int().min(1).describe('Scoring round number (1 = initial)'),
      },
    },
    async ({ context, round }) => {
      const scores = await scoreAmbiguity(context, round)

      // Weighted ambiguity formula: ambiguity = 1 - (goal*0.4 + constraints*0.3 + criteria*0.3)
      const clarity = scores.goal * 0.4 + scores.constraints * 0.3 + scores.criteria * 0.3
      const ambiguity = Math.round((1.0 - clarity) * 1000) / 1000

      const result: AmbiguityResult = {
        ambiguity,
        breakdown: {
          goal: scores.goal,
          constraints: scores.constraints,
          criteria: scores.criteria,
        },
        passed: ambiguity <= AMBIGUITY_THRESHOLD,
        suggestions: scores.suggestions,
      }

      return ok(result)
    },
  )
}
