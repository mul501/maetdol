import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { clearAllData, clearProjectSessions, deleteSession, deleteArchive, previewAllData } from '../lib/storage.js'
import { ok, toolError } from '../lib/response.js'

export function registerUninstallTool(server: McpServer) {
  server.registerTool(
    'maetdol_uninstall',
    {
      description: 'Preview or delete all maetdol session data (~/.maetdol/)',
      inputSchema: {
        action: z.enum(['preview', 'confirm']),
        project_id: z.string().optional(),
        session_id: z.string().optional(),
      },
    },
    async ({ action, project_id, session_id }) => {
      switch (action) {
        case 'preview': {
          const { sessions, archives, hasConfig, hasHook } = await previewAllData(project_id)
          return ok({ sessions, total: sessions.length, archives, hasConfig, hasHook })
        }

        case 'confirm': {
          if (session_id) {
            const deleted = await deleteSession(session_id)
            if (!deleted) {
              const deletedArchive = await deleteArchive(session_id)
              if (!deletedArchive) return toolError(`Session ${session_id} not found`)
              return ok({ archive_removed: session_id })
            }
            return ok({ session_removed: session_id })
          }
          const result = project_id
            ? await clearProjectSessions(project_id)
            : await clearAllData()
          return ok(result)
        }

        default: {
          const _exhaustive: never = action
          return toolError(`Unknown action: ${_exhaustive}`)
        }
      }
    },
  )
}
