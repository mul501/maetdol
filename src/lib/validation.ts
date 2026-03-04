export function validateCriteriaIndices(indices: number[], criteria: string[], label: string): string | null {
  for (const idx of indices) {
    if (idx < 0 || idx >= criteria.length) {
      return `Invalid criteria_met index ${idx}. ${label} has ${criteria.length} criteria (0-${criteria.length - 1}).`
    }
  }
  return null
}
