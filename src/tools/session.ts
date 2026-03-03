import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Session } from '../types.js'
import { loadSession, saveSession, findActiveSession } from '../lib/storage.js'
import { shortHash } from '../lib/hash.js'
import { ok, toolError } from '../lib/response.js'

export function registerSessionTool(server: McpServer) {
  server.registerTool(
    'maetdol_session',
    {
      description: 'Session lifecycle: create, get, resume, or complete a maetdol session',
      inputSchema: {
        action: z.enum(['create', 'get', 'resume', 'complete']),
        session_id: z.string().optional(),
        task: z.string().optional(),
        project_hash: z.string().optional(),
      },
    },
    async ({ action, session_id, task, project_hash }) => {
      switch (action) {
        case 'create': {
          if (!task) {
            return toolError('task is required for create')
          }
          const hash = project_hash ?? shortHash(task)

          // Check for existing active session
          const existing = await findActiveSession(hash)
          if (existing) {
            return ok({
              session: existing,
              is_resumed: false,
              resume_point: null,
              suggestion: `Active session ${existing.id} found. Use action:"resume" with session_id:"${existing.id}" to continue.`,
            })
          }

          const session: Session = {
            id: randomUUID().slice(0, 12),
            project_hash: hash,
            task,
            phase: 'gate',
            gate: null,
            tasks: [],
            current_task_id: null,
            unstuck: { activations: 0, personas_used: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          await saveSession(session)
          return ok({ session, is_resumed: false, resume_point: null })
        }

        case 'get': {
          if (!session_id) return toolError('session_id is required for get')
          const session = await loadSession(session_id)
          if (!session) return toolError(`Session ${session_id} not found`)
          return ok({ session, is_resumed: false, resume_point: null })
        }

        case 'resume': {
          let session: Session | null = null
          if (session_id) {
            session = await loadSession(session_id)
          } else if (project_hash) {
            session = await findActiveSession(project_hash)
          }
          if (!session) return toolError('No active session found to resume')

          const resumePoint = {
            phase: session.phase,
            task_id: session.current_task_id,
            iteration: session.current_task_id
              ? session.tasks.find((t) => t.id === session!.current_task_id)?.iterations ?? 0
              : 0,
          }
          return ok({ session, is_resumed: true, resume_point: resumePoint })
        }

        case 'complete': {
          if (!session_id) return toolError('session_id is required for complete')
          const session = await loadSession(session_id)
          if (!session) return toolError(`Session ${session_id} not found`)
          const completed: Session = { ...session, phase: 'completed' }
          await saveSession(completed)
          return ok({ session: completed, is_resumed: false, resume_point: null })
        }
      }
    },
  )
}
