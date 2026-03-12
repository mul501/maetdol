import { readFile, writeFile, mkdir, readdir, rm, rename, access } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Dirent } from 'node:fs'
import type { Session, SessionPhase } from '../types.js'
import { PHASE, MAX_ARCHIVE_PER_PROJECT } from './constants.js'

export const BASE_DIR = join(homedir(), '.maetdol')
export const SESSIONS_DIR = join(BASE_DIR, 'sessions')
const ARCHIVE_DIR = join(BASE_DIR, 'archive')

const dirReady = Promise.all([
  mkdir(SESSIONS_DIR, { recursive: true }),
  mkdir(ARCHIVE_DIR, { recursive: true }),
])

// ── Path Helpers ────────────────────────────────────────

function sessionDir(id: string): string {
  return join(SESSIONS_DIR, id)
}

function sessionFile(id: string): string {
  return join(SESSIONS_DIR, id, 'session.json')
}

function archiveDir(id: string): string {
  return join(ARCHIVE_DIR, id)
}

function archiveFile(id: string): string {
  return join(ARCHIVE_DIR, id, 'session.json')
}

function resolveEntryPath(baseDir: string, entry: Dirent): string | null {
  if (entry.isDirectory()) return join(baseDir, entry.name, 'session.json')
  if (entry.name.endsWith('.json')) return join(baseDir, entry.name)
  return null
}

async function deleteWithLegacyFallback(dirPath: string, legacyPath: string): Promise<boolean> {
  try {
    await rm(dirPath, { recursive: true })
    return true
  } catch {
    try {
      await rm(legacyPath)
      return true
    } catch {
      return false
    }
  }
}

// ── Migration Helpers ───────────────────────────────────

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

  session.checkpoint ??= null
  session.blueprint ??= null
  session.stories ??= []
  session.type ??= 'maetdol'

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

// ── Session CRUD ────────────────────────────────────────

export async function deleteSession(id: string): Promise<boolean> {
  await dirReady
  return deleteWithLegacyFallback(sessionDir(id), join(SESSIONS_DIR, `${id}.json`))
}

export async function loadSession(id: string): Promise<Session | null> {
  await dirReady
  for (const path of [sessionFile(id), join(SESSIONS_DIR, `${id}.json`)]) {
    try {
      const raw = await readFile(path, 'utf-8')
      return normalizeSession(JSON.parse(raw))
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw err
    }
  }
  return null
}

export async function saveSession(session: Session): Promise<void> {
  await dirReady
  await mkdir(sessionDir(session.id), { recursive: true })
  const toWrite = { ...session, updated_at: new Date().toISOString() }
  await writeFile(sessionFile(session.id), JSON.stringify(toWrite, null, 2), 'utf-8')
}

async function loadAllSessions(): Promise<Session[]> {
  await dirReady
  const entries = await readdir(SESSIONS_DIR, { withFileTypes: true })
  const sessions = await Promise.all(
    entries.map(async (entry) => {
      try {
        const filePath = resolveEntryPath(SESSIONS_DIR, entry)
        if (!filePath) return null
        const raw = await readFile(filePath, 'utf-8')
        return normalizeSession(JSON.parse(raw))
      } catch (err) {
        console.error(`maetdol: skipping corrupt session ${entry.name}:`, err instanceof Error ? err.message : err)
        return null
      }
    }),
  )
  return sessions.filter((s): s is Session => s !== null)
}

export async function findActiveSession(
  projectId: string,
  type?: 'maetdol' | 'mongdol',
): Promise<Session | null> {
  const sessions = await loadAllSessions()
  return sessions.find((s) =>
    s.project_id === projectId &&
    s.phase !== PHASE.completed &&
    (type ? (s.type ?? 'maetdol') === type : true),
  ) ?? null
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
  const entries = await readdir(SESSIONS_DIR, { withFileTypes: true })
  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        const filePath = resolveEntryPath(SESSIONS_DIR, entry)
        if (!filePath) return false
        const raw = await readFile(filePath, 'utf-8')
        const { project_id } = JSON.parse(raw) as { project_id?: string }
        if (project_id === projectId) {
          const removePath = entry.isDirectory() ? sessionDir(entry.name) : filePath
          await rm(removePath, { recursive: true, force: true })
          return true
        }
      } catch (err) {
        console.error(`maetdol: skipping corrupt session ${entry.name}:`, err instanceof Error ? err.message : err)
      }
      return false
    }),
  )
  return { sessions_removed: results.filter(Boolean).length }
}

