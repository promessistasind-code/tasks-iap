import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { schedulingApi, deviceTimezone } from "@/lib/scheduling"
import { toast } from "sonner"
type Period = { id: string; starts_at: string; ends_at: string }
export function AvailabilityDialog({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Period[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0)
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [frequency, setFrequency] = useState("none"),
    [count, setCount] = useState(2)
  useEffect(() => {
    let active = true
    void schedulingApi<Period[]>("availabilityList")
      .then((r) => {
        if (active) {
          setItems(r)
          setError("")
        }
      })
      .catch(() => {
        if (active) {
          setItems([])
          setError("Não foi possível carregar seus períodos.")
        }
      })
    return () => {
      active = false
    }
  }, [revision])
  async function action(op: string, payload: Record<string, unknown>) {
    if (busy) return
    setBusy(true)
    try {
      await schedulingApi(op, payload)
      setRevision((r) => r + 1)
      window.dispatchEvent(new Event("events-changed"))
      toast.success("Disponibilidade atualizada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Minhas indisponibilidades</DialogTitle>
          <DialogDescription>
            Informe períodos em que não poderá participar. Líderes verão o
            conflito ao organizar escalas, sem acesso a motivos pessoais.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (new Date(end) <= new Date(start)) {
              toast.error("O término deve ser posterior ao início.")
              return
            }
            void action("availabilityAdd", {
              startsAt: new Date(start).toISOString(),
              endsAt: new Date(end).toISOString(),
              frequency,
              count: frequency === "none" ? 1 : count,
              timezone: deviceTimezone(),
            })
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <label className="block text-sm">
              Início da indisponibilidade
              <Input
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Término da indisponibilidade
              <Input
                type="datetime-local"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Repetir indisponibilidade
              <select
                aria-label="Repetir indisponibilidade"
                className="ml-2 rounded border bg-background p-2"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                <option value="none">Não repetir</option>
                <option value="weekly">Semanal</option>
                <option value="fortnightly">Quinzenal</option>
                <option value="monthly">Mensal</option>
              </select>
            </label>
            {frequency !== "none" && (
              <label className="block text-sm">
                Quantidade de períodos
                <Input
                  type="number"
                  min={2}
                  max={26}
                  required
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              Fuso: {deviceTimezone()}. Até 26 períodos, cada um com no máximo
              31 dias. Confirmações em conflito voltam a pendente; a escala
              permanece para revisão com a liderança.
            </p>
            <Button type="submit">Salvar indisponibilidade</Button>
          </fieldset>
        </form>
        {error ? (
          <p role="alert">
            {error}{" "}
            <Button variant="link" onClick={() => setRevision((r) => r + 1)}>
              Tentar novamente
            </Button>
          </p>
        ) : (
          <section className="space-y-2">
            <h3 className="font-medium">Períodos registrados</h3>
            {!items.length && (
              <p className="text-sm">Nenhum período registrado.</p>
            )}
            {items.map((p) => (
              <div key={p.id} className="rounded border p-3">
                <p className="text-sm">
                  {new Date(p.starts_at).toLocaleString()} —{" "}
                  {new Date(p.ends_at).toLocaleString()}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void action("availabilityCancel", { id: p.id })
                  }
                >
                  Retirar indisponibilidade
                </Button>
              </div>
            ))}
          </section>
        )}
      </DialogContent>
    </Dialog>
  )
}
