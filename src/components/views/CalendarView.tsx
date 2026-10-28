import { useEffect, useState } from "react"
import { peopleApi, type Person } from "@/lib/people"
import { birthdayFallsOn } from "@/lib/birthdays"
import { useApp } from "@/context/AppContext"
import type { Task } from "@/types/task"
import { STATUS_CONFIG } from "@/types/task"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ProjectFilesDialog } from "@/components/ProjectFilesDialog"
import { ChevronLeft, ChevronRight, StickyNote, Paperclip } from "lucide-react"
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, eachDayOfInterval, isSameMonth,
  isSameDay, parseISO, isToday,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"

interface CalendarViewProps {
  onOpenTask: (task: Task) => void
}

export function CalendarView({ onOpenTask }: CalendarViewProps) {
  const { tasks, projects, notes, activeProjectId } = useApp()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [filesTask, setFilesTask] = useState<Task | null>(null)
  const [birthdays, setBirthdays] = useState<Person[]>([])
  const [birthdayError, setBirthdayError] = useState(false)
  useEffect(() => {
    let active = true
    const load = () => { void peopleApi<Person[]>("directory").then(rows => { if (active) { setBirthdays(rows); setBirthdayError(false) } }).catch(() => { if (active) { setBirthdays([]); setBirthdayError(true) } }) }
    load(); window.addEventListener('focus', load)
    return () => { active = false; window.removeEventListener('focus', load) }
  }, [])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const visibleTasks = (activeProjectId
    ? tasks.filter(t => t.projectId === activeProjectId)
    : tasks
  ).filter(t => t.dueDate)

  function tasksForDay(day: Date) {
    return visibleTasks.filter(t => t.dueDate && isSameDay(parseISO(t.dueDate), day))
  }

  const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

  return (
    <>
      <div className="flex flex-col gap-4 h-full">
        {birthdayError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os aniversários. Atualize a página para tentar novamente.</p>}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-8" onClick={() => setCurrentMonth(d => subMonths(d, 1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentMonth(new Date())}>
              Hoje
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => setCurrentMonth(d => addMonths(d, 1))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 rounded-lg border overflow-hidden flex flex-col">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b bg-muted/40 shrink-0">
            {WEEK_DAYS.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
          </div>

          {/* Days grid — each cell scrolls internally */}
          <div className="grid grid-cols-7 flex-1 overflow-auto" style={{ gridAutoRows: "minmax(110px, 1fr)" }}>
            {days.map(day => {
              const dayTasks = tasksForDay(day)
              const inMonth = isSameMonth(day, currentMonth)
              const today = isToday(day)
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "border-r border-b flex flex-col overflow-hidden",
                    !inMonth && "opacity-40 bg-muted/20",
                    today && "bg-primary/5"
                  )}
                >
                  <div className="px-1.5 pt-1.5 shrink-0">
                    <span className={cn(
                      "text-xs font-medium size-6 flex items-center justify-center rounded-full",
                      today && "bg-primary text-primary-foreground"
                    )}>
                      {format(day, "d")}
                    </span>
                  </div>

                  {/* Tasks — scrollable, all shown */}
                  <div className="flex-1 overflow-y-auto px-1 pb-1 flex flex-col gap-0.5">
                    {birthdays.filter(p => birthdayFallsOn(p.birthdayMonth,p.birthdayDay,day)).map(p => <div key={`birthday-${p.id}`} className="rounded bg-amber-100 text-amber-950 px-1.5 py-1 text-xs" title={`Aniversário de ${p.firstName} ${p.lastName}`}>🎂 {p.firstName} {p.lastName.split(' ')[0]}</div>)}
                    {dayTasks.slice(0, 2).map(task => {
                      const status = STATUS_CONFIG[task.status]
                      const hasNote = notes.some(n => n.taskId === task.id)
                      return (
                        <div key={task.id} className="relative group/task">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className={cn(
                                  "w-full text-left text-xs px-1.5 py-0.5 rounded transition-opacity hover:opacity-80 leading-snug truncate block",
                                  status.bg, status.color
                                )}
                                onClick={() => onOpenTask(task)}
                              >
                                {task.title}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-xs">
                              <div className="font-medium">{task.title}</div>
                              <div className="text-muted-foreground">{status.label}</div>
                            </TooltipContent>
                          </Tooltip>

                          {/* Ícones de nota/anexo — aparecem só ao passar o mouse na tarefa,
                              como overlay (não ocupam espaço extra na linha, então não somem
                              em dias com célula estreita) */}
                          <div
                            className={cn(
                              "absolute right-0 top-0 bottom-0 flex items-center gap-1 pl-2 pr-1 rounded-r",
                              "opacity-0 group-hover/task:opacity-100 transition-opacity pointer-events-none group-hover/task:pointer-events-auto",
                              status.bg
                            )}
                          >
                            {hasNote && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="shrink-0 text-amber-600 flex items-center">
                                    <StickyNote className="size-3" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-xs">Tem nota vinculada</TooltipContent>
                              </Tooltip>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); setFilesTask(task) }}
                              className="shrink-0 hover:scale-110 transition-transform"
                              title="Anexar arquivo"
                            >
                              <Paperclip className="size-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {dayTasks.length > 2 && (
                      <div className="text-xs text-muted-foreground px-1 py-0.5">
                        +{dayTasks.length - 2} mais
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <ProjectFilesDialog
        project={projects.find(p => p.id === filesTask?.projectId) ?? null}
        taskId={filesTask?.id}
        taskTitle={filesTask?.title}
        onClose={() => setFilesTask(null)}
      />
    </>
  )
}
