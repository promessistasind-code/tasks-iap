import { useEffect, useState } from "react"
import { eventApi } from "@/lib/events"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
export function PastorSchedule({
  eventId,
  onChanged,
}: {
  eventId: string
  onChanged: () => void
}) {
  const [people, setPeople] = useState<
      { id: string; name: string; available: boolean }[]
    >([]),
    [personId, setPersonId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    void eventApi<typeof people>("pastorCandidates", { eventId })
      .then((rows) => {
        if (active) {
          setPeople(rows)
          setError("")
        }
      })
      .catch(() => {
        if (active) {
          setPeople([])
          setError("Não foi possível consultar os mensageiros.")
        }
      })
    return () => {
      active = false
    }
  }, [eventId, revision])
  async function add() {
    if (!personId || busy) return
    setBusy(true)
    try {
      await eventApi("pastorAssign", { eventId, personId })
      setPersonId("")
      setRevision((r) => r + 1)
      onChanged()
      window.dispatchEvent(new Event("events-changed"))
      toast.success("Mensageiro adicionado à escala")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível escalar")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-3 rounded border p-3">
      <h3 className="font-semibold">Escalar mensageiro</h3>
      <p className="text-sm text-muted-foreground">
        Somente integrantes ativos com a função Mensageiro no Ministério de
        Ensino.
      </p>
      {error ? (
        <p role="alert">
          {error}{" "}
          <Button variant="link" onClick={() => setRevision((r) => r + 1)}>
            Tentar novamente
          </Button>
        </p>
      ) : (
        <>
          <label className="block text-sm">
            Mensageiro
            <select
              aria-label="Mensageiro"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="mt-1 w-full rounded border bg-background p-2"
            >
              <option value="">Selecione</option>
              {people.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>
                  {p.name}
                  {!p.available ? " — indisponível" : ""}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy || !personId} onClick={() => void add()}>
            Adicionar mensageiro
          </Button>
        </>
      )}
    </section>
  )
}
