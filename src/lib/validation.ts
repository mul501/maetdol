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

export function detectDependencyCycle<T extends string | number>(
  items: Array<{ id: T; depends_on: T[] }>,
  label: string,
): string | null {
  const visited = new Set<T>()
  const inStack = new Set<T>()
  const itemMap = new Map(items.map((item) => [item.id, item]))

  function dfs(id: T): string | null {
    if (inStack.has(id)) return `${label} ${id}`
    if (visited.has(id)) return null
    visited.add(id)
    inStack.add(id)
    const item = itemMap.get(id)
    if (item) {
      for (const dep of item.depends_on) {
        const cycle = dfs(dep)
        if (cycle) return cycle
      }
    }
    inStack.delete(id)
    return null
  }

  for (const item of items) {
    const cycle = dfs(item.id)
    if (cycle) return cycle
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
