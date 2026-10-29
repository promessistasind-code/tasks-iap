import type { ChurchEvent } from "./events"
export function eventFallsOn(
  event: Pick<ChurchEvent, "starts_at" | "ends_at">,
  day: Date
) {
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return new Date(event.starts_at) < end && new Date(event.ends_at) > start
}
export function dateInput(value: string) {
  const d = new Date(value)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
