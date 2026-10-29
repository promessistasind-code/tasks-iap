import { useEffect, useState } from "react"
import { useEvents } from "@/store/useEvents"
import { eventFallsOn } from "@/lib/eventDates"
import { EventDialog } from "@/components/EventDialog"
import { peopleApi, type Person } from "@/lib/people"
import { birthdayFallsOn } from "@/lib/birthdays"
import { useApp } from "@/context/AppContext"
import type { Task } from "@/types/task"
import { STATUS_CONFIG } from "@/types/task"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ProjectFilesDialog } from "@/components/ProjectFilesDialog"
import { ChevronLeft, ChevronRight, StickyNote, Paperclip } from "lucide-react"
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  addDays,
  startOfDay,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  parseISO,
  isToday,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"

interface CalendarViewProps {
  onOpenTask: (task: Task) => void
}

export function CalendarView({ onOpenTask }: CalendarViewProps) {
  const { tasks, projects, notes, activeProjectId, ministries } = useApp()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [view, setView] = useState<"month" | "week" | "day">("month")
  const [showTasks, setShowTasks] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const [ministryFilter, setMinistryFilter] = useState("")
  const [selectedEvent, setSelectedEvent] = useState<string | null | undefined>(
    undefined
  )
  const [filesTask, setFilesTask] = useState<Task | null>(null)
  const [birthdays, setBirthdays] = useState<Person[]>([])
  const [birthdayError, setBirthdayError] = useState(false)
  useEffect(() => {
    let active = true
    const load = () => {
      void peopleApi<Person[]>("directory")
        .then((rows) => {
          if (active) {
            setBirthdays(rows)
            setBirthdayError(false)
          }
        })
        .catch(() => {
          if (active) {
            setBirthdays([])
            setBirthdayError(true)
          }
        })
    }
    load()
    window.addEventListener("focus", load)
    return () => {
      active = false
      window.removeEventListener("focus", load)
    }
  }, [])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart =
    view === "day"
      ? startOfDay(currentMonth)
      : startOfWeek(view === "month" ? monthStart : currentMonth, {
          weekStartsOn: 0,
        })
  const calEnd =
    view === "day"
      ? startOfDay(currentMonth)
      : endOfWeek(view === "month" ? monthEnd : currentMonth, {
          weekStartsOn: 0,
        })
  const eventFeed = useEvents(
    calStart.toISOString(),
    addDays(startOfDay(calEnd), 1).toISOString()
  )
  const visibleEvents = showEvents
    ? eventFeed.items.filter(
        (e) =>
          !ministryFilter ||
          e.ministry_id === ministryFilter ||
          e.shared_with.includes(ministryFilter)
      )
    : []
  function navigate(direction: number) {
    setCurrentMonth((d) =>
      view === "month"
        ? addMonths(d, direction)
        : addDays(d, direction * (view === "week" ? 7 : 1))
    )
  }
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const visibleTasks = (
    activeProjectId
      ? tasks.filter((t) => t.projectId === activeProjectId)
      : tasks
  ).filter(
    (t) =>
      showTasks &&
      t.dueDate &&
      (!ministryFilter ||
        projects.find((p) => p.id === t.projectId)?.ministryId ===
          ministryFilter)
  )

  function tasksForDay(day: Date) {
    return visibleTasks.filter(
      (t) => t.dueDate && isSameDay(parseISO(t.dueDate), day)
    )
  }

  const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

  return (
    <>
      <div className="flex h-full flex-col gap-4">
        {birthdayError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar os aniversários. Atualize a página para
            tentar novamente.
          </p>
        )}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize">
            {format(
              currentMonth,
              view === "day" ? "d MMMM yyyy" : "MMMM yyyy",
              { locale: ptBR }
            )}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Período anterior"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setCurrentMonth(new Date())}
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Próximo período"
              onClick={() => navigate(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label>
            Visualização{" "}
            <select
              aria-label="Visualização"
              className="rounded border bg-background p-2"
              value={view}
              onChange={(e) => setView(e.target.value as typeof view)}
            >
              <option value="month">Mês</option>
              <option value="week">Semana</option>
              <option value="day">Dia</option>
            </select>
          </label>
          <label>
            Ministério{" "}
            <select
              aria-label="Filtrar ministério"
              className="max-w-56 rounded border bg-background p-2"
              value={ministryFilter}
              onChange={(e) => setMinistryFilter(e.target.value)}
            >
              <option value="">Todos os meus ministérios</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={showTasks}
              onChange={(e) => setShowTasks(e.target.checked)}
            />
            Mostrar tarefas
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={showEvents}
              onChange={(e) => setShowEvents(e.target.checked)}
            />
            Mostrar eventos
          </label>
          {eventFeed.creatableMinistries.length > 0 && (
            <Button size="sm" onClick={() => setSelectedEvent(null)}>
              Novo evento
            </Button>
          )}
        </div>
        {eventFeed.error && (
          <p role="alert" className="text-sm">
            Não foi possível carregar os eventos.{" "}
            <Button variant="link" onClick={eventFeed.reload}>
              Tentar novamente
            </Button>
          </p>
        )}
        <div className="flex min-h-64 flex-1 flex-col overflow-auto rounded-lg border">
          {/* Day headers */}
          <div
            className={cn(
              "grid shrink-0 border-b bg-muted/40",
              view === "day" ? "grid-cols-1" : "min-w-[630px] grid-cols-7"
            )}
          >
            {(view === "day"
              ? [format(currentMonth, "EEEE", { locale: ptBR })]
              : WEEK_DAYS
            ).map((d) => (
              <div
                key={d}
                className="py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Days grid — each cell scrolls internally */}
          <div
            className={cn(
              "grid flex-1",
              view === "day" ? "grid-cols-1" : "min-w-[630px] grid-cols-7"
            )}
            style={{ gridAutoRows: "minmax(110px, 1fr)" }}
          >
            {days.map((day) => {
              const dayTasks = tasksForDay(day)
              const inMonth = isSameMonth(day, currentMonth)
              const today = isToday(day)
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "flex flex-col overflow-hidden border-r border-b",
                    view === "month" && !inMonth && "bg-muted/20 opacity-40",
                    today && "bg-primary/5"
                  )}
                >
                  <div className="shrink-0 px-1.5 pt-1.5">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs font-medium",
                        today && "bg-primary text-primary-foreground"
                      )}
                    >
                      {format(day, view === "week" ? "d/M" : "d")}
                    </span>
                  </div>

                  {/* Tasks — scrollable, all shown */}
                  <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-1">
                    {birthdays
                      .filter((p) =>
                        birthdayFallsOn(p.birthdayMonth, p.birthdayDay, day)
                      )
                      .map((p) => (
                        <div
                          key={`birthday-${p.id}`}
                          className="rounded bg-amber-100 px-1.5 py-1 text-xs text-amber-950"
                          title={`Aniversário de ${p.firstName} ${p.lastName}`}
                        >
                          🎂 {p.firstName} {p.lastName.split(" ")[0]}
                        </div>
                      ))}
                    {visibleEvents
                      .filter((e) => eventFallsOn(e, day))
                      .map((e) => (
                        <button
                          key={e.id}
                          title={e.title}
                          className={cn(
                            "block w-full rounded border border-indigo-300 bg-indigo-50 px-1.5 py-1 text-left text-xs text-indigo-950 hover:bg-indigo-100",
                            e.cancelled && "line-through opacity-60"
                          )}
                          onClick={() => setSelectedEvent(e.id)}
                        >
                          {format(new Date(e.starts_at), "HH:mm")} · {e.title}
                          {e.cancelled ? " · Cancelado" : ""}
                        </button>
                      ))}
                    {(view === "day" ? dayTasks : dayTasks.slice(0, 2)).map(
                      (task) => {
                        const status = STATUS_CONFIG[task.status]
                        const hasNote = notes.some((n) => n.taskId === task.id)
                        return (
                          <div key={task.id} className="group/task relative">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className={cn(
                                    "block w-full truncate rounded px-1.5 py-0.5 text-left text-xs leading-snug transition-opacity hover:opacity-80",
                                    status.bg,
                                    status.color
                                  )}
                                  onClick={() => onOpenTask(task)}
                                >
                                  {task.title}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">
                                <div className="font-medium">{task.title}</div>
                                <div className="text-muted-foreground">
                                  {status.label}
                                </div>
                              </TooltipContent>
                            </Tooltip>

                            {/* Ícones de nota/anexo — aparecem só ao passar o mouse na tarefa,
                              como overlay (não ocupam espaço extra na linha, então não somem
                              em dias com célula estreita) */}
                            <div
                              className={cn(
                                "absolute top-0 right-0 bottom-0 flex items-center gap-1 rounded-r pr-1 pl-2",
                                "pointer-events-none opacity-0 transition-opacity group-hover/task:pointer-events-auto group-hover/task:opacity-100",
                                status.bg
                              )}
                            >
                              {hasNote && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex shrink-0 items-center text-amber-600">
                                      <StickyNote className="size-3" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="right"
                                    className="text-xs"
                                  >
                                    Tem nota vinculada
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setFilesTask(task)
                                }}
                                className="shrink-0 transition-transform hover:scale-110"
                                title="Anexar arquivo"
                              >
                                <Paperclip className="size-3" />
                              </button>
                            </div>
                          </div>
                        )
                      }
                    )}
                    {view !== "day" && dayTasks.length > 2 && (
                      <button
                        className="px-1 py-0.5 text-left text-xs text-muted-foreground"
                        onClick={() => {
                          setCurrentMonth(day)
                          setView("day")
                        }}
                      >
                        +{dayTasks.length - 2} mais
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {selectedEvent !== undefined && (
        <EventDialog
          key={selectedEvent ?? "new"}
          eventId={selectedEvent}
          createMinistryId={
            eventFeed.creatableMinistries.find((m) => m.id === ministryFilter)
              ?.id
          }
          creatableMinistries={eventFeed.creatableMinistries}
          onClose={() => setSelectedEvent(undefined)}
        />
      )}
      <ProjectFilesDialog
        project={projects.find((p) => p.id === filesTask?.projectId) ?? null}
        taskId={filesTask?.id}
        taskTitle={filesTask?.title}
        onClose={() => setFilesTask(null)}
      />
    </>
  )
}
