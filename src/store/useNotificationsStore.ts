import { useState, useEffect } from "react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { AppNotification } from "@/types/notification"

function mapNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as string,
    recipientId: row.recipient_id as string,
    actorId: (row.actor_id as string) ?? null,
    type: row.type as AppNotification["type"],
    projectId: (row.project_id as string) ?? null,
    taskId: (row.task_id as string) ?? null,
    status: row.status as AppNotification["status"],
    createdAt: row.created_at as string,
  }
}

export function useNotificationsStore(userId: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let active = true
    let running = false
    let dirty = false
    const controller = new AbortController()
    async function load() {
      if (running) { dirty = true; return }
      running = true
      try {
        const { data, error } = await supabase.from("lt_notifications").select("*")
          .eq("recipient_id", userId).eq("status", "pending").order("created_at", { ascending: false }).abortSignal(controller.signal)
        if (error) throw error
        if (active) setNotifications((data ?? []).map(mapNotification))
      } catch { if (active) toast.error("Não foi possível carregar notificações") }
      finally {
        running = false
        if (active) { setLoading(false); if (dirty) { dirty = false; void load() } }
      }
    }
    void load()
    const channel = supabase
      .channel(`notifications_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lt_notifications", filter: `recipient_id=eq.${userId}` }, () => {
        load()
      })
      .subscribe()
    return () => { active = false; controller.abort(); void supabase.removeChannel(channel) }
  }, [userId])

  async function sendProjectInvite(recipientId: string, projectId: string): Promise<boolean> {
    const { error } = await supabase.rpc("send_project_invite", { p_project_id: projectId, p_recipient_id: recipientId })
    if (error) { toast.error("Erro ao enviar convite"); return false }
    return true
  }

  async function cancelInvite(recipientId: string, projectId: string): Promise<boolean> {
    const { error } = await supabase.rpc("cancel_project_invite", { p_project_id: projectId, p_recipient_id: recipientId })
    if (error) { toast.error("Erro ao cancelar convite"); return false }
    return true
  }

  async function respond(id: string, accept: boolean): Promise<boolean> {
    const { error } = await supabase.rpc("respond_project_invite", { p_notification_id: id, p_accept: accept })
    if (error) { toast.error("Não foi possível responder ao convite"); return false }
    setNotifications(prev => prev.filter(n => n.id !== id))
    return true
  }

  async function acceptInvite(notification: AppNotification): Promise<boolean> {
    const ok = await respond(notification.id, true)
    if (ok) { toast.success("Você entrou no projeto!"); window.dispatchEvent(new Event("project-access-changed")) }
    return ok
  }

  async function dismissNotification(id: string): Promise<boolean> { return respond(id, false) }

  return { notifications, notificationsLoading: loading, sendProjectInvite, cancelInvite, acceptInvite, dismissNotification }
}
