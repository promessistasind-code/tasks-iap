import { useState } from "react"
import { startOfMonth, addMonths, format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useEvents } from "@/store/useEvents"
import { EventDialog } from "@/components/EventDialog"
import { Button } from "@/components/ui/button"
export function MinistryEvents({ ministryId }: { ministryId: string }) {
  const [month, setMonth] = useState(() => new Date()),
    [selected, setSelected] = useState<string | null | undefined>(undefined)
  const { items, creatableMinistries, error, reload, loading } = useEvents(
    startOfMonth(month).toISOString(),
    startOfMonth(addMonths(month, 1)).toISOString(),
    ministryId
  )
  const events = items
  const canCreate = creatableMinistries.some((m) => m.id === ministryId)
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Eventos e escalas</h2>
        {canCreate && (
          <Button onClick={() => setSelected(null)}>Novo evento</Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        A liderança vê os eventos e escalas do ministério. A administração geral vê todos os ministérios. Os demais membros veem suas próprias escalas.
      </p>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          aria-label="Mês anterior de eventos"
          onClick={() => setMonth((d) => addMonths(d, -1))}
        >
          Anterior
        </Button>
        <span className="text-sm capitalize">
          {format(month, "MMMM yyyy", { locale: ptBR })}
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-label="Próximo mês de eventos"
          onClick={() => setMonth((d) => addMonths(d, 1))}
        >
          Próximo
        </Button>
      </div>
      {loading ? (
        <p role="status">Carregando eventos…</p>
      ) : error ? (
        <p role="alert">
          Não foi possível carregar eventos.{" "}
          <Button onClick={reload}>Tentar novamente</Button>
        </p>
      ) : !events.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhum evento ou escala para mostrar neste mês.
        </p>
      ) : (
        events.map((e) => (
          <button
            key={e.id}
            className="block w-full rounded border p-3 text-left hover:bg-muted"
            onClick={() => setSelected(e.id)}
          >
            <span className="font-medium">
              {e.title}
              {e.cancelled ? " · Cancelado" : ""}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {new Date(e.starts_at).toLocaleString()}
              {e.ministryName && ` · ${e.ministryName}`}
            </span>
          </button>
        ))
      )}
      {selected !== undefined && (
        <EventDialog
          key={selected ?? "new"}
          eventId={selected}
          createMinistryId={ministryId}
          creatableMinistries={creatableMinistries}
          onClose={() => setSelected(undefined)}
        />
      )}
    </section>
  )
}
