import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Session, TasksResult, UserStory } from '../types.js'
import { TASK_STATUSES } from '../types.js'
import { loadSession, saveSession } from '../lib/storage.js'
import { ok, toolError } from '../lib/response.js'

const MAX_EVIDENCE_LENGTH = 500

const TaskItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  depends_on: z.array(z.number()).default([]),
  acceptance_criteria: z.array(z.string()).default([]),
  story_id: z.string().nullable().default(null),
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
          if (session.phase === 'gate') {
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

          // Story auto-status: when task completes, check if story is ready for verification
          if (status === 'completed' && task.story_id) {
            const story = session.stories.find((s) => s.id === task.story_id)
            if (story && story.status !== 'completed') {
              const storyTasks = session.tasks.filter((t) => t.story_id === story.id)
              const allDone = storyTasks.every((t) => t.status === 'completed' || t.status === 'skipped')
              if (allDone) {
                story.status = 'ready_for_verify' // awaiting story-level verification
              }
            }
          }

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

        case 'decompose_stories': {
          if (!stories || stories.length === 0) return toolError('stories array is required for decompose_stories')

          // Check for circular dependencies among stories
          const storyCycle = detectDependencyCycle(stories, 'story')
          if (storyCycle) return toolError(`Circular story dependency detected: ${storyCycle}`)

          session.stories = stories.map((s) => ({
            id: s.id,
            title: s.title,
            acceptance_criteria: s.acceptance_criteria,
            criteria_results: {},
            evidence: null,
            depends_on: s.depends_on,
            status: s.depends_on.length > 0 ? 'blocked' : 'pending',
          }))
          session.phase = 'decompose'
          await saveSession(session)
          return ok({ stories: session.stories })
        }

        case 'verify_story': {
          if (!story_id) return toolError('story_id required for verify_story')
          const story = session.stories.find((s) => s.id === story_id)
          if (!story) return toolError(`Story ${story_id} not found`)

          // Check all tasks in this story are done
          const storyTasks = session.tasks.filter((t) => t.story_id === story.id)
          const allDone = storyTasks.every((t) => t.status === 'completed' || t.status === 'skipped')
          if (!allDone) return toolError(`Not all tasks in ${story_id} are complete`)

          if (criteria_met) {
            for (const idx of criteria_met) {
              if (idx < 0 || idx >= story.acceptance_criteria.length) {
                return toolError(`Invalid criteria_met index ${idx}. Story has ${story.acceptance_criteria.length} criteria (0-${story.acceptance_criteria.length - 1}).`)
              }
            }
            for (const idx of criteria_met) {
              story.criteria_results[String(idx)] = true
            }
          }
          if (evidence) {
            story.evidence = evidence
          }

          const allCriteriaMet = story.acceptance_criteria.every((_, i) => story.criteria_results[String(i)])
          story.status = allCriteriaMet ? 'completed' : 'ready_for_verify'

          // Auto-unblock dependent stories
          if (story.status === 'completed') {
            const storyById = new Map(session.stories.map((s) => [s.id, s]))
            for (const s of session.stories) {
              if (s.status !== 'blocked') continue
              const depsMet = s.depends_on.every((depId) => {
                const dep = storyById.get(depId)
                return dep && (dep.status === 'completed' || dep.status === 'skipped')
              })
              if (depsMet) s.status = 'pending'
            }
          }

          await saveSession(session)
          return ok({ story, all_criteria_met: allCriteriaMet })
        }
      }
    },
  )
}

function buildResult(session: Session): TasksResult {
  const completed = session.tasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length
  const total = session.tasks.length
  const nextTask = session.tasks.find((t) => t.status === 'pending') ?? null

  const totalCriteria = session.tasks.reduce((sum, t) => sum + t.acceptance_criteria.length, 0)
  const metCriteria = session.tasks.reduce((sum, t) => sum + Object.values(t.criteria_results).filter(Boolean).length, 0)

  return {
    tasks: session.tasks,
    next_task: nextTask,
    all_completed: completed === total && total > 0,
    progress: `${completed}/${total} completed`,
    criteria_progress: totalCriteria > 0 ? `${metCriteria}/${totalCriteria} criteria met` : null,
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
