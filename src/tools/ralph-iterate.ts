import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RalphIterateResult } from '../types.js'
import { TDD_PHASES } from '../types.js'
import { loadSession, saveSession } from '../lib/storage.js'
import { ok, toolError } from '../lib/response.js'
import { redactSecrets } from '../lib/redact.js'
import { MAX_EVIDENCE_LENGTH, MAX_TASK_ITERATIONS, MAX_SESSION_ITERATIONS, STAGNATION_THRESHOLD, PHASE } from '../lib/constants.js'
import { applyCriteriaMet } from '../lib/validation.js'

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
        verify_result: z.enum(['pass', 'fail']).optional().describe('Result of the verification step for this iteration'),
        evidence: z.string().max(MAX_EVIDENCE_LENGTH).optional().describe('Verification evidence (actual terminal output). Required when verify_result is "pass"'),
        criteria_met: z.array(z.number()).optional().describe('Indices of acceptance_criteria verified this iteration'),
        tdd_phase: z.enum(TDD_PHASES).optional().describe('Current TDD phase for testable tasks: red, green, or refactor'),
      },
    },
    async ({ session_id, task_id, error_hash, error_summary, verify_result, evidence, criteria_met, tdd_phase }) => {
      const session = await loadSession(session_id)
      if (!session) return toolError(`Session ${session_id} not found`)

      if (session.phase !== PHASE.ralph) {
        return toolError(`Cannot iterate in phase "${session.phase}". Decompose tasks first.`)
      }

      const task = session.tasks.find((t) => t.id === task_id)
      if (!task) return toolError(`Task ${task_id} not found`)

      if (verify_result === 'pass' && !evidence) {
        return toolError('evidence required when verify_result is "pass". Paste actual test/build output.')
      }

      // TDD phase handling
      if (tdd_phase && !task.testable) {
        return toolError(`Task ${task_id} is not testable — cannot use tdd_phase`)
      }

      let tddWarning: string | null = null

      if (task.testable && !tdd_phase && task.tdd_phase === null) {
        tddWarning = 'Testable task should start with tdd_phase="red". Consider starting the TDD cycle.'
      }

      // TDD phase transitions
      let skipError = false
      if (tdd_phase === 'red' && verify_result === 'fail') {
        skipError = true
        task.tdd_phase = 'green'
      } else if (tdd_phase === 'red' && verify_result === 'pass') {
        task.tdd_phase = 'red' // Stay in red — test needs fixing
        tddWarning = 'Test passed in RED phase. The test may not be verifying the right thing — review and fix the test.'
      } else if (tdd_phase === 'green' && verify_result === 'pass') {
        task.tdd_phase = 'refactor'
      } else if (tdd_phase === 'refactor' && verify_result === 'pass') {
        task.tdd_phase = null // TDD cycle complete
      } else if (tdd_phase) {
        task.tdd_phase = tdd_phase // fallback: GREEN+fail, REFACTOR+fail, etc.
      }

      if (verify_result) {
        task.verify_result = verify_result
      }

      if (evidence) {
        task.evidence = evidence
      }

      if (criteria_met) {
        const err = applyCriteriaMet(criteria_met, task.acceptance_criteria, task.criteria_results, 'Task')
        if (err) return toolError(err)
      }

      // Increment iteration
      task.iterations++

      // Record error if provided (skip for expected RED failures)
      if (error_hash && !skipError) {
        task.error_history.push({
          hash: error_hash,
          summary: redactSecrets(error_summary ?? ''),
        })
      }

      // Count consecutive same errors
      let consecutiveSame = 0
      if (error_hash && !skipError && task.error_history.length >= 2) {
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
        verify_result: task.verify_result,
        evidence: task.evidence,
        tdd_phase: task.tdd_phase,
        tdd_warning: tddWarning,
      }

      return ok(result)
    },
  )
}
