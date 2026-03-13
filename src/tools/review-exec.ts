import { z } from 'zod'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ChildProcess } from 'node:child_process'
import { ok, toolError } from '../lib/response.js'
import { DEFAULT_REVIEW_TIMEOUT } from '../lib/constants.js'
import { BASE_DIR, SESSIONS_DIR } from '../lib/storage.js'

interface RunningReview {
  process: ChildProcess
  reviewFile: string
  timer: NodeJS.Timeout
  completed: boolean
  exitCode: number | null
  filtered?: boolean
}

const runningReviews = new Map<string, RunningReview>()

const REVIEW_START_MARKER = '## Review Findings'
const REVIEW_END_MARKER = '## End Review'

function filterReviewContent(content: string): { filtered: boolean; content: string } {
  const startIdx = content.lastIndexOf(REVIEW_START_MARKER)
  if (startIdx === -1) return { filtered: false, content }

  const endIdx = content.indexOf(REVIEW_END_MARKER, startIdx)
  if (endIdx === -1) return { filtered: false, content }

  const extracted = content.slice(startIdx, endIdx + REVIEW_END_MARKER.length).trim()
  return { filtered: true, content: extracted }
}

function reviewKey(sessionId: string, reviewType: string): string {
  return `${sessionId}:${reviewType}`
}

async function loadConfig(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(join(BASE_DIR, 'config.json'), 'utf-8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function registerReviewExecTool(server: McpServer) {
  server.registerTool(
    'maetdol_review_exec',
    {
      description: 'Execute external review CLI as a background process (start/check)',
      inputSchema: {
        action: z.enum(['start', 'check']),
        session_id: z.string(),
        review_type: z.enum(['blueprint', 'code', 'final']),
        prompt: z.string().optional(),
      },
    },
    async ({ action, session_id, review_type, prompt }) => {
      const key = reviewKey(session_id, review_type)

      switch (action) {
        case 'start': {
          if (!prompt) return toolError('prompt is required for start action')

          const existing = runningReviews.get(key)
          if (existing && !existing.completed) {
            return toolError(`Review already running for ${session_id}:${review_type}`)
          }

          const config = await loadConfig()
          const cli = config.review_cli as string | undefined
          const flags = config.review_cli_flags as string | undefined
          const timeout = (config.review_timeout as number | undefined) ?? DEFAULT_REVIEW_TIMEOUT

          if (!cli) return toolError('No review_cli configured in ~/.maetdol/config.json')

          const reviewFile = join(SESSIONS_DIR, session_id, `${review_type}-review.md`)
          await mkdir(join(SESSIONS_DIR, session_id), { recursive: true })

          const fullCmd = flags ? `${cli} ${flags}` : cli
          const child = spawn(fullCmd, [], {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: true,
          })

          const outStream = createWriteStream(reviewFile)
          child.stdout?.pipe(outStream)
          child.stderr?.pipe(outStream)

          child.stdin?.write(prompt)
          child.stdin?.end()

          const review: RunningReview = {
            process: child,
            reviewFile,
            timer: setTimeout(() => {
              if (review.completed) return
              review.completed = true
              review.exitCode = -1
              runningReviews.delete(key)
              if (child.pid != null) {
                try { process.kill(-child.pid, 'SIGTERM') } catch { /* ignore */ }
              } else {
                try { child.kill('SIGTERM') } catch { /* already dead */ }
              }
            }, timeout * 1000),
            completed: false,
            exitCode: null,
          }

          child.on('close', (code) => {
            outStream.end()
            if (review.completed) return
            review.completed = true
            review.exitCode = code
            clearTimeout(review.timer)
          })

          child.on('error', () => {
            outStream.end()
            if (review.completed) return
            review.completed = true
            review.exitCode = -1
            runningReviews.delete(key)
            clearTimeout(review.timer)
          })

          runningReviews.set(key, review)

          return ok({
            started: true,
            review_file: reviewFile,
            timeout_seconds: timeout,
          })
        }

        case 'check': {
          const review = runningReviews.get(key)
          const reviewFile = join(SESSIONS_DIR, session_id, `${review_type}-review.md`)

          if (!review) {
            try {
              let content = await readFile(reviewFile, 'utf-8')
              const result = filterReviewContent(content)
              if (result.filtered) {
                await writeFile(reviewFile, result.content, 'utf-8')
                content = result.content
              }
              return ok({
                completed: true,
                review_file: reviewFile,
                exit_code: null,
                content_preview: content.slice(0, 500),
                filtered: result.filtered,
              })
            } catch {
              return ok({ completed: false, review_file: reviewFile, not_started: true })
            }
          }

          if (review.completed) {
            let contentPreview: string | undefined
            let filtered = review.filtered ?? false
            try {
              let content = await readFile(reviewFile, 'utf-8')
              if (!review.filtered) {
                const result = filterReviewContent(content)
                if (result.filtered) {
                  await writeFile(reviewFile, result.content, 'utf-8')
                  content = result.content
                }
                filtered = result.filtered
                review.filtered = filtered
              }
              contentPreview = content.slice(0, 500)
            } catch { /* file may be empty */ }

            runningReviews.delete(key)

            return ok({
              completed: true,
              review_file: reviewFile,
              exit_code: review.exitCode,
              content_preview: contentPreview,
              filtered,
            })
          }

          return ok({
            completed: false,
            review_file: reviewFile,
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
