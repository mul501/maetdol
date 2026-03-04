import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { loadSession, saveSession } from '../lib/storage.js'
import { ok, toolError } from '../lib/response.js'
import { PHASE } from '../lib/constants.js'

export function registerDesignTool(server: McpServer) {
  server.registerTool(
    'maetdol_design',
    {
      description:
        'Record design decisions for a session. Can skip design for simple tasks or store full design results.',
      inputSchema: {
        session_id: z.string().describe('Session ID'),
        skip: z.boolean().default(false).describe('Skip design phase (for simple tasks)'),
        summary: z.string().optional().describe('Design summary (required if not skipping)'),
        files_to_modify: z.array(z.string()).optional().describe('Existing files to modify'),
        files_to_create: z.array(z.string()).optional().describe('New files to create'),
      },
    },
    async ({ session_id, skip, summary, files_to_modify, files_to_create }) => {
      const session = await loadSession(session_id)
      if (!session) return toolError(`Session ${session_id} not found`)
      if (session.phase !== PHASE.design) {
        const hint = session.phase === PHASE.gate
          ? '. Complete the gate phase first (run maetdol_score_ambiguity with a passing score).'
          : ''
        return toolError(`Session phase is '${session.phase}', expected 'design'${hint}`)
      }

      if (skip) {
        session.design = { summary: null, files_to_modify: [], files_to_create: [], skipped: true }
      } else {
        if (!summary) return toolError('summary is required when not skipping design')
        session.design = {
          summary,
          files_to_modify: files_to_modify ?? [],
          files_to_create: files_to_create ?? [],
          skipped: false,
        }
      }

      session.phase = PHASE.stories
      await saveSession(session)
      return ok({ design: session.design, phase: session.phase })
    },
  )
}
