import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Session, TasksResult } from '../types.js'
import { TASK_STATUSES } from '../types.js'
import { loadSession, saveSession } from '../lib/storage.js'
import { ok, toolError } from '../lib/response.js'

const TaskItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  depends_on: z.array(z.number()).default([]),
})

export function registerTasksTool(server: McpServer) {
  server.registerTool(
    'maetdol_tasks',
    {
      description: 'Task decomposition and dependency management for maetdol sessions',
      inputSchema: {
        action: z.enum(['decompose', 'list', 'update', 'next']),
        session_id: z.string(),
        tasks: z.array(TaskItemSchema).optional(),
        task_id: z.number().optional(),
        status: z.enum(TASK_STATUSES).optional(),
      },
    },
    async ({ action, session_id, tasks, task_id, status }) => {
      const session = await loadSession(session_id)
      if (!session) return toolError(`Session ${session_id} not found`)

      switch (action) {
        case 'decompose': {
          if (session.phase === 'gate' && !session.gate?.passed) {
            return toolError('Gate must pass before decomposition. Call maetdol_score_ambiguity with session_id first.')
          }
          if (!tasks || tasks.length === 0) return toolError('tasks array is required for decompose')

          // Check for circular dependencies
          const cycle = detectCycle(tasks)
          if (cycle) return toolError(`Circular dependency detected: ${cycle}`)

          session.tasks = tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.depends_on.length > 0 ? 'blocked' : 'pending',
            depends_on: t.depends_on,
            iterations: 0,
            error_history: [],
            verify_result: null,
          }))
          session.phase = 'ralph'
          await saveSession(session)
          return ok(buildResult(session))
        }

        case 'list': {
          return ok(buildResult(session))
        }

        case 'update': {
          if (task_id == null || !status) return toolError('task_id and status required for update')
          const task = session.tasks.find((t) => t.id === task_id)
          if (!task) return toolError(`Task ${task_id} not found`)

          task.status = status
          if (status === 'in_progress') {
            session.current_task_id = task_id
          }

          // Auto-unblock dependents
          unblockDependents(session)

          // Check if all completed
          if (session.tasks.every((t) => t.status === 'completed' || t.status === 'skipped')) {
            session.phase = 'verify'
          }

          await saveSession(session)
          return ok(buildResult(session))
        }

        case 'next': {
          const changed = unblockDependents(session)
          if (changed) await saveSession(session)
          return ok(buildResult(session))
        }
      }
    },
  )
}

function buildResult(session: Session): TasksResult {
  const completed = session.tasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length
  const total = session.tasks.length
  const nextTask = session.tasks.find((t) => t.status === 'pending') ?? null

  return {
    tasks: session.tasks,
    next_task: nextTask,
    all_completed: completed === total && total > 0,
    progress: `${completed}/${total} completed`,
  }
}

function unblockDependents(session: Session): boolean {
  const byId = new Map(session.tasks.map((t) => [t.id, t]))
  let changed = false
  for (const task of session.tasks) {
    if (task.status !== 'blocked') continue
    const allDepsMet = task.depends_on.every((depId) => {
      const dep = byId.get(depId)
      return dep && (dep.status === 'completed' || dep.status === 'skipped')
    })
    if (allDepsMet) {
      task.status = 'pending'
      changed = true
    }
  }
  return changed
}

function detectCycle(tasks: Array<{ id: number; depends_on: number[] }>): string | null {
  const visited = new Set<number>()
  const inStack = new Set<number>()
  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  function dfs(id: number): string | null {
    if (inStack.has(id)) return `task ${id}`
    if (visited.has(id)) return null
    visited.add(id)
    inStack.add(id)
    const task = taskMap.get(id)
    if (task) {
      for (const dep of task.depends_on) {
        const cycle = dfs(dep)
        if (cycle) return cycle
      }
    }
    inStack.delete(id)
    return null
  }

  for (const task of tasks) {
    const cycle = dfs(task.id)
    if (cycle) return cycle
  }
  return null
}
