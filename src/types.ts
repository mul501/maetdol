import { PHASE } from './lib/constants.js'

// ── Session ──────────────────────────────────────────────

export type VerifyResult = 'pass' | 'fail' | null

export interface GateResult {
  score: number
  passed: boolean
  refined_task: string
  project_type?: 'new' | 'existing'
  relevant_files?: string[]
}

export interface DesignResult {
  summary: string | null
  files_to_modify: string[]
  files_to_create: string[]
  skipped: boolean
}

export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'blocked', 'skipped', 'ready_for_verify'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface TaskItem {
  id: number
  title: string
  status: TaskStatus
  depends_on: number[]
  iterations: number
  error_history: Array<{ hash: string; summary: string }>
  verify_result: VerifyResult
  acceptance_criteria: string[]
  criteria_results: Record<number, boolean>
  evidence: string | null
  story_id: string | null
}

export type SessionPhase = (typeof PHASE)[keyof typeof PHASE]

export interface UserStory {
  id: string
  title: string
  acceptance_criteria: string[]
  criteria_results: Record<number, boolean>
  evidence: string | null
  depends_on: string[]
  status: TaskStatus
}

export interface Session {
  id: string
  project_id: string
  task: string
  phase: SessionPhase
  gate: GateResult | null
  design: DesignResult | null
  stories: UserStory[]
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
  context: number
}

export interface AmbiguityResult {
  ambiguity: number
  breakdown: AmbiguityBreakdown
  passed: boolean
  suggestions: string[]
  weakest_dimension: keyof AmbiguityBreakdown
}

// ── Ralph / Stagnation ───────────────────────────────────

export interface RalphIterateResult {
  iteration: number
  should_continue: boolean
  stagnation_detected: boolean
  consecutive_same_error: number
  session_total_iterations: number
  verify_result: VerifyResult
  evidence: string | null
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
  criteria_progress: string | null
}
