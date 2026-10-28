export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex(existing => existing.id === item.id)
  if (index < 0) return [item, ...items]
  return items.map(existing => existing.id === item.id ? item : existing)
}