export async function clearAllData(): Promise<{ sessions_removed: number }> {
  await dirReady
  const entries = await readdir(SESSIONS_DIR, { withFileTypes: true })
  const count = entries.filter((e) => e.isDirectory() || e.name.endsWith('.json')).length
  await rm(BASE_DIR, { recursive: true, force: true })
  return { sessions_removed: count }
}

// ── Preview All Data ─────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function previewAllData(projectId?: string): Promise<{
  sessions: Array<{ id: string; project_id: string; task: string; phase: SessionPhase; created_at: string }>
  archives: number
  hasConfig: boolean
  hasHook: boolean
}> {
  await dirReady

  const allSessions = await loadAllSessions()
  const filtered = projectId ? allSessions.filter((s) => s.project_id === projectId) : allSessions
  const sessions = filtered.map((s) => ({ id: s.id, project_id: s.project_id, task: s.task, phase: s.phase, created_at: s.created_at }))

  const archiveEntries = await readdir(ARCHIVE_DIR, { withFileTypes: true })
  let archiveCount: number
  if (projectId) {
    const matched = await Promise.all(
      archiveEntries.map(async (entry) => {
        try {
          const filePath = resolveEntryPath(ARCHIVE_DIR, entry)
          if (!filePath) return false
          const raw = await readFile(filePath, 'utf-8')
          const { project_id } = JSON.parse(raw) as { project_id?: string }
          return project_id === projectId
        } catch {
          return false
        }
      }),
    )
    archiveCount = matched.filter(Boolean).length
  } else {
    archiveCount = archiveEntries.filter((e) => e.isDirectory() || e.name.endsWith('.json')).length
  }

  const hasConfig = await fileExists(join(BASE_DIR, 'config.json'))

  let hasHook = false
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    const raw = await readFile(settingsPath, 'utf-8')
    hasHook = raw.includes('active-session-check.sh')
  } catch {
    // settings.json doesn't exist or unreadable
  }

  return { sessions, archives: archiveCount, hasConfig, hasHook }
}

// ── Archive ──────────────────────────────────────────────

export async function archiveSession(session: Session): Promise<void> {
  await dirReady
  const src = sessionDir(session.id)
  const dest = archiveDir(session.id)
  try {
    await rename(src, dest)
  } catch {
    // rename failed (cross-device, legacy flat file, or source missing)
    try { await rm(join(SESSIONS_DIR, `${session.id}.json`), { force: true }) } catch { /* ignore */ }
    await mkdir(dest, { recursive: true })
    const toWrite = { ...session, updated_at: new Date().toISOString() }
    await writeFile(archiveFile(session.id), JSON.stringify(toWrite, null, 2), 'utf-8')
    // Clean up source directory if it still exists
    try { await rm(src, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  await pruneArchives(session.project_id)
}

export async function loadArchives(projectId: string): Promise<Session[]> {
  await dirReady
  const entries = await readdir(ARCHIVE_DIR, { withFileTypes: true })
  const all = await Promise.all(
    entries.map(async (entry) => {
      try {
        const filePath = resolveEntryPath(ARCHIVE_DIR, entry)
        if (!filePath) return null
        const raw = await readFile(filePath, 'utf-8')
        return normalizeSession(JSON.parse(raw))
      } catch (err) {
        console.error(`maetdol: skipping corrupt archive ${entry.name}:`, err instanceof Error ? err.message : err)
        return null
      }
    }),
  )
  return all
    .filter((s): s is Session => s !== null && s.project_id === projectId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

async function pruneArchives(projectId: string): Promise<void> {
  const archives = await loadArchives(projectId)
  if (archives.length <= MAX_ARCHIVE_PER_PROJECT) return
  const toDelete = archives.slice(MAX_ARCHIVE_PER_PROJECT)
  for (const session of toDelete) {
    await deleteWithLegacyFallback(archiveDir(session.id), join(ARCHIVE_DIR, `${session.id}.json`))
  }
}

export async function deleteArchive(id: string): Promise<boolean> {
  await dirReady
  return deleteWithLegacyFallback(archiveDir(id), join(ARCHIVE_DIR, `${id}.json`))
}
