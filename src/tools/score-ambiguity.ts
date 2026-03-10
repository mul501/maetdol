import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AmbiguityResult } from '../types.js'
import { loadSession, saveSession } from '../lib/storage.js'
import { ok, toolError } from '../lib/response.js'
import { AMBIGUITY_THRESHOLD, DIMENSION_THRESHOLD, PHASE, AMBIGUITY_WEIGHTS } from '../lib/constants.js'

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
        context_clarity: z.number().min(0).max(1).default(0).describe('Context clarity: how well the task accounts for existing codebase/technology patterns. Score based on research findings from round 1+.'),
        interaction_clarity: z.number().min(0).max(1).default(0).describe('Interaction clarity: how clearly user actions and flows are defined. What can the user do with the result? (0.0=no idea, 1.0=fully specified)'),
        suggestions: z.array(z.string()).optional().describe('Clarifying questions if scores are low'),
        project_type: z.enum(['new', 'existing']).optional().describe('Whether this is a new or existing project'),
        relevant_files: z.array(z.string()).optional().describe('Files relevant to the task, discovered during codebase exploration'),
        research_findings: z.string().optional().describe('Structured research findings from automated research phase'),
        session_id: z.string().optional().describe('If provided, persist gate result to session'),
      },
    },
    async ({ context, round, goal, constraints, criteria, context_clarity, interaction_clarity, suggestions, project_type, relevant_files, research_findings, session_id }) => {
      const w = round === 1 ? AMBIGUITY_WEIGHTS.round1 : AMBIGUITY_WEIGHTS.round2plus
      const clarity = goal * w.goal + constraints * w.constraints + criteria * w.criteria
        + interaction_clarity * w.interaction + context_clarity * w.context
      const ambiguity = Math.round((1.0 - clarity) * 1000) / 1000

      // Find weakest dimension — all 5 always included
      const scoreEntries: [keyof AmbiguityResult['breakdown'], number][] = [
        ['goal', goal],
        ['constraints', constraints],
        ['criteria', criteria],
        ['context', context_clarity],
        ['interaction', interaction_clarity],
      ]
      const weakest = scoreEntries.reduce((min, curr) => (curr[1] < min[1] ? curr : min))[0]

      const weakDimensions = scoreEntries
        .filter(([_, score]) => score < DIMENSION_THRESHOLD)
        .sort(([, a], [, b]) => a - b)
        .map(([name]) => name)

      const result: AmbiguityResult = {
        ambiguity,
        breakdown: { goal, constraints, criteria, context: context_clarity, interaction: interaction_clarity },
        passed: ambiguity <= AMBIGUITY_THRESHOLD && weakDimensions.length === 0,
        suggestions: suggestions ?? [],
        weakest_dimension: weakest,
        weak_dimensions: weakDimensions,
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
            research_findings,
          }
          if (result.passed) {
            session.phase = PHASE.blueprint
          }
          await saveSession(session)
        }
      }

      return ok(result)
    },
  )
}
