import { useEffect, useState } from "react"
import {
  mediaApi,
  backupImages,
  downloadFile,
  type MediaObject,
} from "@/lib/media"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { showConfirm } from "@/components/ConfirmDialog"
import { toast } from "sonner"
type Manifest = { id: string; bucket: string; path: string; sha256: string }[]
export function MediaCleanup() {
  const [inventory, setInventory] = useState<{
      items: MediaObject[]
      count: number
      bytes: number
    }>({ items: [], count: 0, bytes: 0 }),
    [urls, setUrls] = useState<Record<string, string>>({})
  const [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string[]>([]),
    [before, setBefore] = useState(""),
    [manifest, setManifest] = useState<Manifest | null>(null),
    [saved, setSaved] = useState(false)
  useEffect(() => {
    let active = true
    void mediaApi<typeof inventory>("inventory", { offset })
      .then(async (data) => {
        const result: Record<string, string> = {}
        for (const bucket of ["identity-images", "announcement-images"]) {
          const objects = data.items.filter((i) => i.bucket === bucket)
          if (!objects.length) continue
          const signed = await supabase.storage.from(bucket).createSignedUrls(
            objects.map((i) => i.path),
            3600
          )
          if (signed.error) throw signed.error
          for (const row of signed.data ?? [])
            if (row.path && row.signedUrl)
              result[`${bucket}/${row.path}`] = row.signedUrl
        }
        if (active) {
          setInventory(data)
          setUrls(result)
          setError("")
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setError("Não foi possível carregar as imagens.")
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [offset, revision])
  const resetSelection = () => {
    setSelected([])
    setManifest(null)
    setSaved(false)
  }
  const rows = inventory.items.filter(
    (i) => !before || i.createdAt.slice(0, 10) < before
  )
  function select(id: string) {
    setSelected((ids) =>
      ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length < 20
          ? [...ids, id]
          : ids
    )
    setManifest(null)
    setSaved(false)
  }
  async function backup() {
    setBusy(true)
    try {
      const result = await backupImages(
        inventory.items.filter((i) => selected.includes(i.id))
      )
      downloadFile(
        result.archive,
        `backup-imagens-${new Date().toISOString().slice(0, 10)}.json`
      )
      setManifest(result.manifest)
      setSaved(false)
      toast.success("Backup verificado e preparado para download")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no backup")
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!manifest || !saved || busy) return
    if (
      !(await showConfirm({
        title: `Excluir definitivamente ${manifest.length} imagem(ns)?`,
        description:
          "Confirme que guardou o backup. Apenas as imagens selecionadas e sem uso serão removidas. Os textos e registros de banners serão preservados.",
        confirmLabel: "Excluir imagens selecionadas",
        variant: "destructive",
      }))
    )
      return
    setBusy(true)
    try {
      await mediaApi("reserveDeletion", { items: manifest, confirmed: true })
      for (const bucket of ["identity-images", "announcement-images"]) {
        const paths = manifest
          .filter((i) => i.bucket === bucket)
          .map((i) => i.path)
        if (!paths.length) continue
        const result = await supabase.storage.from(bucket).remove(paths)
        if (result.error) throw result.error
      }
      await mediaApi("finishDeletion", {items: manifest})
      toast.success("Imagens selecionadas excluídas")
      resetSelection()
      setRevision((r) => r + 1)
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Falha na exclusão. Atualize a lista e confira os arquivos restantes."
      )
      resetSelection()
      setRevision((r) => r + 1)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-lg font-semibold">Limpeza assistida de imagens</h2>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            resetSelection()
            setRevision((r) => r + 1)
          }}
        >
          Atualizar imagens
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {inventory.count} imagens · {(inventory.bytes / 1024 / 1024).toFixed(2)}{" "}
        MB nos arquivos de identidade e banners. Imagens vinculadas a perfis,
        identidade ou banners estão protegidas, inclusive em banners encerrados.
        Não há exclusão automática.
      </p>
      <label className="block space-y-1 text-sm">
        Mostrar imagens anteriores a
        <Input
          type="date"
          value={before}
          disabled={busy}
          onChange={(e) => {
            setBefore(e.target.value)
            resetSelection()
          }}
        />
      </label>
      {loading && <p role="status">Carregando imagens…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((i) => (
          <label key={i.id} className="space-y-2 rounded-lg border p-3">
            <img
              src={urls[`${i.bucket}/${i.path}`]}
              alt="Prévia do arquivo"
              loading="lazy"
              className="h-28 w-full rounded object-contain"
            />
            <span className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={`Selecionar imagem ${i.id}`}
                checked={selected.includes(i.id)}
                disabled={
                  busy ||
                  i.used ||
                  !!error ||
                  (!selected.includes(i.id) && selected.length >= 20)
                }
                onChange={() => select(i.id)}
              />
              {i.used
                ? "Em uso — protegida"
                : "Sem vínculo — pode ser selecionada"}
            </span>
            <p className="text-xs text-muted-foreground">
              {new Date(i.createdAt).toLocaleDateString()} ·{" "}
              {(i.size / 1024).toFixed(1)} KB
            </p>
          </label>
        ))}
      </div>
      {!loading && !error && !rows.length && (
        <p className="text-sm text-muted-foreground">
          Nenhuma imagem neste filtro.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={busy || offset === 0}
          onClick={() => {
            resetSelection()
            setOffset((n) => Math.max(0, n - 50))
          }}
        >
          Anterior
        </Button>
        <span className="text-xs">Página {offset / 50 + 1}</span>
        <Button
          variant="outline"
          disabled={busy || offset + 50 >= inventory.count}
          onClick={() => {
            resetSelection()
            setOffset((n) => n + 50)
          }}
        >
          Próxima
        </Button>
      </div>
      <Button
        disabled={busy || !selected.length || !!error}
        onClick={() => void backup()}
      >
        Baixar backup das selecionadas ({selected.length}/20)
      </Button>
      {manifest && (
        <div className="space-y-3">
          <p className="text-sm">
            Integridade verificada. Guarde o arquivo JSON: ele contém as imagens
            e as informações para recuperação.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saved}
              disabled={busy}
              onChange={(e) => setSaved(e.target.checked)}
            />
            Confirmo que guardei o backup
          </label>
          <Button
            variant="destructive"
            disabled={busy || !saved || !!error}
            onClick={() => void remove()}
          >
            Excluir imagens selecionadas
          </Button>
        </div>
      )}
    </section>
  )
}
