import { useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { useMedia } from "@/context/MediaContext"
import { mediaApi } from "@/lib/media"
import { prepareBanner } from "@/lib/announcements"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { MediaCleanup } from "@/components/MediaCleanup"
export function ProfileMediaPage() {
  const { session, access, profile } = useAuth()
  const { brand, avatars, urls, reload, error } = useMedia()
  const [busy, setBusy] = useState(false),
    [name, setName] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<File | null>(null),
    [logo, setLogo] = useState<File | null>(null),
    [favicon, setFavicon] = useState<File | null>(null),
    [inputKey, setInputKey] = useState(0)
  async function upload(file: File, size: number) {
    const blob = await prepareBanner(file, size, size)
    const path = `${session!.user.id}/${crypto.randomUUID()}.webp`
    const { error } = await supabase.storage
      .from("identity-images")
      .upload(path, blob, { contentType: "image/webp", upsert: false })
    if (error) throw error
    return path
  }
  async function saveAvatar() {
    if (!avatar || busy) return
    setBusy(true)
    try {
      const path = await upload(avatar, 512)
      await mediaApi("avatar", { path })
      setAvatar(null)
      setInputKey((k) => k + 1)
      reload()
      toast.success("Foto de perfil atualizada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar foto")
    } finally {
      setBusy(false)
    }
  }
  async function saveBrand() {
    if (busy) return
    setBusy(true)
    try {
      const logo_path = logo ? await upload(logo, 512) : brand.logo_path
      const favicon_path = favicon
        ? await upload(favicon, 64)
        : brand.favicon_path
      await mediaApi("brand", {
        name: (name ?? brand.name).trim(),
        logo_path,
        favicon_path,
      })
      setLogo(null)
      setFavicon(null)
      setName(null)
      setInputKey((k) => k + 1)
      reload()
      toast.success("Identidade visual atualizada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar identidade")
    } finally {
      setBusy(false)
    }
  }
  const avatarPath = session ? avatars[session.user.id] : null
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Perfil e imagens</h1>
      {error && (
        <p role="alert">
          Não foi possível carregar as imagens.{" "}
          <Button onClick={reload}>Tentar novamente</Button>
        </p>
      )}
      <section className="space-y-4 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Minha foto de perfil</h2>
        <p className="text-sm text-muted-foreground">
          Sua foto aparece junto ao seu nome. Ela não altera a identidade da
          igreja.
        </p>
        {avatarPath && urls[avatarPath] && (
          <img
            src={urls[avatarPath]}
            alt={`Foto de ${profile?.name ?? "perfil"}`}
            className="size-24 rounded-full object-cover"
          />
        )}
        <label className="block space-y-1 text-sm">
          Nova foto
          <Input
            key={`avatar-${inputKey}`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button
          disabled={busy || !avatar || error}
          onClick={() => void saveAvatar()}
        >
          Salvar minha foto
        </Button>
      </section>
      {access?.isGeneralAdmin && (
        <>
          <section className="space-y-4 rounded-xl border p-5">
            <h2 className="text-lg font-semibold">Identidade da igreja</h2>
            <label className="block space-y-1 text-sm">
              Nome no sistema
              <Input
                value={name ?? brand.name}
                maxLength={80}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2 text-sm">
                Logotipo global
                {brand.logo_path && urls[brand.logo_path] && (
                  <img
                    src={urls[brand.logo_path]}
                    alt="Logotipo atual"
                    className="size-20 object-contain"
                  />
                )}
                <Input
                  key={`logo-${inputKey}`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="block space-y-2 text-sm">
                Ícone da aba (favicon)
                {brand.favicon_path && urls[brand.favicon_path] && (
                  <img
                    src={urls[brand.favicon_path]}
                    alt="Ícone atual"
                    className="size-10 object-contain"
                  />
                )}
                <Input
                  key={`favicon-${inputKey}`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => setFavicon(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              JPG, PNG ou WebP de até 10 MB. As imagens são otimizadas; o
              favicon deve ser preferencialmente quadrado. A identidade
              personalizada aparece após o acesso ao sistema.
            </p>
            <Button
              disabled={busy || error || !(name ?? brand.name).trim()}
              onClick={() => void saveBrand()}
            >
              Salvar identidade visual
            </Button>
          </section>
          <MediaCleanup />
        </>
      )}
    </div>
  )
}
