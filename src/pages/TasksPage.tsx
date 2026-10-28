import { useState, useEffect } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { KanbanView } from "@/components/views/KanbanView"
import { ListView } from "@/components/views/ListView"
import { WorkloadView } from "@/components/views/WorkloadView"
import { TaskDialog } from "@/components/TaskDialog"
import { ShortcutsDialog } from "@/components/ShortcutsDialog"
import { useApp } from "@/context/AppContext"
import { useAuth } from "@/context/AuthContext"
import type { Task } from "@/types/task"
import { Plus, Kanban, List, BarChart3, ChevronDown, FolderKanban, Users, Clock, CalendarClock, RotateCcw, SlidersHorizontal, Ban } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MemberAvatar } from "@/components/MemberAvatar"
import { ProjectIcon } from "@/components/ProjectIcon"
import { cn } from "@/lib/utils"
import { isToday, isPast, parseISO } from "date-fns"

interface Props {
  onOpenTask: (task: Task) => void
  newTaskOpen?: boolean
  onNewTaskClose?: () => void
}

type DueDateFilter = null | "overdue" | "this-week" | "next-30"

export function TasksPage({ onOpenTask, newTaskOpen = false, onNewTaskClose }: Props) {
  const { projects, activeProjectId, setActiveProjectId, tasks, members } = useApp()
  const { isAdmin } = useAuth()
  const activeProject = projects.find(p => p.id === activeProjectId)
  const readOnly = !!activeProject?.suspended && !isAdmin
  const [localNewOpen, setLocalNewOpen] = useState(false)
  const [todayFilter, setTodayFilter] = useState(false)
  const [noDueDateFilter, setNoDueDateFilter] = useState(false)
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([])
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"kanban" | "list" | "workload">(() => {
    const stored = localStorage.getItem("lincoln-active-tab")
    return stored === "kanban" || stored === "list" || stored === "workload" ? stored : "kanban"
  })

  const noDueDateCount = tasks.filter(t => !t.dueDate && t.status !== "done").length
  const overdueCount = tasks.filter(t =>
    t.status !== "done" && t.dueDate &&
    isPast(parseISO(t.dueDate)) && !isToday(parseISO(t.dueDate))
  ).length

  const hasAnyFilter = todayFilter || noDueDateFilter || !!dueDateFilter || !!activeProjectId || assigneeFilter.length > 0

  // Filters tucked inside the "Filtros" dropdown (everything except the Todas/Hoje/Vencidas quick chips)
  const advancedFilterCount =
    (activeProjectId ? 1 : 0) +
    assigneeFilter.length +
    (dueDateFilter && dueDateFilter !== "overdue" ? 1 : 0) +
    (noDueDateFilter ? 1 : 0)

  const isNewOpen = newTaskOpen || localNewOpen
  function closeNew() { setLocalNewOpen(false); onNewTaskClose?.() }

  function clearAllFilters() {
    setTodayFilter(false)
    setNoDueDateFilter(false)
    setDueDateFilter(null)
    setActiveProjectId(null)
    setAssigneeFilter([])
  }

  function clearAdvancedFilters() {
    if (dueDateFilter !== "overdue") setDueDateFilter(null)
    setNoDueDateFilter(false)
    setActiveProjectId(null)
    setAssigneeFilter([])
  }

  function handleTabChange(tab: string) {
    if (tab === "kanban" || tab === "list" || tab === "workload") {
      setActiveTab(tab)
      localStorage.setItem("lincoln-active-tab", tab)
    }
  }

  useEffect(() => {
    const urgent = tasks.filter(t =>
      t.status !== "done" && t.dueDate &&
      (isPast(parseISO(t.dueDate)) || isToday(parseISO(t.dueDate)))
    ).length
    document.title = urgent > 0 ? `(${urgent}) Tasks System` : "Tasks System"
  }, [tasks])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (e.key === "?") { e.preventDefault(); setShortcutsOpen(true); return }
      if (e.metaKey || e.ctrlKey) return
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setLocalNewOpen(true) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col gap-4 h-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold">Tarefas</h1>
          <Button onClick={() => setLocalNewOpen(true)} size="sm" className="shrink-0 gap-1.5" disabled={readOnly || !(activeProjectId ? activeProject?.canCreateTasks : projects.some(p => p.canCreateTasks))}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nova tarefa</span>
            <span className="sm:hidden">Nova</span>
          </Button>
        </div>

        {readOnly && (
          <div className="flex items-center gap-2 text-xs bg-destructive/10 text-destructive border border-destructive/30 rounded-lg px-3 py-2">
            <Ban className="size-3.5 shrink-0" />
            Este projeto está suspenso — só administradores podem criar, editar ou excluir tarefas aqui.
          </div>
        )}

        {/* Filter toolbar + view switcher, all in one row */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Segmented quick filters: Todas / Hoje / Vencidas */}
          <div className="inline-flex items-center rounded-lg border border-border overflow-hidden h-7 shrink-0">
            <button
              onClick={clearAllFilters}
              className={cn(
                "h-full flex items-center text-xs px-3 font-medium transition-colors",
                !hasAnyFilter
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              Todas
            </button>
            <button
              onClick={() => {
                const next = !todayFilter
                setTodayFilter(next)
                setNoDueDateFilter(false)
                if (next) handleTabChange("list")
              }}
              className={cn(
                "h-full flex items-center gap-1.5 text-xs px-3 font-medium border-l border-border transition-colors",
                todayFilter
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <CalendarClock className="size-3.5" />
              Hoje
            </button>
            {overdueCount > 0 && (
              <button
                onClick={() => setDueDateFilter(dueDateFilter === "overdue" ? null : "overdue")}
                className={cn(
                  "h-full flex items-center gap-1.5 text-xs px-3 font-medium border-l border-border transition-colors",
                  dueDateFilter === "overdue"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                Vencidas
                <span className={cn(
                  "text-[10px] font-bold px-1.5 rounded-full leading-none",
                  dueDateFilter === "overdue" ? "bg-white/20 text-white" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                )}>
                  {overdueCount}
                </span>
              </button>
            )}
          </div>

          {/* Filtros: Projeto, Responsável e Prazo, tudo num só painel */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex items-center gap-1.5 text-xs h-7 px-2.5 rounded-md border transition-colors font-medium",
                advancedFilterCount > 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
              )}>
                <SlidersHorizontal className="size-3.5" />
                Filtros
                {advancedFilterCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none bg-white/20 text-white">
                    {advancedFilterCount}
                  </span>
                )}
                <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="flex items-center gap-1.5">
                <FolderKanban className="size-3" /> Projeto
              </DropdownMenuLabel>
              <div className="max-h-40 overflow-y-auto">
                {projects.map(p => (
                  <DropdownMenuCheckboxItem
                    key={p.id}
                    checked={activeProjectId === p.id}
                    onSelect={e => e.preventDefault()}
                    onCheckedChange={() => setActiveProjectId(activeProjectId === p.id ? null : p.id)}
                    className="gap-2"
                  >
                    <ProjectIcon iconKey={p.emoji} className="size-3.5 shrink-0" style={{ color: p.color }} />
                    {p.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </div>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5">
                <Users className="size-3" /> Responsável
              </DropdownMenuLabel>
              <div className="max-h-40 overflow-y-auto">
                {members.map(m => (
                  <DropdownMenuCheckboxItem
                    key={m.id}
                    checked={assigneeFilter.includes(m.name)}
                    onSelect={e => e.preventDefault()}
                    onCheckedChange={() => setAssigneeFilter(prev =>
                      prev.includes(m.name) ? prev.filter(n => n !== m.name) : [...prev, m.name]
                    )}
                    className="gap-2"
                  >
                    <MemberAvatar member={m} size="xs" />
                    {m.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </div>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5">
                <Clock className="size-3" /> Prazo
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={dueDateFilter === "this-week"}
                onSelect={e => e.preventDefault()}
                onCheckedChange={() => {
                  setDueDateFilter(dueDateFilter === "this-week" ? null : "this-week")
                  setNoDueDateFilter(false)
                }}
              >
                Esta semana
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={dueDateFilter === "next-30"}
                onSelect={e => e.preventDefault()}
                onCheckedChange={() => {
                  setDueDateFilter(dueDateFilter === "next-30" ? null : "next-30")
                  setNoDueDateFilter(false)
                }}
              >
                Próximos 30 dias
              </DropdownMenuCheckboxItem>
              {noDueDateCount > 0 && (
                <DropdownMenuCheckboxItem
                  checked={noDueDateFilter}
                  onSelect={e => e.preventDefault()}
                  onCheckedChange={() => {
                    const next = !noDueDateFilter
                    setNoDueDateFilter(next)
                    if (next) { setDueDateFilter(null); setTodayFilter(false) }
                  }}
                >
                  Sem prazo definido
                  <span className="ml-auto text-[10px] text-muted-foreground">{noDueDateCount}</span>
                </DropdownMenuCheckboxItem>
              )}

              {advancedFilterCount > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={clearAdvancedFilters} className="justify-center text-muted-foreground">
                    Limpar filtros
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View switcher — mesma linha dos filtros */}
          <TabsList className="w-fit">
            <TabsTrigger value="kanban" className="gap-1.5 text-xs sm:text-sm">
              <Kanban className="size-3.5" />
              <span className="hidden sm:inline">Kanban</span>
              <span className="sm:hidden">Board</span>
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5 text-xs sm:text-sm">
              <List className="size-3.5" />
              Lista
            </TabsTrigger>
            <TabsTrigger value="workload" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="size-3.5" />
              <span className="hidden sm:inline">Carga</span>
            </TabsTrigger>
          </TabsList>

          {/* Clear all */}
          {hasAnyFilter && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 text-xs h-7 px-2 text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              <RotateCcw className="size-3" />
              Limpar tudo
            </button>
          )}
        </div>

        <TabsContent value="kanban" className="flex-1 min-h-0">
          <KanbanView onOpenTask={onOpenTask} assigneeFilter={assigneeFilter} dueDateFilter={dueDateFilter} />
        </TabsContent>

        <TabsContent value="list">
          <ListView onOpenTask={onOpenTask} todayFilter={todayFilter} noDueDateFilter={noDueDateFilter} assigneeFilter={assigneeFilter} dueDateFilter={dueDateFilter} />
        </TabsContent>

        <TabsContent value="workload">
          <WorkloadView onOpenTask={onOpenTask} />
        </TabsContent>
      </Tabs>

      <TaskDialog open={isNewOpen} onClose={closeNew} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  )
}
