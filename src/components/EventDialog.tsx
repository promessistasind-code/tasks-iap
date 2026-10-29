import { dateInput } from "@/lib/eventDates"
import { useEffect, useState } from "react"
import { useApp } from "@/context/AppContext"
import { eventApi, type EventDetail, type MinistryOption } from "@/lib/events"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { showConfirm } from "@/components/ConfirmDialog"
const responseLabel = {
  pending: "Pendente",
  confirmed: "Confirmado",
  declined: "Recusado",
}
interface Props {
  eventId: string | null
  createMinistryId?: string
  creatableMinistries: MinistryOption[]
  onClose: () => void
}
export function EventDialog({
  eventId,
  createMinistryId,
  creatableMinistries,
  onClose,
}: Props) {
  const { ministryCatalog } = useApp()
  const [detail, setDetail] = useState<EventDetail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [editing, setEditing] = useState(!eventId)
  const [form, setForm] = useState(() => ({
    ministryId: createMinistryId ?? creatableMinistries[0]?.id ?? "",
    title: "",
    description: "",
    location: "",
    startsAt: dateInput(new Date().toISOString()),
    endsAt: dateInput(new Date(Date.now() + 3600000).toISOString()),
    sharedWith: [] as string[],
    cancelled: false,
  }))
  const [scheduleMinistry, setScheduleMinistry] = useState(""),
    [personId, setPersonId] = useState(""),
    [functionId, setFunctionId] = useState(""),
    [candidates, setCandidates] = useState<
      { id: string; name: string; functionIds: string[] }[]
    >([])
  useEffect(() => {
    if (!eventId) return
    let active = true
    void eventApi<EventDetail>("detail", { eventId })
      .then((data) => {
        if (active) {
          setDetail(data)
          setError("")
          setEditing(false)
        }
      })
      .catch(() => {
        if (active) {
          setDetail(null)
          setError("Este evento não está disponível ou seu acesso mudou.")
        }
      })
    return () => {
      active = false
    }
  }, [eventId, revision])
  useEffect(() => {
    if (!eventId || !scheduleMinistry) return
    let active = true
    void eventApi<typeof candidates>("candidates", {
      eventId,
      ministryId: scheduleMinistry,
    })
      .then((rows) => {
        if (active) setCandidates(rows)
      })
      .catch(() => {
        if (active) {
          setCandidates([])
          toast.error("Não foi possível consultar os integrantes elegíveis.")
        }
      })
    return () => {
      active = false
    }
  }, [eventId, scheduleMinistry, revision])
  async function action(op: string, payload: Record<string, unknown>) {
    if (busy) return false
    setBusy(true)
    try {
      await eventApi(op, payload)
      window.dispatchEvent(new Event("events-changed"))
      setRevision((r) => r + 1)
      toast.success("Evento atualizado")
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar")
      return false
    } finally {
      setBusy(false)
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      toast.error("O término deve ser posterior ao início.")
      return
    }
    if (
      await action("save", {
        ...form,
        id: eventId ?? undefined,
        version: detail?.event.version,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      })
    )
      onClose()
  }
  function edit() {
    if (!detail) return
    const e = detail.event
    setForm({
      ministryId: e.ministry_id,
      title: e.title,
      description: e.description,
      location: e.location,
      startsAt: dateInput(e.starts_at),
      endsAt: dateInput(e.ends_at),
      sharedWith: e.shared_with,
      cancelled: e.cancelled,
    })
    setEditing(true)
  }
  const ministryName = (id: string) =>
    ministryCatalog.find((m) => m.id === id)?.name ?? "Ministério"
  const eligibleFunctions =
    ministryCatalog
      .find((m) => m.id === scheduleMinistry)
      ?.functions.filter((f) =>
        candidates.find((p) => p.id === personId)?.functionIds.includes(f.id)
      ) ?? []
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {!eventId
              ? "Novo evento"
              : editing
                ? "Editar evento"
                : (detail?.event.title ?? "Evento")}
          </DialogTitle>
          <DialogDescription>
            Evento e escalas vinculadas dos ministérios participantes.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert">{error}</p>}
        {eventId && !detail && !error && (
          <p role="status">Carregando evento…</p>
        )}
        {editing && (!eventId || detail?.event.canManage) && (
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <label className="block space-y-1 text-sm">
                Ministério responsável
                <select
                  aria-label="Ministério responsável"
                  disabled={!!eventId}
                  className="w-full rounded border bg-background p-2"
                  value={form.ministryId}
                  onChange={(e) =>
                    setForm({ ...form, ministryId: e.target.value })
                  }
                >
                  {creatableMinistries.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                Nome do evento
                <Input
                  required
                  maxLength={160}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="block space-y-1 text-sm">
                Descrição
                <Textarea
                  maxLength={5000}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1 text-sm">
                Local
                <Input
                  maxLength={300}
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Início
                  <Input
                    required
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) =>
                      setForm({ ...form, startsAt: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  Término
                  <Input
                    required
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) =>
                      setForm({ ...form, endsAt: e.target.value })
                    }
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Horários no fuso deste dispositivo. Alterar o horário ou reabrir
                um evento cancelado exige nova confirmação dos participantes.
              </p>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Compartilhar com outros ministérios
                </legend>
                <p className="text-xs text-muted-foreground">
                  Eles poderão consultar o evento e organizar suas próprias
                  atribuições, sem alterar os dados acima.
                </p>
                {ministryCatalog
                  .filter((m) => m.id !== form.ministryId)
                  .map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={form.sharedWith.includes(m.id)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            sharedWith: e.target.checked
                              ? [...form.sharedWith, m.id]
                              : form.sharedWith.filter((id) => id !== m.id),
                          })
                        }
                      />
                      {m.name}
                    </label>
                  ))}
              </fieldset>
              {eventId && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.cancelled}
                    onChange={(e) =>
                      setForm({ ...form, cancelled: e.target.checked })
                    }
                  />
                  Evento cancelado — preservar histórico
                </label>
              )}
            </fieldset>
            <Button disabled={busy || !form.ministryId} type="submit">
              Salvar evento
            </Button>
          </form>
        )}
        {!editing && detail && (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {ministryName(detail.event.ministry_id)}
                {detail.event.cancelled ? " · Cancelado" : ""}
              </p>
              <p>
                {new Date(detail.event.starts_at).toLocaleString()} —{" "}
                {new Date(detail.event.ends_at).toLocaleString()}
              </p>
              <p className="text-sm">
                {detail.event.location || "Local não informado"}
              </p>
              <p className="text-sm break-words whitespace-pre-wrap">
                {detail.event.description}
              </p>
              {detail.event.canManage && (
                <Button variant="outline" onClick={edit}>
                  Editar evento
                </Button>
              )}
            </div>
            <section className="space-y-3">
              <h3 className="font-semibold">Escalas dos ministérios</h3>
              {!detail.assignments.length && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma pessoa escalada.
                </p>
              )}
              {detail.assignments.map((a) => (
                <div key={a.id} className="space-y-2 rounded border p-3">
                  <p className="font-medium">
                    {a.name} · {a.functionName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ministryName(a.ministryId)} · {responseLabel[a.response]}
                  </p>
                  {!detail.event.cancelled && (
                    <div className="flex flex-wrap gap-2">
                      {a.canRespond && (
                        <>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void action("respond", {
                                eventId,
                                assignmentId: a.id,
                                response: "confirmed",
                              })
                            }
                          >
                            Confirmar presença
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void action("respond", {
                                eventId,
                                assignmentId: a.id,
                                response: "declined",
                              })
                            }
                          >
                            Recusar
                          </Button>
                        </>
                      )}
                      {a.canManage && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await showConfirm({
                                title: "Retirar esta atribuição?",
                                description: "O histórico será preservado.",
                              })
                            )
                              await action("unassign", {
                                eventId,
                                assignmentId: a.id,
                              })
                          }}
                        >
                          Retirar da escala
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </section>
            {!detail.event.cancelled &&
              detail.scheduleMinistries.length > 0 && (
                <section className="space-y-3 rounded border p-3">
                  <h3 className="font-semibold">Adicionar à escala</h3>
                  <label className="block text-sm">
                    Ministério da atribuição
                    <select
                      aria-label="Ministério da atribuição"
                      className="mt-1 w-full rounded border bg-background p-2"
                      value={scheduleMinistry}
                      onChange={(e) => {
                        setScheduleMinistry(e.target.value)
                        setCandidates([])
                        setPersonId("")
                        setFunctionId("")
                      }}
                    >
                      <option value="">Selecione</option>
                      {detail.scheduleMinistries.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Pessoa
                    <select
                      aria-label="Pessoa"
                      className="mt-1 w-full rounded border bg-background p-2"
                      value={personId}
                      onChange={(e) => {
                        setPersonId(e.target.value)
                        setFunctionId("")
                      }}
                    >
                      <option value="">Selecione</option>
                      {candidates.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Função na escala
                    <select
                      aria-label="Função na escala"
                      className="mt-1 w-full rounded border bg-background p-2"
                      value={functionId}
                      onChange={(e) => setFunctionId(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {eligibleFunctions.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Apenas integrantes ativos, com cadastro autorizado e função
                    correspondente.
                  </p>
                  <Button
                    disabled={busy || !personId || !functionId}
                    onClick={() =>
                      void action("assign", {
                        eventId,
                        ministryId: scheduleMinistry,
                        personId,
                        functionId,
                      })
                    }
                  >
                    Adicionar pessoa
                  </Button>
                </section>
              )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
