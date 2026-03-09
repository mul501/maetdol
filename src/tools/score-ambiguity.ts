import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AmbiguityResult } from '../types.js'
import { loadSession, saveSession } from '../lib/storage.js'
import { ok, toolError } from '../lib/response.js'
import { AMBIGUITY_THRESHOLD, PHASE } from '../lib/constants.js'

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
        context_clarity: z.number().min(0).max(1).default(0).describe('Context clarity: how well the task accounts for existing codebase patterns. Use 0.0 for round 1 (pre-exploration), score properly from round 2+.'),
        suggestions: z.array(z.string()).optional().describe('Clarifying questions if scores are low'),
        project_type: z.enum(['new', 'existing']).optional().describe('Whether this is a new or existing project'),
        relevant_files: z.array(z.string()).optional().describe('Files relevant to the task, discovered during codebase exploration'),
        session_id: z.string().optional().describe('If provided, persist gate result to session'),
      },
    },
    async ({ context, round, goal, constraints, criteria, context_clarity, suggestions, project_type, relevant_files, session_id }) => {
      // Round 1: ignore context (pre-exploration), use 3-dim formula
      // Round 2+: include context clarity as 4th dimension
      const useContext = round > 1
      const clarity = useContext
        ? goal * 0.35 + constraints * 0.25 + criteria * 0.25 + context_clarity * 0.15
        : goal * 0.4 + constraints * 0.3 + criteria * 0.3
      const ambiguity = Math.round((1.0 - clarity) * 1000) / 1000

      // Find weakest dimension (exclude context in round 1)
      const scoreEntries: [keyof AmbiguityResult['breakdown'], number][] = useContext
        ? [['goal', goal], ['constraints', constraints], ['criteria', criteria], ['context', context_clarity]]
        : [['goal', goal], ['constraints', constraints], ['criteria', criteria]]
      const weakest = scoreEntries.reduce((min, curr) => (curr[1] < min[1] ? curr : min))[0]

      const result: AmbiguityResult = {
        ambiguity,
        breakdown: { goal, constraints, criteria, context: context_clarity },
        passed: ambiguity <= AMBIGUITY_THRESHOLD,
        suggestions: suggestions ?? [],
        weakest_dimension: weakest,
      }

      if (session_id) {
        const session = await loadSession(session_id)
        if (!session) return toolError(`Session ${session_id} not found`)
        if (session.phase === PHASE.gate) {
          session.gate = {
            score: result.ambiguity,
            passed: result.passed,
            refined_task: context,
            project_type,
            relevant_files,
          }
          if (result.passed) {
            session.phase = PHASE.design
          }
          await saveSession(session)
        }
      }

      return ok(result)
    },
  )
}
