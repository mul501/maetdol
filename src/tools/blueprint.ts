import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { loadSession, saveSession } from '../lib/storage.js'
import { ok, toolError } from '../lib/response.js'
import { PHASE } from '../lib/constants.js'

export function registerBlueprintTool(server: McpServer) {
  server.registerTool(
    'maetdol_blueprint',
    {
      description:
        'Record blueprint decisions for a session. Can skip blueprint for simple tasks or store full blueprint results.',
      inputSchema: {
        session_id: z.string().describe('Session ID'),
        skip: z.boolean().default(false).describe('Skip blueprint phase (for simple tasks)'),
        summary: z.string().optional().describe('Blueprint summary (required if not skipping)'),
        files_to_modify: z.array(z.string()).optional().describe('Existing files to modify'),
        files_to_create: z.array(z.string()).optional().describe('New files to create'),
      },
    },
    async ({ session_id, skip, summary, files_to_modify, files_to_create }) => {
      const session = await loadSession(session_id)
      if (!session) return toolError(`Session ${session_id} not found`)
      if (session.phase !== PHASE.blueprint) {
        const hint = session.phase === PHASE.gate
          ? '. Complete the gate phase first (run maetdol_score_ambiguity with a passing score).'
          : ''
        return toolError(`Session phase is '${session.phase}', expected 'blueprint'${hint}`)
      }

      if (skip) {
        session.blueprint = { summary: null, files_to_modify: [], files_to_create: [], skipped: true }
      } else {
        if (!summary) return toolError('summary is required when not skipping blueprint')
        session.blueprint = {
          summary,
          files_to_modify: files_to_modify ?? [],
          files_to_create: files_to_create ?? [],
          skipped: false,
        }
      }

      session.phase = PHASE.stories
      await saveSession(session)
      return ok({ blueprint: session.blueprint, phase: session.phase })
    },
  )
}
