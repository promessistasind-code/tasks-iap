import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { EventDialog } from "@/components/EventDialog"
import { showConfirm } from "@/lib/confirm"
import { schedulingApi } from "@/lib/scheduling"
import { peopleApi } from "@/lib/people"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

const statusLabels = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Recusada",
  cancelled: "Cancelada",
  resolved: "Resolvida",
}
type Scope = "mine" | "review"
type Action = "approve" | "reject" | "cancel" | "resolve"
const actions = {
  approve: "Aprovar troca",
  reject: "Recusar troca",
  cancel: "Cancelar pedido",
  resolve: "Marcar como resolvida",
}
interface RequestItem {
  id: string
  kind: "swap" | "profile"
  status: keyof typeof statusLabels
  title: string
  description: string
  created_at: string
  event_id: string | null
  can_cancel: boolean
  can_decide: boolean
  can_approve: boolean
}
const pageSize = 25
export function RequestsPage() {
  const [scope, setScope] = useState<Scope>("mine")
  const [offset, setOffset] = useState(0)
  const [response, setResponse] = useState<{ key: string; items: RequestItem[] | null } | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [eventId, setEventId] = useState<string | null>(null)
  const key = `${scope}/${offset}/${revision}`
  const rows = response?.key === key ? response.items : null
  const error = response?.key === key && response.items === null
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = await supabase.rpc("request_center", {
          scope,
          page_offset: offset,
        })
        if (result.error) throw result.error
        if (active) setResponse({ key, items: result.data ?? [] })
      } catch {
        if (active) setResponse({ key, items: null })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [scope, offset, key])
  async function act(row: RequestItem, action: Action) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    try {
      if (
        !(await showConfirm({
          title: actions[action] + "?",
          description: row.title,
          confirmLabel: actions[action],
        }))
      )
        return
      if (action === "resolve")
        await peopleApi("resolveRequest", { id: row.id })
      else
        await schedulingApi(action === "cancel" ? "cancelSwap" : "decideSwap", {
          eventId: row.event_id,
          swapId: row.id,
          decision: action,
        })
      toast.success("Solicitação atualizada")
      window.dispatchEvent(new Event("events-changed"))
      setOffset(0)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Não foi possível atualizar a solicitação"
      )
    } finally {
      locked.current = false
      setBusy(false)
      setRevision((r) => r + 1)
    }
  }
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Solicitações</h1>
      <div className="flex flex-wrap gap-2">
        {(["mine", "review"] as const).map((s) => (
          <Button
            key={s}
            disabled={busy}
            aria-pressed={scope === s}
            variant={scope === s ? "default" : "outline"}
            onClick={() => {
              setScope(s)
              setOffset(0)
            }}
          >
            {s === "mine" ? "Meus pedidos" : "Para decidir"}
          </Button>
        ))}
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => setRevision((r) => r + 1)}
        >
          Atualizar
        </Button>
      </div>
      {error ? (
        <p role="alert">
          Não foi possível carregar os pedidos. Use Atualizar para tentar
          novamente.
        </p>
      ) : rows === null ? (
        <p role="status">Carregando solicitações…</p>
      ) : rows.length === 0 ? (
        <p>
          {scope === "mine"
            ? "Você ainda não enviou solicitações."
            : "Nenhuma solicitação aguardando sua decisão."}
        </p>
      ) : (
        rows.slice(0, pageSize).map((row) => (
          <article
            key={row.kind + row.id}
            className="space-y-2 rounded border p-3"
          >
            <p className="text-xs text-muted-foreground">
              {row.kind === "swap" ? "Troca de escala" : "Cadastro"} ·{" "}
              {statusLabels[row.status]} ·{" "}
              {new Date(row.created_at).toLocaleDateString("pt-BR")}
            </p>
            <h2 className="font-semibold">{row.title}</h2>
            <p className="break-words whitespace-pre-wrap">{row.description}</p>
            <div className="flex flex-wrap gap-2">
              {row.event_id && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEventId(row.event_id)}
                >
                  Abrir evento
                </Button>
              )}
              {row.can_approve && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void act(row, "approve")}
                >
                  {actions.approve}
                </Button>
              )}
              {row.can_decide && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void act(row, row.kind === "swap" ? "reject" : "resolve")
                  }
                >
                  {row.kind === "swap" ? actions.reject : actions.resolve}
                </Button>
              )}
              {row.can_cancel && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void act(row, "cancel")}
                >
                  {actions.cancel}
                </Button>
              )}
            </div>
          </article>
        ))
      )}
      {(offset > 0 || (rows?.length ?? 0) > pageSize) && (
        <div className="flex gap-2">
          <Button
            disabled={busy || !offset}
            onClick={() => setOffset((o) => o - pageSize)}
          >
            Anterior
          </Button>
          <Button
            disabled={busy || (rows?.length ?? 0) <= pageSize}
            onClick={() => setOffset((o) => o + pageSize)}
          >
            Próxima
          </Button>
        </div>
      )}
      {eventId && (
        <EventDialog
          eventId={eventId}
          creatableMinistries={[]}
          onClose={() => {
            setEventId(null)
            setRevision((r) => r + 1)
          }}
        />
      )}
    </main>
  )
}
