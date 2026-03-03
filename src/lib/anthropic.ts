import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic()
  }
  return client
}

export interface ScoringResponse {
  goal: number
  constraints: number
  criteria: number
  suggestions: string[]
}

/**
 * Call Anthropic API for ambiguity scoring.
 * Uses low temperature for deterministic JSON output.
 */
export async function scoreAmbiguity(context: string, round: number): Promise<ScoringResponse> {
  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    temperature: 0.1,
    system: `You are a task clarity scorer. Analyze the given task description and return ONLY valid JSON with these fields:
- goal (0.0-1.0): How clear is the end goal?
- constraints (0.0-1.0): How well-defined are the constraints/scope?
- criteria (0.0-1.0): How measurable are the success criteria?
- suggestions (string[]): List of clarifying questions if scores are low.

Round ${round}: ${round > 1 ? 'Previous questions were already answered. Score the REFINED version.' : 'Initial scoring.'}

Return ONLY the JSON object, no markdown fences.`,
    messages: [{ role: 'user', content: context }],
  })

  const text = response.content[0]
  if (text.type !== 'text') {
    throw new Error('Unexpected response type from scoring API')
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text.text)
  } catch {
    throw new Error(`Scoring API returned invalid JSON: ${text.text.slice(0, 200)}`)
  }

  // Validate and clamp values
  const clamp = (v: unknown): number => Math.max(0, Math.min(1, Number(v) || 0))

  return {
    goal: clamp(parsed.goal),
    constraints: clamp(parsed.constraints),
    criteria: clamp(parsed.criteria),
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s): s is string => typeof s === 'string')
      : [],
  }
}
