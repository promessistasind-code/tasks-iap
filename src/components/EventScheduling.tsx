import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  schedulingApi,
  deviceTimezone,
  type ScheduleState,
} from "@/lib/scheduling"
import type { EventDetail } from "@/lib/events"
import { showConfirm } from "@/components/ConfirmDialog"
import { toast } from "sonner"
import { repertoireApi } from "@/lib/repertoire"
const labels = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Recusada",
  cancelled: "Cancelada",
}
export function EventScheduling({
  detail,
  onChanged,
}: {
  detail: EventDetail
  onChanged: () => void
}) {
  const [state, setState] = useState<ScheduleState | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false)
  const [frequency, setFrequency] = useState("weekly"),
    [count, setCount] = useState(4),
    [copy, setCopy] = useState(false),
    [preview, setPreview] = useState<
      { startsAt: string; endsAt: string }[] | null
    >(null)
  const [assignment, setAssignment] = useState(""),
    [replacement, setReplacement] = useState(""),
    [candidates, setCandidates] = useState<{ id: string; name: string }[]>([])
  const e = detail.event
  const [copyRepertoire, setCopyRepertoire] = useState(false)
  const [repertoireVersion, setRepertoireVersion] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    void schedulingApi<ScheduleState>("state", { eventId: e.id })
      .then((r) => {
        if (active) {
          setState(r)
          setError("")
        }
      })
      .catch(() => {
        if (active) {
          setState(null)
          setError("Não foi possível consultar conflitos e trocas.")
        }
      })
    return () => {
      active = false
    }
  }, [detail, e.id, revision])
  useEffect(() => {
    if (!assignment) return
    let active = true
    void schedulingApi<typeof candidates>("swapCandidates", {
      eventId: e.id,
      assignmentId: assignment,
    })
      .then((r) => {
        if (active) setCandidates(r)
      })
      .catch((err) => {
        if (active) {
          setCandidates([])
          toast.error(err.message)
        }
      })
    return () => {
      active = false
    }
  }, [assignment, e.id, revision])
  async function action(op: string, payload: Record<string, unknown>) {
    if (busy) return false
    setBusy(true)
    try {
      await schedulingApi(op, { eventId: e.id, ...payload })
      setRevision((r) => r + 1)
      onChanged()
      window.dispatchEvent(new Event("events-changed"))
      toast.success("Escala atualizada")
      return true
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível salvar"
      )
      return false
    } finally {
      setBusy(false)
    }
  }
  const repeatPayload = {
    version: e.version,
    frequency,
    count,
    copyAssignments: copy,
    copyRepertoire,
    repertoireVersion,
    timezone: deviceTimezone(),
  }
  async function getPreview() {
    if (busy) return
    setBusy(true)
    setPreview(null)
    try {
      const source = copyRepertoire ? await repertoireApi('read', e.id) : null
      if (copyRepertoire && (!source?.enabled || !source.canEdit || !source.version)) {
        throw new Error('Habilite e salve o repertório antes de copiá-lo para a série.')
      }
      const version = source?.version ?? null
      setPreview(
        await schedulingApi("repeatPreview", {
          eventId: e.id,
          ...repeatPayload,
          repertoireVersion: version,
        })
      )
      setRepertoireVersion(version)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível preparar a série"
      )
    } finally {
      setBusy(false)
    }
  }
  const own = detail.assignments.filter(
    (a) =>
      a.canRespond &&
      !state?.swaps?.some(
        (s) => s.assignmentId === a.id && s.status === "pending"
      )
  )
  return (
    <div className="space-y-5 border-t pt-4">
      {error && (
        <p role="alert">
          {error}{" "}
          <Button variant="link" onClick={() => setRevision((r) => r + 1)}>
            Tentar novamente
          </Button>
        </p>
      )}
      {!!state?.conflicts?.length && (
        <p
          role="alert"
          className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950"
        >
          Conflito de disponibilidade:{" "}
          {detail.assignments
            .filter((a) => state.conflicts.includes(a.id))
            .map((a) => a.name)
            .join(", ")}
          . Revise a escala com os participantes.
        </p>
      )}
      {!e.cancelled && own.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold">Solicitar troca</h3>
          <p className="text-sm text-muted-foreground">
            Sua atribuição continua válida até a liderança aprovar. O substituto
            aprovado ainda precisará confirmar presença.
          </p>
          <label className="block text-sm">
            Minha atribuição
            <select
              aria-label="Minha atribuição"
              value={assignment}
              onChange={(ev) => {
                setAssignment(ev.target.value)
                setReplacement("")
                setCandidates([])
              }}
              className="mt-1 w-full rounded border bg-background p-2"
            >
              <option value="">Selecione</option>
              {own.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.functionName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Substituto elegível
            <select
              aria-label="Substituto elegível"
              value={replacement}
              onChange={(ev) => setReplacement(ev.target.value)}
              className="mt-1 w-full rounded border bg-background p-2"
            >
              <option value="">Selecione</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={busy || !assignment || !replacement}
            onClick={() =>
              void action("requestSwap", {
                assignmentId: assignment,
                replacementId: replacement,
              })
            }
          >
            Enviar solicitação de troca
          </Button>
        </section>
      )}
      {!!state?.swaps?.length && (
        <section className="space-y-3">
          <h3 className="font-semibold">Solicitações de troca</h3>
          {state.swaps.map((s) => (
            <div key={s.id} className="space-y-2 rounded border p-3">
              <p className="text-sm">
                {s.personName} → {s.replacementName} · {labels[s.status]}
              </p>
              <div className="flex flex-wrap gap-2">
                {s.canDecide && (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await showConfirm({
                            title: "Aprovar troca?",
                            description: `A atribuição passará para ${s.replacementName}, com presença pendente.`,
                            confirmLabel: "Aprovar troca",
                          })
                        )
                          await action("decideSwap", {
                            swapId: s.id,
                            decision: "approve",
                          })
                      }}
                    >
                      Aprovar troca
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void action("decideSwap", {
                          swapId: s.id,
                          decision: "reject",
                        })
                      }
                    >
                      Recusar troca
                    </Button>
                  </>
                )}
                {s.canCancel && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void action("cancelSwap", { swapId: s.id })}
                  >
                    Cancelar solicitação
                  </Button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      {e.canManage && !e.cancelled && !e.series_id && (
        <section className="space-y-3 rounded border p-3">
          <h3 className="font-semibold">Repetir evento</h3>
          <p className="text-sm text-muted-foreground">
            A quantidade inclui este evento. Cada ocorrência poderá ser editada
            separadamente. Feriados não são pulados; meses mais curtos usam o
            último dia.
          </p>
          <label className="block text-sm">
            Frequência
            <select
              aria-label="Frequência"
              disabled={busy}
              value={frequency}
              onChange={(ev) => {
                setFrequency(ev.target.value)
                setPreview(null)
              }}
              className="ml-2 rounded border bg-background p-2"
            >
              <option value="weekly">Semanal</option>
              <option value="fortnightly">Quinzenal</option>
              <option value="monthly">Mensal</option>
            </select>
          </label>
          <label className="block text-sm">
            Quantidade de eventos
            <Input
              type="number"
              min={2}
              max={26}
              disabled={busy}
              value={count}
              onChange={(ev) => {
                setCount(Number(ev.target.value))
                setPreview(null)
              }}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={copy}
              disabled={busy}
              onChange={(ev) => {
                setCopy(ev.target.checked)
                setPreview(null)
              }}
            />
            {e.canPastorSchedule
              ? "Repetir mensageiros escalados"
              : "Repetir atribuições do ministério responsável"}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={copyRepertoire} disabled={busy} onChange={ev => { setCopyRepertoire(ev.target.checked); setPreview(null) }} />
            Copiar repertório e roteiro para cada ocorrência
          </label>
          <p className="text-xs text-muted-foreground">Cada cópia poderá ser editada separadamente. Salve as alterações do repertório antes de conferir a série.</p>
          <p className="text-xs text-muted-foreground">
            Ministérios convidados organizam suas próprias escalas. Conflitos
            impedem a criação de toda a série. Fuso: {deviceTimezone()}.
          </p>
          <Button
            variant="outline"
            disabled={busy || count < 2 || count > 26}
            onClick={() => void getPreview()}
          >
            Conferir datas da série
          </Button>
          {preview && (
            <div className="space-y-2">
              <ol className="max-h-48 list-inside list-decimal overflow-y-auto text-sm">
                {preview.map((p, i) => (
                  <li key={i}>
                    {new Date(p.startsAt).toLocaleString()} —{" "}
                    {new Date(p.endsAt).toLocaleString()}
                  </li>
                ))}
              </ol>
              <Button
                disabled={busy}
                onClick={async () => {
                  if (
                    await action("repeat", {
                      ...repeatPayload,
                      confirmed: true,
                    })
                  )
                    setPreview(null)
                }}
              >
                Confirmar criação da série
              </Button>
            </div>
          )}
        </section>
      )}
      {e.canManage && e.series_id && (
        <section className="space-y-2">
          <p className="text-sm">
            Este evento faz parte de uma série. Editar ou excluir este evento
            afeta somente esta ocorrência.
          </p>
          <Button
            variant="outline"
            className="h-auto min-h-9 text-left whitespace-normal"
            disabled={busy}
            onClick={async () => {
              if (
                await showConfirm({
                  title: "Cancelar próximas ocorrências?",
                  description:
                    "Este evento e as ocorrências seguintes da mesma série serão cancelados, preservando o histórico.",
                  confirmLabel: "Cancelar ocorrências",
                })
              )
                await action("cancelSeries", { confirmed: true })
            }}
          >
            Cancelar esta e as próximas ocorrências
          </Button>
        </section>
      )}
    </div>
  )
}
