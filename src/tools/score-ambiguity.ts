import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AmbiguityResult } from '../types.js'
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
        goal: z.number().min(0).max(1).describe('Goal clarity score (0.0=vague, 1.0=clear)'),
        constraints: z.number().min(0).max(1).describe('Constraints clarity score (0.0=vague, 1.0=clear)'),
        criteria: z.number().min(0).max(1).describe('Success criteria clarity score (0.0=vague, 1.0=clear)'),
        suggestions: z.array(z.string()).optional().describe('Clarifying questions if scores are low'),
      },
    },
    async ({ context, round, goal, constraints, criteria, suggestions }) => {
      const clarity = goal * 0.4 + constraints * 0.3 + criteria * 0.3
      const ambiguity = Math.round((1.0 - clarity) * 1000) / 1000

      const result: AmbiguityResult = {
        ambiguity,
        breakdown: { goal, constraints, criteria },
        passed: ambiguity <= AMBIGUITY_THRESHOLD,
        suggestions: suggestions ?? [],
      }

      return ok(result)
    },
  )
}
