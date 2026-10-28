import { useEffect, useState } from "react"
import { useApp } from "@/context/AppContext"
import { Button } from "@/components/ui/button"
import { BannerImage } from "@/components/BannerImage"
import { announcementApi, type BannerFeed } from "@/lib/announcements"
import { homeStats } from "@/lib/homeStats"
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react"

export function HomePage({ onManage }: { onManage: () => void }) {
  const { tasks } = useApp()
  const [feed, setFeed] = useState<BannerFeed>({ canManage: false, items: [] })
  const [error, setError] = useState(false),
    [revision, setRevision] = useState(0),
    [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [hovered, setHovered] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    let active = true,
      running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      if (running || !active) return
      running = true
      try {
        const data = await announcementApi<BannerFeed>("list")
        if (active) {
          setFeed({ canManage: !!data.canManage, items: data.items ?? [] })
          setError(false)
          setClock(Date.now())
          clearTimeout(timer)
          const change = data.nextChangeAt
            ? new Date(data.nextChangeAt).getTime()
            : Infinity
          timer = setTimeout(
            () => void load(),
            Math.min(2_147_000_000, Math.max(1000, change - Date.now() + 100))
          )
        }
      } catch {
        if (active) {
          setError(true)
          setFeed({ canManage: false, items: [] })
        }
      } finally {
        running = false
      }
    }
    const focus = () => void load()
    window.addEventListener("focus", focus)
    void load()
    return () => {
      active = false
      clearTimeout(timer)
      window.removeEventListener("focus", focus)
    }
  }, [revision])
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const banners = feed.items.filter(
    (b) =>
      b.enabled &&
      new Date(b.starts_at).getTime() <= clock &&
      new Date(b.ends_at).getTime() > clock
  )
  useEffect(() => {
    if (
      paused ||
      hovered ||
      banners.length < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return
    const timer = setInterval(() => setIndex((i) => i + 1), 7000)
    return () => clearInterval(timer)
  }, [paused, hovered, banners.length])
  const current = banners[index % banners.length]
  const stats = homeStats(tasks, new Date(clock))
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Início</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe suas atividades e os comunicados da igreja.
          </p>
        </div>
        {feed.canManage && (
          <Button variant="outline" onClick={onManage}>
            Gerenciar banners
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Total de tarefas", stats.total],
          ["Concluídas", stats.done],
          ["Em andamento", stats.inProgress],
          ["Atrasadas", stats.overdue],
          ["Concluídas hoje", stats.doneToday],
        ].map(([label, count]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{count}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Indicadores das tarefas às quais você tem acesso. Conclusões antigas sem
        data registrada não entram em “Concluídas hoje”.
      </p>
      <section aria-label="Comunicados" className="space-y-3">
        <h2 className="text-lg font-semibold">Eventos e comunicados</h2>
        {error ? (
          <div role="alert" className="rounded-xl border p-5">
            Não foi possível carregar os comunicados.{" "}
            <Button variant="outline" onClick={() => setRevision((r) => r + 1)}>
              Tentar novamente
            </Button>
          </div>
        ) : current ? (
          <>
            <div
              aria-roledescription="carrossel"
              className="relative overflow-hidden rounded-xl bg-slate-800 text-white"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onFocusCapture={() => setHovered(true)}
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget))
                  setHovered(false)
              }}
            >
              <BannerImage
                key={current.id + current.image_path}
                path={current.image_path}
                alt={current.image_alt}
                className="h-64 w-full object-cover motion-safe:animate-in motion-safe:duration-500 motion-safe:fade-in md:h-96"
              />
              {(current.title || current.button_text) && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-5 pt-16 pb-5">
                  <h3 className="max-w-3xl text-xl font-semibold break-words md:text-3xl">
                    {current.title}
                  </h3>
                  {current.button_text &&
                    /^https:\/\//.test(current.button_url) && (
                      <a
                        className="mt-3 inline-block rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                        href={current.button_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {current.button_text}
                      </a>
                    )}
                </div>
              )}
            </div>
            {banners.length > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Banner anterior"
                  onClick={() =>
                    setIndex(
                      (i) =>
                        ((i % banners.length) + banners.length - 1) %
                        banners.length
                    )
                  }
                >
                  <ChevronLeft />
                </Button>
                <span className="text-sm">
                  {(index % banners.length) + 1} de {banners.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={paused ? "Reproduzir banners" : "Pausar banners"}
                  onClick={() => setPaused((v) => !v)}
                >
                  {paused ? <Play /> : <Pause />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Próximo banner"
                  onClick={() => setIndex((i) => i + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="rounded-xl border p-8 text-center text-muted-foreground">
            Nenhum comunicado publicado neste momento.
          </p>
        )}
      </section>
    </div>
  )
}
