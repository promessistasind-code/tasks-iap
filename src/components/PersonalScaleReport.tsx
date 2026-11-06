import {useEffect, useState} from "react"
import {supabase} from "@/lib/supabase"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Button} from "@/components/ui/button"

interface Row { ministry_id: string; ministry_name: string; events_count: number }
export function PersonalScaleReport({start,end}: {start:string;end:string}) {
  const [rows,setRows]=useState<Row[] | null>(null)
  const [failed,setFailed]=useState(false)
  const [attempt,setAttempt]=useState(0)
  useEffect(()=>{
    const abort=new AbortController()
    async function load() {
      try {
        const {data,error}=await supabase.rpc("my_ministry_scale_counts",{period_start:start,period_end:end}).abortSignal(abort.signal)
        if(error) throw error
        if(!abort.signal.aborted){setRows(data ?? []);setFailed(false)}
      } catch {if(!abort.signal.aborted)setFailed(true)}
    }
    void load()
    return ()=>abort.abort()
  },[start,end,attempt])
  if(failed)return <p role="alert">Não foi possível carregar suas escalas. <Button variant="link" onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</Button></p>
  if(!rows)return <p role="status">Carregando suas escalas…</p>
  if(!rows.length)return null
  return <Card><CardHeader><CardTitle>Minhas escalas por ministério</CardTitle></CardHeader>
    <CardContent><p className="mb-3 text-sm text-muted-foreground">Cada evento conta uma vez por ministério, mesmo com duas funções. Eventos cancelados ficam fora.</p>
      <dl className="space-y-2">{rows.map(row=><div key={row.ministry_id} className="flex justify-between gap-3"><dt>{row.ministry_name}</dt><dd>{row.events_count} {row.events_count===1?"evento":"eventos"}</dd></div>)}</dl>
    </CardContent></Card>
}
