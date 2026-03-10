import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Session, SessionPhase } from '../types.js'
import { PHASE } from './constants.js'

const BASE_DIR = join(homedir(), '.maetdol')
const SESSIONS_DIR = join(BASE_DIR, 'sessions')

const dirReady = mkdir(SESSIONS_DIR, { recursive: true })

function migrateStringKeysToNumber(record: Record<string | number, boolean>): Record<number, boolean> {
  const result: Record<number, boolean> = {}
  for (const [key, value] of Object.entries(record)) {
    result[Number(key)] = value
  }
  return result
}

function normalizeSession(raw: unknown): Session {
  const s = raw as Record<string, unknown>

  if (typeof s.id !== 'string' || typeof s.project_id !== 'string' ||
      typeof s.task !== 'string' || typeof s.phase !== 'string') {
    throw new Error('Corrupt session: missing required fields (id, project_id, task, or phase)')
  }

  const session = s as unknown as Session

  session.blueprint ??= null
  session.stories ??= []

  for (const story of session.stories) {
    story.acceptance_criteria ??= []
    story.criteria_results = migrateStringKeysToNumber(story.criteria_results ?? {})
    story.evidence ??= null
    story.depends_on ??= []
    story.status ??= 'pending'
  }

  if (session.tasks) {
    for (const task of session.tasks) {
      task.verify_result ??= null
      task.acceptance_criteria ??= []
      task.criteria_results = migrateStringKeysToNumber(task.criteria_results ?? {})
      task.evidence ??= null
      task.story_id ??= null
      task.testable ??= false
      task.tdd_phase ??= null
    }
  }

  return session
}

export async function loadSession(id: string): Promise<Session | null> {
  await dirReady
  const path = join(SESSIONS_DIR, `${id}.json`)
  try {
    const raw = await readFile(path, 'utf-8')
    return normalizeSession(JSON.parse(raw))
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function saveSession(session: Session): Promise<void> {
  await dirReady
  const path = join(SESSIONS_DIR, `${session.id}.json`)
  const toWrite = { ...session, updated_at: new Date().toISOString() }
  await writeFile(path, JSON.stringify(toWrite, null, 2), 'utf-8')
}

async function loadAllSessions(): Promise<Session[]> {
  await dirReady
  const files = (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith('.json'))
  const sessions = await Promise.all(
    files.map(async (file) => {
      try {
        const raw = await readFile(join(SESSIONS_DIR, file), 'utf-8')
        return normalizeSession(JSON.parse(raw))
      } catch (err) {
        console.error(`maetdol: skipping corrupt session file ${file}:`, err instanceof Error ? err.message : err)
        return null
      }
    }),
  )
  return sessions.filter((s): s is Session => s !== null)
}

export async function findActiveSession(projectId: string): Promise<Session | null> {
  const sessions = await loadAllSessions()
  return sessions.find((s) => s.project_id === projectId && s.phase !== PHASE.completed) ?? null
}

export async function listSessions(projectId?: string): Promise<
  Array<{ id: string; project_id: string; task: string; phase: SessionPhase; created_at: string }>
> {
  const sessions = await loadAllSessions()
  const filtered = projectId ? sessions.filter((s) => s.project_id === projectId) : sessions
  return filtered.map((s) => ({ id: s.id, project_id: s.project_id, task: s.task, phase: s.phase, created_at: s.created_at }))
}

export async function clearProjectSessions(projectId: string): Promise<{ sessions_removed: number }> {
  await dirReady
  const files = (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith('.json'))
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const raw = await readFile(join(SESSIONS_DIR, file), 'utf-8')
        const { project_id } = JSON.parse(raw) as { project_id?: string }
        if (project_id === projectId) {
          await rm(join(SESSIONS_DIR, file), { force: true })
          return true
        }
      } catch (err) {
        console.error(`maetdol: skipping corrupt session file ${file}:`, err instanceof Error ? err.message : err)
      }
      return false
    }),
  )
  return { sessions_removed: results.filter(Boolean).length }
}

export async function clearAllData(): Promise<{ sessions_removed: number }> {
  await dirReady
  const files = (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith('.json'))
  const count = files.length
  await rm(BASE_DIR, { recursive: true, force: true })
  await mkdir(SESSIONS_DIR, { recursive: true })
  return { sessions_removed: count }
}
