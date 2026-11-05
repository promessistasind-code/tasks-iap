import { useEffect, useState } from 'react'
import { libraryApi, type LibrarySong, type Song } from '@/lib/repertoire'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { showConfirm } from '@/components/ConfirmDialog'
import { toast } from 'sonner'

export function RepertoireLibrary({ eventId, onAdd, disabled }: { eventId: string; onAdd: (song: Song) => void; disabled: boolean }) {
  const [search, setSearch] = useState(''), [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0), [revision, setRevision] = useState(0)
  const [items, setItems] = useState<LibrarySong[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void libraryApi<LibrarySong[]>('list', eventId, { search: query, offset }).then(rows => { if (active) { setItems(rows); setError(''); setLoading(false) } }).catch(() => { if (active) { setError('Não foi possível carregar a biblioteca.'); setLoading(false) } })
    return () => { active = false }
  }, [eventId, query, offset, revision])
  function refresh() { setLoading(true); setRevision(r => r + 1) }
  async function archive(item: LibrarySong) {
    if (!await showConfirm({ title: 'Arquivar música?', description: `“${item.song.title}” sairá da biblioteca. Os repertórios dos eventos serão preservados.` })) return
    setBusy(true)
    try { await libraryApi('archive', eventId, { id: item.id }); refresh() } catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível arquivar') } finally { setBusy(false) }
  }
  return <section aria-label="Biblioteca de músicas" className="space-y-3 rounded border p-3">
    <h4 className="font-medium">Biblioteca do ministério</h4>
    <p className="text-xs text-muted-foreground">Adicionar cria uma cópia no repertório em edição. Ajustes no evento não alteram a biblioteca.</p>
    <div className="flex gap-2"><Input aria-label="Buscar música" maxLength={200} value={search} onChange={e => setSearch(e.target.value)} /><Button disabled={loading || busy || disabled} onClick={() => { setLoading(true); setQuery(search); setOffset(0); setRevision(r => r + 1) }}>Buscar</Button></div>
    {loading ? <p role="status">Carregando músicas…</p> : error ? <div role="alert">{error}<Button onClick={refresh}>Tentar novamente</Button></div> : <>
      {!items.length && <p>Nenhuma música encontrada.</p>}
      {items.slice(0, 50).map(item => <div key={item.id} className="flex flex-wrap items-center gap-2 border-t py-2"><span className="min-w-0 flex-1 break-words">{item.song.title} — {item.song.key} {item.song.version}</span><Button disabled={disabled || busy} onClick={() => onAdd({ ...item.song })}>Adicionar ao repertório</Button><Button variant="outline" disabled={disabled || busy} onClick={() => void archive(item)}>Arquivar</Button></div>)}
      <div className="flex gap-2"><Button variant="outline" disabled={!offset || busy || disabled} onClick={() => { setLoading(true); setOffset(o => o - 50) }}>Anterior</Button><Button variant="outline" disabled={items.length <= 50 || busy || disabled} onClick={() => { setLoading(true); setOffset(o => o + 50) }}>Próxima</Button></div>
    </>}
  </section>
}
