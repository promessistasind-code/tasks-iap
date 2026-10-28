import { useEffect, useState } from "react"
import { useAuth } from "@/context/AuthContext"
import {
  announcementApi,
  prepareBanner,
  type Banner,
} from "@/lib/announcements"
import { supabase } from "@/lib/supabase"
import { BannerImage } from "@/components/BannerImage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

const localTime = (value: string) => {
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
const emptyForm = () => ({
  title: "",
  image_alt: "",
  button_text: "",
  button_url: "",
  image_path: "",
  enabled: true,
  starts_at: localTime(new Date().toISOString()),
  ends_at: localTime(new Date(Date.now() + 7 * 86400000).toISOString()),
})
type Editor = { id: string; name: string; enabled: boolean }
export function AnnouncementsPage({ onBack }: { onBack: () => void }) {
  const { session, access } = useAuth()
  const [items, setItems] = useState<Banner[]>([]),
    [editors, setEditors] = useState<Editor[]>([])
  const [form, setForm] = useState(emptyForm),
    [editingId, setEditingId] = useState<string | null>(null),
    [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [revision, setRevision] = useState(0),
    [fileKey, setFileKey] = useState(0)
  useEffect(() => {
    let active = true
    void Promise.all([
      announcementApi<Banner[]>("manage"),
      access?.isGeneralAdmin
        ? announcementApi<Editor[]>("editors")
        : Promise.resolve([]),
    ])
      .then(([rows, people]) => {
        if (active) {
          setItems(rows)
          setEditors(people)
          setLoaded(true)
          setError("")
        }
      })
      .catch(() => {
        if (active) {
          setLoaded(false)
          setError(
            "Não foi possível abrir a gestão de banners. Verifique sua permissão e tente novamente."
          )
        }
      })
    return () => {
      active = false
    }
  }, [revision, access?.isGeneralAdmin])
  function reset() {
    setEditingId(null)
    setForm(emptyForm())
    setFile(null)
    setFileKey((v) => v + 1)
  }
  function edit(b: Banner) {
    setEditingId(b.id)
    setForm({
      ...b,
      starts_at: localTime(b.starts_at),
      ends_at: localTime(b.ends_at),
    })
    setFile(null)
    setFileKey((v) => v + 1)
  }
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !session) return
    if (!form.image_alt.trim() || (!file && !form.image_path)) {
      toast.error("Escolha uma imagem e descreva seu conteúdo.")
      return
    }
    if (new Date(form.ends_at) <= new Date(form.starts_at)) {
      toast.error("O término deve ser posterior ao início.")
      return
    }
    if (
      !!form.button_text.trim() !== !!form.button_url.trim() ||
      (form.button_url && !/^https:\/\/[^\s]+$/.test(form.button_url))
    ) {
      toast.error(
        "Preencha o texto e um endereço HTTPS para o botão, ou deixe ambos vazios."
      )
      return
    }
    setBusy(true)
    try {
      let image_path = form.image_path
      if (file) {
        const image = await prepareBanner(file)
        image_path = `${session.user.id}/${crypto.randomUUID()}.webp`
        const { error } = await supabase.storage
          .from("announcement-images")
          .upload(image_path, image, {
            contentType: "image/webp",
            upsert: false,
          })
        if (error) throw error
        setForm((f) => ({ ...f, image_path }))
        setFile(null)
        setFileKey((v) => v + 1)
      }
      await announcementApi("save", {
        ...form,
        image_path,
        id: editingId ?? undefined,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
      })
      toast.success("Banner salvo")
      reset()
      setRevision((v) => v + 1)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível salvar o banner."
      )
    } finally {
      setBusy(false)
    }
  }
  async function grant(editor: Editor, enabled: boolean) {
    setBusy(true)
    try {
      await announcementApi("grant", { userId: editor.id, enabled })
      setEditors((rows) =>
        rows.map((e) => (e.id === editor.id ? { ...e, enabled } : e))
      )
      toast.success("Permissão atualizada")
    } catch {
      toast.error("Não foi possível alterar a permissão.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={onBack}>
        Voltar ao início
      </Button>
      <h1 className="text-2xl font-bold">Banners e comunicados</h1>
      {error && (
        <div role="alert">
          {error}{" "}
          <Button onClick={() => setRevision((v) => v + 1)}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!loaded && !error && <p role="status">Carregando…</p>}
      {loaded && (
        <>
          <form onSubmit={save} className="space-y-4 rounded-xl border p-5">
            <h2 className="text-lg font-semibold">
              {editingId ? "Editar banner" : "Novo banner"}
            </h2>
            <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                Título opcional
                <Input
                  maxLength={140}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm">
                Imagem (JPG, PNG ou WebP; até 10 MB)
                <Input
                  key={fileKey}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                Descrição acessível da imagem
                <Input
                  required
                  maxLength={300}
                  value={form.image_alt}
                  onChange={(e) =>
                    setForm({ ...form, image_alt: e.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                Início da publicação
                <Input
                  required
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) =>
                    setForm({ ...form, starts_at: e.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                Fim da publicação
                <Input
                  required
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) =>
                    setForm({ ...form, ends_at: e.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                Texto do botão (opcional)
                <Input
                  maxLength={60}
                  value={form.button_text}
                  onChange={(e) =>
                    setForm({ ...form, button_text: e.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                Endereço do botão (HTTPS)
                <Input
                  type="url"
                  maxLength={2000}
                  placeholder="https://"
                  value={form.button_url}
                  onChange={(e) =>
                    setForm({ ...form, button_url: e.target.value })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(enabled) => setForm({ ...form, enabled })}
                />
                Publicação habilitada
              </label>
            </fieldset>
            {form.image_path && (
              <BannerImage
                path={form.image_path}
                alt={form.image_alt}
                className="max-h-40 rounded-lg"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Horários no fuso deste dispositivo. A imagem será reduzida e
              otimizada antes do envio. Desabilitar um banner preserva sua
              imagem e seu histórico.
            </p>
            <div className="flex gap-2">
              <Button disabled={busy} type="submit">
                {busy ? "Salvando…" : "Salvar banner"}
              </Button>
              {editingId && (
                <Button
                  disabled={busy}
                  type="button"
                  variant="outline"
                  onClick={reset}
                >
                  Cancelar edição
                </Button>
              )}
            </div>
          </form>
          {access?.isGeneralAdmin && (
            <section className="space-y-3 rounded-xl border p-5">
              <h2 className="text-lg font-semibold">
                Permissão para publicar banners
              </h2>
              <p className="text-sm text-muted-foreground">
                Conceda acesso às pessoas vinculadas à Comunicação. A permissão
                deixa de valer se o vínculo for desativado.
              </p>
              {!editors.length && (
                <p className="text-sm">
                  Nenhuma conta vinculada à Comunicação.
                </p>
              )}
              {editors.map((e) => (
                <label key={e.id} className="flex items-center gap-3">
                  <Switch
                    aria-label={`Permitir banners para ${e.name}`}
                    checked={e.enabled}
                    disabled={busy}
                    onCheckedChange={(value) => void grant(e, value)}
                  />
                  {e.name}
                </label>
              ))}
            </section>
          )}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Banners cadastrados</h2>
            {!items.length && (
              <p className="text-sm text-muted-foreground">
                Nenhum banner cadastrado.
              </p>
            )}
            {items.map((b) => (
              <article
                key={b.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border p-4"
              >
                <BannerImage
                  path={b.image_path}
                  alt={b.image_alt}
                  className="h-24 w-40 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{b.title || b.image_alt}</h3>
                  <p className="text-sm text-muted-foreground">
                    {!b.enabled
                      ? "Desabilitado"
                      : new Date(b.ends_at) < new Date()
                        ? "Encerrado"
                        : new Date(b.starts_at) > new Date()
                          ? "Agendado"
                          : "Publicado"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(b.starts_at).toLocaleString()} —{" "}
                    {new Date(b.ends_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => edit(b)}
                >
                  Editar banner
                </Button>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
