import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listSessions, clearAllData } from '../lib/storage.js'
import { ok } from '../lib/response.js'

export function registerTeardownTool(server: McpServer) {
  server.registerTool(
    'maetdol_teardown',
    {
      description: 'Preview or delete all maetdol session data (~/.maetdol/)',
      inputSchema: {
        action: z.enum(['preview', 'confirm']),
      },
    },
    async ({ action }) => {
      switch (action) {
        case 'preview': {
          const sessions = await listSessions()
          return ok({ sessions, total: sessions.length })
        }

        case 'confirm': {
          const result = await clearAllData()
          return ok(result)
        }
      }
    },
  )
}
