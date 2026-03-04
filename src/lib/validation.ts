export function validateCriteriaIndices(indices: number[], criteria: string[], label: string): string | null {
  for (const idx of indices) {
    if (idx < 0 || idx >= criteria.length) {
      return `Invalid criteria_met index ${idx}. ${label} has ${criteria.length} criteria (0-${criteria.length - 1}).`
    }
  }
  return null
}

export function validateDependencyRefs<T extends string | number>(
  items: Array<{ id: T; depends_on: T[] }>,
  label: string,
): string | null {
  const ids = new Set(items.map((item) => item.id))
  for (const item of items) {
    for (const depId of item.depends_on) {
      if (!ids.has(depId))
        return `${label} ${item.id} depends on non-existent ${label.toLowerCase()} ${depId}`
    }
  }
  return null
}

export function applyCriteriaMet(
  indices: number[],
  criteria: string[],
  results: Record<number, boolean>,
  label: string,
): string | null {
  const err = validateCriteriaIndices(indices, criteria, label)
  if (err) return err
  for (const idx of indices) {
    results[idx] = true
  }
  return null
}
