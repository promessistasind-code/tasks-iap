import { useEffect, useState, useCallback } from "react"
import { eventApi, type EventFeed } from "@/lib/events"
export function useEvents(start: string, end: string) {
  const range = `${start}/${end}`
  const [state, setState] = useState<{
    range: string
    data: EventFeed
    error: boolean
  }>({ range: "", data: { items: [], creatableMinistries: [] }, error: false })
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((r) => r + 1), [])
  useEffect(() => {
    let active = true,
      running = false,
      dirty = false
    async function load() {
      if (!active) return
      if (running) {
        dirty = true
        return
      }
      running = true
      try {
        const result = await eventApi<EventFeed>("list", { start, end })
        if (active)
          setState({
            range,
            data: {
              items: result.items ?? [],
              creatableMinistries: result.creatableMinistries ?? [],
            },
            error: false,
          })
      } catch {
        if (active)
          setState({
            range,
            data: { items: [], creatableMinistries: [] },
            error: true,
          })
      } finally {
        running = false
        if (active && dirty) {
          dirty = false
          void load()
        }
      }
    }
    const refresh = () => void load()
    void load()
    window.addEventListener("focus", refresh)
    window.addEventListener("events-changed", refresh)
    return () => {
      active = false
      window.removeEventListener("focus", refresh)
      window.removeEventListener("events-changed", refresh)
    }
  }, [start, end, range, revision])
  const current = state.range === range
  return {
    items: current ? state.data.items : [],
    creatableMinistries: current ? state.data.creatableMinistries : [],
    error: current && state.error,
    loading: !current,
    reload,
  }
}
