import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Session, TaskItem, TaskStatus, TasksResult } from '../types.js'
import { TASK_STATUSES } from '../types.js'
import { loadSession, saveSession } from '../lib/storage.js'
import { ok, toolError } from '../lib/response.js'
import { MAX_EVIDENCE_LENGTH, PHASE } from '../lib/constants.js'
import { validateDependencyRefs, applyCriteriaMet } from '../lib/validation.js'

const TaskItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  depends_on: z.array(z.number()).default([]),
  acceptance_criteria: z.array(z.string()).default([]),
  story_id: z.string().nullable().default(null),
  testable: z.boolean().default(false),
})

const StorySchema = z.object({
  id: z.string(),
  title: z.string(),
  acceptance_criteria: z.array(z.string()).min(1),
  depends_on: z.array(z.string()).default([]),
})

export function registerTasksTool(server: McpServer) {
  server.registerTool(
    'maetdol_tasks',
    {
      description: 'Task decomposition and dependency management for maetdol sessions',
      inputSchema: {
        action: z.enum(['decompose', 'decompose_stories', 'list', 'update', 'next', 'verify_story']),
        session_id: z.string(),
        tasks: z.array(TaskItemSchema).optional(),
        task_id: z.number().optional(),
        status: z.enum(TASK_STATUSES).optional(),
        stories: z.array(StorySchema).optional(),
        story_id: z.string().optional(),
        criteria_met: z.array(z.number()).optional().describe('Indices of story acceptance_criteria verified (for verify_story)'),
        evidence: z.string().max(MAX_EVIDENCE_LENGTH).optional().describe('Verification evidence (for verify_story)'),
      },
    },
    async ({ action, session_id, tasks, task_id, status, stories, story_id, criteria_met, evidence }) => {
      const session = await loadSession(session_id)
      if (!session) return toolError(`Session ${session_id} not found`)

      switch (action) {
        case 'decompose': {
          if (session.phase === PHASE.gate) {
            if (!session.gate) {
              return toolError(`Gate not started. Call maetdol_score_ambiguity with session_id="${session_id}" first.`)
            }
            if (!session.gate.passed) {
              return toolError(`Gate did not pass (ambiguity: ${session.gate.score.toFixed(2)}). Refine with maetdol_score_ambiguity.`)
            }
          }
          if (!tasks || tasks.length === 0) return toolError('tasks array is required for decompose')

          const cycle = detectDependencyCycle(tasks, 'task')
          if (cycle) return toolError(`Circular dependency detected: ${cycle}`)

          const depErr = validateDependencyRefs(tasks, 'Task')
          if (depErr) return toolError(depErr)

          for (const t of tasks) {
            if (t.story_id && !session.stories.some((s) => s.id === t.story_id)) {
              return toolError(`Task ${t.id} references non-existent story_id "${t.story_id}"`)
            }
          }

          session.tasks = tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.depends_on.length > 0 ? 'blocked' : 'pending',
            depends_on: t.depends_on,
            iterations: 0,
            error_history: [],
            verify_result: null,
            acceptance_criteria: t.acceptance_criteria,
            criteria_results: {},
            evidence: null,
            story_id: t.story_id,
            testable: t.testable,
            tdd_phase: null,
          }))
          session.phase = PHASE.ralph
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
          if (status === 'completed' || status === 'skipped') {
            unblockByDeps(session.tasks)
          }

          // Story auto-status: when task completes, check if story is ready for verification
          if (status === 'completed' && task.story_id) {
            const story = session.stories.find((s) => s.id === task.story_id)
            if (story && story.status !== 'completed' && areStoryTasksDone(session.tasks, story.id)) {
              story.status = 'ready_for_verify' // awaiting story-level verification
            }
          }

          // Check if all completed
          if (session.tasks.every((t) => t.status === 'completed' || t.status === 'skipped')) {
            session.phase = PHASE.verify
          }

          await saveSession(session)
          return ok(buildResult(session))
        }

        case 'next': {
          const changed = unblockByDeps(session.tasks)
          if (changed) await saveSession(session)
          return ok(buildResult(session))
        }

        case 'decompose_stories': {
          if (!stories || stories.length === 0) return toolError('stories array is required for decompose_stories')

          // Check for circular dependencies among stories
          const storyCycle = detectDependencyCycle(stories, 'story')
          if (storyCycle) return toolError(`Circular story dependency detected: ${storyCycle}`)

          const storyDepErr = validateDependencyRefs(stories, 'Story')
          if (storyDepErr) return toolError(storyDepErr)

          session.stories = stories.map((s) => ({
            id: s.id,
            title: s.title,
            acceptance_criteria: s.acceptance_criteria,
            criteria_results: {},
            evidence: null,
            depends_on: s.depends_on,
            status: s.depends_on.length > 0 ? 'blocked' : 'pending',
          }))
          session.phase = PHASE.decompose
          await saveSession(session)
          return ok({ stories: session.stories })
        }

        case 'verify_story': {
          if (!story_id) return toolError('story_id required for verify_story')
          const story = session.stories.find((s) => s.id === story_id)
          if (!story) return toolError(`Story ${story_id} not found`)

          // Check all tasks in this story are done
          if (!areStoryTasksDone(session.tasks, story.id)) {
            return toolError(`Not all tasks in ${story_id} are complete`)
          }

          if (criteria_met) {
            const err = applyCriteriaMet(criteria_met, story.acceptance_criteria, story.criteria_results, 'Story')
            if (err) return toolError(err)
          }
          if (evidence) {
            story.evidence = evidence
          }

          const allCriteriaMet = story.acceptance_criteria.every((_, i) => story.criteria_results[i])
          story.status = allCriteriaMet ? 'completed' : 'ready_for_verify'

          // Auto-unblock dependent stories
          if (story.status === 'completed') {
            unblockByDeps(session.stories)
          }

          await saveSession(session)
          return ok({ story, all_criteria_met: allCriteriaMet })
        }

        default: {
          const _exhaustive: never = action
          return toolError(`Unknown action: ${_exhaustive}`)
        }
      }
    },
  )
}

