import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

interface Notice {
  id: string
  kind: "assigned" | "time" | "cancelled" | "reopened" | "approved" | "rejected" | "swap_requested"
  requester?: string
  event_id: string | null
  title: string | null
  starts_at: string | null
  ends_at?: string | null
  ministry?: string
  duty?: string
}

export function useAssignmentNotices() {
  const [items, setItems] = useState<Notice[]>([])
  const [error, setError] = useState(false)
  const request = useRef({ sequence: 0 })
  const refresh = useCallback(async (readAssignment?: string) => {
    const version = ++request.current.sequence
    try {
      const result = await supabase.rpc("schedule_notifications_v2", {
        read_notice: readAssignment ?? null,
      })
      if (result.error) throw result.error
      if (version === request.current.sequence) {
        setItems(result.data ?? [])
        setError(false)
      }
    } catch {
      if (version === request.current.sequence) setError(true)
    }
  }, [])
  useEffect(() => {
    const currentRequest = request.current
    const load = () => { if (!document.hidden) void refresh() }
    load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener("focus", load)
    window.addEventListener("events-changed", load)
    document.addEventListener("visibilitychange", load)
    return () => {
      currentRequest.sequence++
      window.clearInterval(timer)
      window.removeEventListener("focus", load)
      window.removeEventListener("events-changed", load)
      document.removeEventListener("visibilitychange", load)
    }
  }, [refresh])
  return { items, error, refresh }
}
