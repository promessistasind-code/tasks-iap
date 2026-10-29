import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import { mediaApi, type MediaState } from "@/lib/media"
import { supabase } from "@/lib/supabase"
const defaults: MediaState = {
  brand: { name: "Promessa Industrial", logo_path: null, favicon_path: null },
  avatars: {},
}
interface Value extends MediaState {
  urls: Record<string, string>
  reload: () => void
  error: boolean
}
const Context = createContext<Value>({
  ...defaults,
  urls: {},
  reload: () => {},
  error: false,
})
export function MediaProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MediaState>(defaults),
    [urls, setUrls] = useState<Record<string, string>>({}),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((r) => r + 1), [])
  useEffect(() => {
    let active = true,
      running = false,
      dirty = false
    async function load() {
      if (!active) return
      if (running) {
        dirty = true
        return
      }
      running = true
      try {
        const data = await mediaApi<MediaState>("read")
        if (!data?.brand) return
        const paths = [
          ...new Set(
            [
              data.brand.logo_path,
              data.brand.favicon_path,
              ...Object.values(data.avatars ?? {}),
            ].filter((p): p is string => !!p)
          ),
        ]
        const signed = paths.length
          ? await supabase.storage
              .from("identity-images")
              .createSignedUrls(paths, 3600)
          : { data: [], error: null }
        if (signed.error) throw signed.error
        if (active) {
          setState(data)
          setUrls(
            Object.fromEntries(
              (signed.data ?? [])
                .filter((x) => x.path && x.signedUrl)
                .map((x) => [x.path!, x.signedUrl!])
            )
          )
          setError(false)
        }
      } catch {
        if (active) {
          setError(true)
          setState(defaults)
          setUrls({})
        }
      } finally {
        running = false
        if (active && dirty) {
          dirty = false
          void load()
        }
      }
    }
    const refresh = () => void load()
    void load()
    window.addEventListener("focus", refresh)
    const timer = setInterval(refresh, 55 * 60 * 1000)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [revision])
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const previousHref = icon?.href
    const previousType = icon?.type
    document.title = `${state.brand.name} — Gestão de Projetos`
    if (icon) {
      icon.href = state.brand.favicon_path
        ? (urls[state.brand.favicon_path] ?? "/logo.jpg")
        : "/logo.jpg"
      icon.type = state.brand.favicon_path ? "image/webp" : "image/jpeg"
    }
    return () => {
      document.title = "Promessa Industrial — Gestão de Projetos"
      if (icon) {
        icon.href = previousHref ?? "/logo.jpg"
        icon.type = previousType ?? "image/jpeg"
      }
    }
  }, [state.brand, urls])
  return (
    <Context.Provider value={{ ...state, urls, reload, error }}>
      {children}
    </Context.Provider>
  )
}
// eslint-disable-next-line react-refresh/only-export-components -- shared context hook; provider owns all state
export const useMedia = () => useContext(Context)
