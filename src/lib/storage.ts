import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Session } from '../types.js'

const BASE_DIR = join(homedir(), '.maetdol')
const SESSIONS_DIR = join(BASE_DIR, 'sessions')

const dirReady = mkdir(SESSIONS_DIR, { recursive: true })

function normalizeSession(raw: unknown): Session {
  const session = raw as Session

  session.stories ??= []

  for (const story of session.stories) {
    story.acceptance_criteria ??= []
    story.criteria_results ??= {}
    story.evidence ??= null
    story.depends_on ??= []
    story.status ??= 'pending'
  }

  if (session.tasks) {
    for (const task of session.tasks) {
      task.verify_result ??= null
      task.acceptance_criteria ??= []
      task.criteria_results ??= {}
      task.evidence ??= null
      task.story_id ??= null
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
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
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
      } catch {
        return null
      }
    }),
  )
  return sessions.filter((s): s is Session => s !== null)
}

export async function findActiveSession(projectHash: string): Promise<Session | null> {
  const sessions = await loadAllSessions()
  return sessions.find((s) => s.project_hash === projectHash && s.phase !== 'completed') ?? null
}

export async function listSessions(): Promise<
  Array<{ id: string; task: string; phase: string; created_at: string }>
> {
  const sessions = await loadAllSessions()
  return sessions.map((s) => ({ id: s.id, task: s.task, phase: s.phase, created_at: s.created_at }))
}

export async function clearAllData(): Promise<{ sessions_removed: number }> {
  await dirReady
  const files = (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith('.json'))
  const count = files.length
  await rm(BASE_DIR, { recursive: true, force: true })
  return { sessions_removed: count }
}
