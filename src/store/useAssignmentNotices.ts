import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

interface Notice {
  id: string
  event_id: string
  title: string
  starts_at: string
  ministry: string
  duty: string
}

export function useAssignmentNotices() {
  const [items, setItems] = useState<Notice[]>([])
  const [error, setError] = useState(false)
  const request = useRef(0)
  const refresh = useCallback(async (readAssignment?: string) => {
    const version = ++request.current
    try {
      const result = await supabase.rpc("assignment_notifications", {
        read_assignment: readAssignment ?? null,
      })
      if (result.error) throw result.error
      if (version === request.current) {
        setItems(result.data ?? [])
        setError(false)
      }
    } catch {
      if (version === request.current) setError(true)
    }
  }, [])
  useEffect(() => {
    const load = () => { if (!document.hidden) void refresh() }
    load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener("focus", load)
    window.addEventListener("events-changed", load)
    document.addEventListener("visibilitychange", load)
    return () => {
      request.current++
      window.clearInterval(timer)
      window.removeEventListener("focus", load)
      window.removeEventListener("events-changed", load)
      document.removeEventListener("visibilitychange", load)
    }
  }, [refresh])
  return { items, error, refresh }
}
