import type { EventDetail } from "@/lib/events"
import { scaleSummary } from "@/lib/scaleSummary"

export function ScaleSummary({detail}: {detail: EventDetail}) {
  const counts = scaleSummary(detail)
  if (!counts) return null
  return <section aria-label="Resumo da escala" className="space-y-2">
    <h4 className="text-sm font-semibold">{detail.event.canManage ? "Resumo da escala" : "Resumo das escalas que você administra"}</h4>
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {([["Confirmaram", counts.confirmed], ["Sem resposta", counts.pending], ["Recusaram", counts.declined], ["Solicitaram troca", counts.swaps]] as const).map(([label,value]) =>
        <div key={label} className="rounded border p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-lg font-semibold">{value}</dd></div>)}
    </dl>
    <p className="text-xs text-muted-foreground">Cada pessoa conta uma vez por indicador. Um pedido de troca mantém a resposta de presença até a decisão.</p>
  </section>
}
