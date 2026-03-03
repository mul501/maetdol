import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RalphIterateResult } from '../types.js'
import { loadSession, saveSession } from '../lib/storage.js'
import { ok, toolError } from '../lib/response.js'

const MAX_TASK_ITERATIONS = 5
const MAX_SESSION_ITERATIONS = 30
const STAGNATION_THRESHOLD = 3

export function registerRalphIterateTool(server: McpServer) {
  server.registerTool(
    'maetdol_ralph_iterate',
    {
      description:
        'Record a ralph loop iteration for a task. Tracks error hashes and detects per-task stagnation.',
      inputSchema: {
        session_id: z.string(),
        task_id: z.number(),
        error_hash: z.string().optional().describe('SHA-256 prefix (8 chars) of the error output'),
        error_summary: z.string().optional().describe('Human-readable error summary'),
      },
    },
    async ({ session_id, task_id, error_hash, error_summary }) => {
      const session = await loadSession(session_id)
      if (!session) return toolError(`Session ${session_id} not found`)

      const task = session.tasks.find((t) => t.id === task_id)
      if (!task) return toolError(`Task ${task_id} not found`)

      // Increment iteration
      task.iterations++

      // Record error if provided
      if (error_hash) {
        task.error_history.push({
          hash: error_hash,
          summary: error_summary ?? '',
        })
      }

      // Count consecutive same errors
      let consecutiveSame = 0
      if (error_hash && task.error_history.length >= 2) {
        for (let i = task.error_history.length - 1; i >= 0; i--) {
          if (task.error_history[i].hash === error_hash) {
            consecutiveSame++
          } else {
            break
          }
        }
      }

      // Calculate total session iterations
      const sessionTotal = session.tasks.reduce((sum, t) => sum + t.iterations, 0)

      // Determine if we should continue
      const stagnationDetected = consecutiveSame >= STAGNATION_THRESHOLD
      const taskMaxReached = task.iterations >= MAX_TASK_ITERATIONS
      const sessionMaxReached = sessionTotal >= MAX_SESSION_ITERATIONS
      const shouldContinue = !taskMaxReached && !sessionMaxReached

      await saveSession(session)

      const result: RalphIterateResult = {
        iteration: task.iterations,
        should_continue: shouldContinue,
        stagnation_detected: stagnationDetected,
        consecutive_same_error: consecutiveSame,
        session_total_iterations: sessionTotal,
      }

      return ok(result)
    },
  )
}