function areStoryTasksDone(tasks: TaskItem[], storyId: string): boolean {
  return tasks
    .filter((t) => t.story_id === storyId)
    .every((t) => t.status === 'completed' || t.status === 'skipped')
}

function buildResult(session: Session): TasksResult {
  let completed = 0
  let nextTask: TaskItem | null = null
  let totalCriteria = 0
  let metCriteria = 0

  for (const t of session.tasks) {
    if (t.status === 'completed' || t.status === 'skipped') completed++
    if (!nextTask && t.status === 'pending') nextTask = t
    totalCriteria += t.acceptance_criteria.length
    metCriteria += Object.values(t.criteria_results).filter(Boolean).length
  }

  const total = session.tasks.length
  return {
    tasks: session.tasks,
    next_task: nextTask,
    all_completed: completed === total && total > 0,
    progress: `${completed}/${total} completed`,
    criteria_progress: totalCriteria > 0 ? `${metCriteria}/${totalCriteria} criteria met` : null,
  }
}

function unblockByDeps<T extends { id: string | number; status: TaskStatus; depends_on: (string | number)[] }>(
  items: T[],
): boolean {
  const byId = new Map(items.map((item) => [item.id, item]))
  let changed = false
  for (const item of items) {
    if (item.status !== 'blocked') continue
    if (
      item.depends_on.every((depId) => {
        const dep = byId.get(depId)
        return dep && (dep.status === 'completed' || dep.status === 'skipped')
      })
    ) {
      item.status = 'pending' as T['status']
      changed = true
    }
  }
  return changed
}

function detectDependencyCycle<T extends string | number>(
  items: Array<{ id: T; depends_on: T[] }>,
  label: string,
): string | null {
  const visited = new Set<T>()
  const inStack = new Set<T>()
  const itemMap = new Map(items.map((item) => [item.id, item]))

  function dfs(id: T): string | null {
    if (inStack.has(id)) return `${label} ${id}`
    if (visited.has(id)) return null
    visited.add(id)
    inStack.add(id)
    const item = itemMap.get(id)
    if (item) {
      for (const dep of item.depends_on) {
        const cycle = dfs(dep)
        if (cycle) return cycle
      }
    }
    inStack.delete(id)
    return null
  }

  for (const item of items) {
    const cycle = dfs(item.id)
    if (cycle) return cycle
  }
  return null
}
