import { supabase } from "./supabase"
export interface Brand {
  name: string
  logo_path: string | null
  favicon_path: string | null
}
export interface MediaState {
  brand: Brand
  avatars: Record<string, string>
}
export interface MediaObject {
  id: string
  bucket: string
  path: string
  createdAt: string
  size: number
  used: boolean
}
export async function mediaApi<T>(
  op: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.rpc("media_portal", { op, payload })
  if (error) throw new Error(error.message)
  return data as T
}
export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
const hash = async (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
export async function backupImages(items: MediaObject[]) {
  const files = []
  for (const item of items) {
    const { data, error } = await supabase.storage
      .from(item.bucket)
      .download(item.path)
    if (error || !data)
      throw new Error(
        "Falha ao obter uma imagem para o backup. Nenhuma exclusão foi autorizada."
      )
    const bytes = await data.arrayBuffer()
    const sha256 = await hash(bytes)
    let binary = ""
    for (const byte of new Uint8Array(bytes))
      binary += String.fromCharCode(byte)
    files.push({ ...item, sha256, mime: data.type, base64: btoa(binary) })
  }
  const archive = new Blob(
    [
      JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        files,
      }),
    ],
    { type: "application/json" }
  )
  const verified = JSON.parse(await archive.text()) as { files: typeof files }
  for (const file of verified.files) {
    const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
    if ((await hash(bytes.buffer)) !== file.sha256)
      throw new Error("A verificação do backup falhou.")
  }
  return {
    archive,
    manifest: files.map(({ id, bucket, path, sha256 }) => ({
      id,
      bucket,
      path,
      sha256,
    })),
  }
}
