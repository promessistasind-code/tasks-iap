import { useApp } from "@/context/AppContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { MemberAvatar } from "@/components/MemberAvatar"
import { Bell, Check, X, FolderKanban } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useState } from "react"
import { EventDialog } from "@/components/EventDialog"
import { useAssignmentNotices } from "@/store/useAssignmentNotices"

const labels = {assigned:"Você foi escalado",time:"Horário alterado",cancelled:"Evento cancelado",reopened:"Evento reaberto",approved:"Sua troca foi aprovada",rejected:"Sua troca foi recusada"}

export function NotificationBell() {
  const { notifications, members, projects, acceptInvite, dismissNotification } = useApp()
  const notices = useAssignmentNotices()
  const [open, setOpen] = useState(false)
  const [eventId, setEventId] = useState<string | null>(null)
  const total = notifications.length + notices.items.length

  return (
    <>
    <DropdownMenu open={open} onOpenChange={value => { setOpen(value); if (value) void notices.refresh() }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 relative" title="Notificações">
          <Bell className="size-4" />
          {total > 0 && (
            <Badge
              className="absolute -top-1 -right-1 size-4 p-0 flex items-center justify-center text-[9px] rounded-full border-0 text-white"
              style={{ background: "var(--brand-orange)" }}
            >
              {total > 9 ? "9+" : total}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[95vw] max-h-[75vh] overflow-y-auto">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notices.error && <p role="alert" className="p-2 text-xs">Não foi possível atualizar os avisos de escala. <button onClick={() => void notices.refresh()}>Tentar novamente</button></p>}
        {notices.items.map(n => (
          <div key={n.id} className="space-y-1 border-b p-2">
            <p className="text-sm font-medium">{labels[n.kind]}{n.title && " · " + n.title}</p>
            <p className="text-xs text-muted-foreground">{[n.ministry,n.duty,n.starts_at && new Date(n.starts_at).toLocaleString("pt-BR")].filter(Boolean).join(" · ")}{n.kind === "time" && n.ends_at && " até " + new Date(n.ends_at).toLocaleString("pt-BR")}</p>
            <div className="flex gap-2">
              {n.event_id && <Button size="sm" onClick={() => { setOpen(false); setEventId(n.event_id) }}>Abrir evento</Button>}
              <Button size="sm" variant="ghost" onClick={() => void notices.refresh(n.id)}>Marcar como lido</Button>
            </div>
          </div>
        ))}
        {total === 0 && !notices.error ? (
          <p className="text-xs text-muted-foreground text-center py-6">Nenhuma notificação pendente</p>
        ) : (
          <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
            {notifications.map(n => {
              const actor = members.find(m => m.id === n.actorId)
              const project = projects.find(p => p.id === n.projectId)
              return (
                <div key={n.id} className="flex flex-col gap-2 p-2 rounded-md hover:bg-muted/50">
                  <div className="flex items-start gap-2">
                    {actor ? <MemberAvatar member={actor} size="sm" /> : <FolderKanban className="size-6 text-muted-foreground" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-snug">
                        <span className="font-semibold">{actor?.name ?? "Alguém"}</span> convidou você pra o projeto{" "}
                        <span className="font-semibold">{project?.name ?? "desconhecido"}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => dismissNotification(n.id)}>
                      <X className="size-3" /> Recusar
                    </Button>
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => acceptInvite(n)}>
                      <Check className="size-3" /> Aceitar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    {eventId && <EventDialog key={eventId} eventId={eventId} creatableMinistries={[]} onClose={() => { setEventId(null); void notices.refresh() }} />}
    </>
  )
}
