import { supabase } from "./supabase"
export interface Banner {
  id: string
  title: string
  image_path: string
  image_alt: string
  button_text: string
  button_url: string
  starts_at: string
  ends_at: string
  enabled: boolean
}
export interface BannerFeed {
  canManage: boolean
  items: Banner[]
  nextChangeAt?: string | null
}
export async function announcementApi<T>(
  op: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.rpc("announcement_portal", {
    op,
    payload,
  })
  if (error) throw new Error(error.message)
  return data as T
}
export async function prepareBanner(file: File, maxWidth = 1920, maxHeight = 1080): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Use uma imagem JPG, PNG ou WebP.")
  if (file.size > 10 * 1024 * 1024)
    throw new Error("A imagem original deve ter até 10 MB.")
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error("Use uma imagem com até 40 megapixels.")
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Não foi possível preparar a imagem.")
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Falha ao comprimir imagem.")),
        "image/webp",
        0.85
      )
    )
    if (blob.size > 2 * 1024 * 1024)
      throw new Error(
        "A imagem otimizada ainda ultrapassa 2 MB. Escolha uma imagem menor."
      )
    return blob
  } finally {
    bitmap.close()
  }
}
