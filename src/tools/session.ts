import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Session } from '../types.js'
import { loadSession, saveSession, findActiveSession, archiveSession, loadArchives } from '../lib/storage.js'
import { shortHash } from '../lib/hash.js'
import { ok, toolError } from '../lib/response.js'
import { PHASE } from '../lib/constants.js'

export function registerSessionTool(server: McpServer) {
  server.registerTool(
    'maetdol_session',
    {
      description: 'Session lifecycle: create, get, resume, complete, save_checkpoint, or list_archives',
      inputSchema: {
        action: z.enum(['create', 'get', 'resume', 'complete', 'save_checkpoint', 'list_archives']),
        session_id: z.string().optional(),
        task: z.string().optional(),
        project_id: z.string().optional(),
        checkpoint: z.string().max(200).optional(),
        type: z.enum(['maetdol', 'mongdol']).optional(),
        git_ref_range: z.string().optional(),
        scope_files: z.array(z.string()).optional(),
      },
    },
    async ({ action, session_id, task, project_id, checkpoint, type, git_ref_range, scope_files }) => {
      switch (action) {
        case 'create': {
          if (!task) {
            return toolError('task is required for create')
          }
          const projectId = project_id ?? shortHash(task)
          const sessionType = type ?? 'maetdol'

          // Check for existing active session of the same type
          const existing = await findActiveSession(projectId, sessionType)
          if (existing) {
            return ok({
              session: existing,
              is_resumed: false,
              resume_point: null,
              suggestion: `Active ${sessionType} session ${existing.id} found. Use action:"resume" with session_id:"${existing.id}" to continue.`,
            })
          }

          const session: Session = {
            id: randomUUID().slice(0, 12),
            project_id: projectId,
            task,
            phase: sessionType === 'mongdol' ? PHASE.decompose : PHASE.gate,
            gate: null,
            blueprint: null,
            stories: [],
            tasks: [],
            current_task_id: null,
            checkpoint: null,
            unstuck: { activations: 0, personas_used: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            type: sessionType,
            git_ref_range,
            scope_files,
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
          } else if (project_id) {
            session = await findActiveSession(project_id, type)
          }
          if (!session) return toolError('No active session found to resume')

          const resumePoint = {
            phase: session.phase,
            task_id: session.current_task_id,
            checkpoint: session.checkpoint,
            iteration: session.current_task_id
              ? session.tasks.find((t) => t.id === session.current_task_id)?.iterations ?? 0
              : 0,
          }
          return ok({ session, is_resumed: true, resume_point: resumePoint })
        }

        case 'complete': {
          if (!session_id) return toolError('session_id is required for complete')
          const session = await loadSession(session_id)
          if (!session) return toolError(`Session ${session_id} not found`)
          const completed: Session = { ...session, phase: PHASE.completed }
          await archiveSession(completed)
          return ok({ session: completed, is_resumed: false, resume_point: null })
        }

        case 'save_checkpoint': {
          if (!session_id) return toolError('session_id is required for save_checkpoint')
          if (!checkpoint) return toolError('checkpoint is required for save_checkpoint')
          const session = await loadSession(session_id)
          if (!session) return toolError(`Session ${session_id} not found`)
          await saveSession({ ...session, checkpoint })
          return ok({ checkpoint })
        }

        case 'list_archives': {
          if (!project_id) return toolError('project_id is required for list_archives')
          const archives = await loadArchives(project_id)
          return ok({
            archives: archives.map((s) => ({
              id: s.id,
              task: s.task,
              type: s.type ?? 'maetdol',
              tasks: s.tasks.map((t) => ({
                title: t.title,
                acceptance_criteria: t.acceptance_criteria,
                verify_result: t.verify_result,
                story_id: t.story_id,
              })),
              relevant_files: s.gate?.relevant_files ?? [],
              refined_task: s.gate?.refined_task ?? s.task,
              created_at: s.created_at,
            })),
          })
        }

        default: {
          const _exhaustive: never = action
          return toolError(`Unknown action: ${_exhaustive}`)
        }
      }
    },
  )
}
