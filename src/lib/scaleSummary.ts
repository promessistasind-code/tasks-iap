import type { EventDetail } from "./events"

export function scaleSummary(detail: EventDetail) {
  const wholeEvent = detail.event.canManage
  const rows = wholeEvent ? detail.assignments : detail.assignments.filter(a => a.canManage || a.canPastorManage)
  if (!wholeEvent && !detail.scheduleMinistries.length && !rows.length) return null
  const count = (filter: (a: EventDetail["assignments"][number]) => boolean) =>
    new Set(rows.filter(filter).map(a => a.personId)).size
  return {
    confirmed: count(a => a.response === "confirmed"),
    pending: count(a => a.response === "pending"),
    declined: count(a => a.response === "declined"),
    swaps: count(a => !!a.swapPending),
  }
}
