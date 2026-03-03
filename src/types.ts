// ── Session ──────────────────────────────────────────────

export interface GateResult {
  score: number
  passed: boolean
  refined_task: string
  rounds: Array<{ question: string; answer: string }>
}

export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'blocked', 'skipped'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface TaskItem {
  id: number
  title: string
  status: TaskStatus
  depends_on: number[]
  iterations: number
  error_history: Array<{ hash: string; summary: string }>
}

export type SessionPhase = 'gate' | 'decompose' | 'ralph' | 'verify' | 'completed'

export interface Session {
  id: string
  project_hash: string
  task: string
  phase: SessionPhase
  gate: GateResult | null
  tasks: TaskItem[]
  current_task_id: number | null
  unstuck: { activations: number; personas_used: string[] }
  created_at: string
  updated_at: string
}

// ── Ambiguity Scoring ────────────────────────────────────

export interface AmbiguityBreakdown {
  goal: number
  constraints: number
  criteria: number
}

export interface AmbiguityResult {
  ambiguity: number
  breakdown: AmbiguityBreakdown
  passed: boolean
  suggestions: string[]
}

// ── Ralph / Stagnation ───────────────────────────────────

export interface RalphIterateResult {
  iteration: number
  should_continue: boolean
  stagnation_detected: boolean
  consecutive_same_error: number
  session_total_iterations: number
}

export type StagnationType = 'spinning' | 'oscillation'

export interface StagnationPattern {
  type: StagnationType
  detected: boolean
  confidence: number
}

export interface StagnationResult {
  patterns: StagnationPattern[]
  recommended_persona: 'contrarian' | 'simplifier' | null
}

// ── Tasks Tool ───────────────────────────────────────────

export interface TasksResult {
  tasks: TaskItem[]
  next_task: TaskItem | null
  all_completed: boolean
  progress: string
}
