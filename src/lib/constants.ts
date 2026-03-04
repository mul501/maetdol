export const PHASE = {
  gate: 'gate',
  design: 'design',
  stories: 'stories',
  decompose: 'decompose',
  ralph: 'ralph',
  verify: 'verify',
  completed: 'completed',
} as const

export const MAX_EVIDENCE_LENGTH = 500
export const AMBIGUITY_THRESHOLD = 0.3
export const MAX_TASK_ITERATIONS = 5
export const MAX_SESSION_ITERATIONS = 30
export const STAGNATION_THRESHOLD = 3
export const OSCILLATION_WINDOW = 4
