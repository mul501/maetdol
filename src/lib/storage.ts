import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Session } from '../types.js'

const BASE_DIR = join(homedir(), '.maetdol')
const SESSIONS_DIR = join(BASE_DIR, 'sessions')

const dirReady = mkdir(SESSIONS_DIR, { recursive: true })

function normalizeSession(raw: unknown): Session {
  const session = raw as Session

  if (session.tasks) {
    for (const task of session.tasks) {
      task.verify_result ??= null
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

export async function findActiveSession(projectHash: string): Promise<Session | null> {
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
  return sessions.find((s) => s != null && s.project_hash === projectHash && s.phase !== 'completed') ?? null
}
