export const PHASE = {
  gate: 'gate',
  blueprint: 'blueprint',
  stories: 'stories',
  decompose: 'decompose',
  ralph: 'ralph',
  verify: 'verify',
  completed: 'completed',
} as const

export const MAX_EVIDENCE_LENGTH = 500
export const AMBIGUITY_THRESHOLD = 0.3
export const DIMENSION_THRESHOLD = 0.7
export const BLUEPRINT_SKIP_THRESHOLD = 0.15
export const MAX_TASK_ITERATIONS = 5
export const MAX_SESSION_ITERATIONS = 30
export const STAGNATION_THRESHOLD = 3
export const OSCILLATION_WINDOW = 4
export const MIN_EVIDENCE_LENGTH = 20
export const MAX_VERIFY_ROUNDS = 2

export const MAX_POLISH_ITERATIONS = 3
export const MAX_MONGDOL_SESSION_ITERATIONS = 10
export const MAX_POLISH_ITEMS = 5
export const MAX_ARCHIVE_PER_PROJECT = 5
export const DEFAULT_REVIEW_TIMEOUT = 1800

export const AMBIGUITY_WEIGHTS = {
  round1: { goal: 0.30, constraints: 0.20, criteria: 0.20, interaction: 0.15, context: 0.15 },
  round2plus: { goal: 0.25, constraints: 0.20, criteria: 0.20, interaction: 0.15, context: 0.20 },
} as const
