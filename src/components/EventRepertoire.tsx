import { useEffect, useState } from 'react'
import { repertoireApi, libraryApi, type Repertoire, type Song } from '@/lib/repertoire'
import { RepertoireLibrary } from '@/components/RepertoireLibrary'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

export function EventRepertoire({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Repertoire | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryRevision, setLibraryRevision] = useState(0)
  async function saveToLibrary(song: Song) {
    if (busy) return
    setBusy(true)
    try { await libraryApi('save', eventId, { song }); setLibraryRevision(r => r + 1); toast.success('Música salva na biblioteca do ministério') }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível salvar na biblioteca') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    let active = true
    void repertoireApi('read', eventId).then(value => { if (active) { setData(value); setError(''); setEditing(false) } }).catch(() => { if (active) { setData(null); setError('Não foi possível carregar o repertório.') } })
    return () => { active = false }
  }, [eventId, revision])
  async function save(op: string, payload: Record<string, unknown>) {
    if (busy) return
    setBusy(true)
    try { const value = await repertoireApi(op, eventId, payload); setData(value); setEditing(false); toast.success('Repertório atualizado') }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível salvar') }
    finally { setBusy(false) }
  }
  function change(index: number, field: keyof Song, value: string) { setData(d => d && ({ ...d, songs: d.songs.map((s, i) => i === index ? { ...s, [field]: value } : s) })) }
  function move(index: number, offset: number) { setData(d => { if (!d) return d; const songs = [...d.songs]; [songs[index], songs[index + offset]] = [songs[index + offset], songs[index]]; return { ...d, songs } }) }
  if (error) return <section role="alert"><p>{error}</p><Button onClick={() => setRevision(r => r + 1)}>Recarregar repertório</Button></section>
  if (!data) return <p role="status">Carregando repertório…</p>
  return <section className="space-y-4 border-t pt-4" aria-label="Repertório">
    <h3 className="font-semibold">Repertório e roteiro</h3>
    {data.canConfigure && <Button variant="outline" disabled={busy || editing} onClick={() => void save('configure', { enabled: !data.enabled })}>{data.enabled ? 'Desabilitar repertório neste ministério' : 'Habilitar repertório neste ministério'}</Button>}
    {!data.enabled ? <p className="text-sm text-muted-foreground">Repertório desabilitado para o ministério responsável.</p> : <>
      {data.canEdit && !editing && <Button onClick={() => setEditing(true)}>Editar repertório</Button>}
      {!data.songs.length && <p className="text-sm text-muted-foreground">Nenhuma música adicionada.</p>}
      {editing && <><Button variant="outline" disabled={busy} onClick={() => setLibraryOpen(o => !o)}>{libraryOpen ? 'Fechar biblioteca' : 'Abrir biblioteca'}</Button>{libraryOpen && <RepertoireLibrary key={libraryRevision} eventId={eventId} disabled={busy || data.songs.length >= 100} onAdd={song => setData(d => d && d.songs.length < 100 ? { ...d, songs: [...d.songs, song] } : d)} />}</>}
      <ol className="space-y-4">{data.songs.map((song, index) => <li key={index} className="space-y-2 rounded border p-3">
        {editing ? <fieldset disabled={busy} className="space-y-2"><legend>Música {index + 1}</legend>
          {(['title', 'key', 'version', 'url'] as const).map((field, i) => <label key={field} className="block text-sm">{['Título', 'Tom', 'Versão / intérprete', 'Link de áudio ou vídeo'][i]}<Input value={song[field]} maxLength={field === 'url' ? 2000 : 200} onChange={e => change(index, field, e.target.value)} /></label>)}
          <label className="block text-sm">Acordes / cifra<Textarea value={song.chords} maxLength={10000} onChange={e => change(index, 'chords', e.target.value)} /></label>
          <Button variant="outline" disabled={!song.title.trim() || (!!song.url && !/^https?:\/\//i.test(song.url))} onClick={() => void saveToLibrary(song)}>Salvar música na biblioteca</Button>
          <p className="text-xs text-muted-foreground">Salvar na biblioteca é independente de salvar ou cancelar este repertório.</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={index === 0} onClick={() => move(index, -1)}>Subir</Button><Button variant="outline" disabled={index === data.songs.length - 1} onClick={() => move(index, 1)}>Descer</Button><Button variant="outline" onClick={() => setData({ ...data, songs: data.songs.filter((_, i) => i !== index) })}>Retirar da lista</Button></div>
        </fieldset> : <><p className="font-medium">{index + 1}. {song.title}</p><p className="text-sm">{song.key && `Tom: ${song.key}`} {song.version}</p><pre className="whitespace-pre-wrap break-words text-sm">{song.chords}</pre>{/^https?:\/\//i.test(song.url) && <a className="underline" href={song.url} target="_blank" rel="noopener noreferrer">Abrir áudio / vídeo</a>}</>}
      </li>)}</ol>
      {editing && <Button variant="outline" disabled={busy || data.songs.length >= 100} onClick={() => setData({ ...data, songs: [...data.songs, { title: '', key: '', version: '', chords: '', url: '' }] })}>Adicionar música</Button>}
      <label className="block text-sm">Roteiro do culto{editing ? <Textarea disabled={busy} value={data.script} maxLength={20000} onChange={e => setData({ ...data, script: e.target.value })} /> : <p className="mt-2 whitespace-pre-wrap">{data.script || 'Roteiro ainda não definido.'}</p>}</label>
      {editing && <div className="flex gap-2"><Button disabled={busy || data.songs.some(s => !s.title.trim() || (s.url && !/^https?:\/\//i.test(s.url)))} onClick={() => void save('save', { version: data.version, songs: data.songs, script: data.script })}>Salvar repertório</Button><Button variant="outline" disabled={busy} onClick={() => setRevision(r => r + 1)}>Cancelar edição</Button></div>}
    </>}
  </section>
}
