import { useAuth } from "@/context/AuthContext"
import { PersonalScaleReport } from "@/components/PersonalScaleReport"
import { useApp } from "@/context/AppContext"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/types/task"
import type { Status, Priority, Task } from "@/types/task"
import { CheckCircle2, Clock, AlertTriangle, ListTodo, TrendingUp, Flame, Upload, Zap, Users } from "lucide-react"
import { MemberAvatar } from "@/components/MemberAvatar"
import { ProjectIcon } from "@/components/ProjectIcon"
import { parseISO, format, addDays, addWeeks, addMonths, startOfDay, startOfWeek, startOfMonth } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { toast } from "sonner"
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from "recharts"

const STATUS_COLORS: Record<Status, string> = {
  todo: "#3b82f6",
  "in-progress": "#f59e0b",
  review: "#a855f7",
  done: "#22c55e",
}

const PRIORITY_COLORS: Record<Priority, string> = {
  none: "#94a3b8",
  low: "#60a5fa",
  medium: "#fbbf24",
  high: "#f97316",
  urgent: "#ef4444",
}

export function DashboardPage() {
  const { tasks: allTasks, projects, addTask, addComment, addChecklistItem, addProject, members } = useApp()

  const { session } = useAuth()
  const [view, setView] = useState<"month" | "week" | "day">("month")
  const [anchor, setAnchor] = useState(() => new Date())
  const step = view === "month" ? addMonths : view === "week" ? addWeeks : addDays
  const start = view === "month" ? startOfMonth(anchor) : view === "week" ? startOfWeek(anchor, {weekStartsOn:0}) : startOfDay(anchor)
  const end = step(start, 1)
  const dayKey = (day: Date) => format(day,"yyyy-MM-dd")
  const from = dayKey(start), until = dayKey(end), today = dayKey(new Date())
  const tasks = allTasks.filter(t => t.dueDate && t.dueDate >= from && t.dueDate < until)
  const myProjects = projects.filter(p => session && p.memberIds?.includes(session.user.id))
  const responsible = members.filter(m => myProjects.some(p => p.createdBy === m.id))
  const isOverdue = (t: Task) => !!t.dueDate && t.status !== "done" && t.dueDate < today

  // Detect localStorage data — tarefas E projetos
  const [localTasks, setLocalTasks] = useState<Task[]>(() => {
    try { return JSON.parse(localStorage.getItem('lincoln-general-system') || '[]') } catch { return [] }
  })
  const [localProjects] = useState<Array<{id:string;name:string;color:string;emoji:string}>>(() => {
    try { return JSON.parse(localStorage.getItem('lincoln-projects') || '[]') } catch { return [] }
  })

  const [isMigrating, setIsMigrating] = useState(false)

  async function handleMigrateLocal() {
    if (localTasks.length === 0) return
    setIsMigrating(true)
    try {
      // 1. Mapear projetos antigos (IDs tipo "p1") para novos UUIDs do Supabase
      const projectIdMap: Record<string, string> = {}

      for (const lp of localProjects) {
        // Verificar se já existe projeto com esse nome no Supabase
        const existing = projects.find(p => p.name === lp.name)
        if (existing) {
          projectIdMap[lp.id] = existing.id
        } else {
          // Criar no Supabase e mapear
          const newP = await addProject({ name: lp.name, color: lp.color, emoji: lp.emoji })
          if (newP) projectIdMap[lp.id] = newP.id
        }
      }

      // Mapear também os projetos default pelo nome
      for (const p of projects) {
        // Se o localStorage usava IDs como "p1"..."p5", tenta mapear pelo índice/nome
        const matchLocal = localProjects.find(lp => lp.name === p.name)
        if (matchLocal && !projectIdMap[matchLocal.id]) {
          projectIdMap[matchLocal.id] = p.id
        }
      }

      // 2. Importar tarefas com projectId mapeado
      let imported = 0
      const errors: string[] = []

      for (let i = 0; i < localTasks.length; i++) {
        const lt = localTasks[i]
        toast.info(`Importando tarefa ${i + 1} de ${localTasks.length}...`)

        const resolvedProjectId = projectIdMap[lt.projectId] || projects[0]?.id || ''

        try {
          const newTask = await addTask({
            title: lt.title,
            description: lt.description || '',
            status: lt.status,
            priority: lt.priority,
            projectId: resolvedProjectId,
            dueDate: lt.dueDate,
            tags: lt.tags || [],
            recurring: lt.recurring ?? null,
            position: i,
            assignee: null,
          })

          if (!newTask) throw new Error(`Falha ao criar "${lt.title}"`)

          imported++
          if (lt.checklist?.length) {
            for (const item of lt.checklist) await addChecklistItem(newTask.id, item.text)
          }
          if (lt.comments?.length) {
            for (const c of lt.comments) await addComment(newTask.id, c.text)
          }
        } catch (e) {
          errors.push(lt.title)
          console.error('Erro ao importar tarefa:', lt.title, e)
        }
      }

      // Só limpa localStorage se TODAS importaram com sucesso
      if (errors.length === 0) {
        localStorage.removeItem('lincoln-general-system')
        setLocalTasks([])
        toast.success(`✅ ${imported} tarefas importadas com sucesso!`)
      } else {
        toast.error(`⚠️ ${errors.length} tarefa(s) falharam: ${errors.slice(0,3).join(', ')}`)
        if (imported > 0) toast.success(`${imported} tarefas importadas.`)
      }
    } catch (error) {
      console.error('Erro ao importar:', error)
      toast.error(`Erro ao importar: ${error instanceof Error ? error.message : 'Tente novamente'}`)
    } finally {
      setIsMigrating(false)
    }
  }

  const total = tasks.length
  const done = tasks.filter(t => t.status === "done").length
  const inProgress = tasks.filter(t => t.status === "in-progress").length
  const overdue = tasks.filter(isOverdue).length
  const completedInPeriod = allTasks.filter(t => t.status === "done" && t.completedAt && parseISO(t.completedAt) >= start && parseISO(t.completedAt) < end).length
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

  const byStatus = (Object.keys(STATUS_CONFIG) as Status[]).map(s => ({
    name: STATUS_CONFIG[s].label,
    value: tasks.filter(t => t.status === s).length,
    color: STATUS_COLORS[s],
  })).filter(d => d.value > 0)

  const byPriority = (Object.keys(PRIORITY_CONFIG) as Priority[]).map(p => ({
    name: PRIORITY_CONFIG[p].label,
    value: tasks.filter(t => t.priority === p).length,
    color: PRIORITY_COLORS[p],
  })).filter(d => d.value > 0)

  const byProject = projects.map(p => ({
    name: p.name,
    color: p.color,
    iconKey: p.emoji,
    total: tasks.filter(t => t.projectId === p.id).length,
    done: tasks.filter(t => t.projectId === p.id && t.status === "done").length,
  })).filter(d => d.total > 0)

  const urgent = tasks
    .filter(t => (t.priority === "urgent" || t.priority === "high") && t.status !== "done")
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Visão geral das tarefas às quais você tem acesso</p>
      </div>

      <section aria-label="Período do Dashboard" className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold capitalize">{view === "month" ? format(start,"MMMM yyyy",{locale:ptBR}) : view === "day" ? format(start,"dd/MM/yyyy") : format(start,"dd/MM/yyyy")+" a "+format(addDays(end,-1),"dd/MM/yyyy")}</h2>
        <Button variant="outline" aria-label="Período anterior" onClick={()=>setAnchor(step(anchor,-1))}>‹</Button>
        <Button variant="outline" onClick={()=>setAnchor(new Date())}>Hoje</Button>
        <Button variant="outline" aria-label="Próximo período" onClick={()=>setAnchor(step(anchor,1))}>›</Button>
        <label>Visualização <select aria-label="Visualização" className="rounded border bg-background p-2" value={view} onChange={e=>setView(e.target.value as typeof view)}><option value="month">Mês</option><option value="week">Semana</option><option value="day">Dia</option></select></label>
      </section>
      <p className="text-sm text-muted-foreground">Os indicadores de tarefas usam o prazo. O cartão de conclusões usa a data em que a tarefa foi concluída.</p>
      <PersonalScaleReport key={session?.user.id + from + until} start={start.toISOString()} end={end.toISOString()} />
      {/* Migration Banner */}
      {localTasks.length > 0 && (
        <div className="flex items-center justify-between p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
          <div>
            <p className="font-medium text-sm">📦 {localTasks.length} tarefas salvas localmente</p>
            <p className="text-xs text-muted-foreground">Encontramos dados antigos no seu browser. Deseja importar para o banco de dados?</p>
          </div>
          <Button
            onClick={handleMigrateLocal}
            disabled={isMigrating}
            size="sm"
            className="gap-2 ml-4 shrink-0"
          >
            <Upload className="size-4" />
            {isMigrating ? "Importando..." : "Importar agora"}
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={<ListTodo className="size-5" />} label="Total de tarefas" value={total} sub="com prazo no período" color="text-foreground" />
        <StatCard icon={<CheckCircle2 className="size-5 text-green-500" />} label="Concluídas" value={done} sub={`${completionRate}% de conclusão`} color="text-green-500" />
        <StatCard icon={<Clock className="size-5 text-yellow-500" />} label="Em andamento" value={inProgress} sub="com prazo no período" color="text-yellow-500" />
        <StatCard icon={<AlertTriangle className="size-5 text-red-500" />} label="Atrasadas" value={overdue} sub="requerem atenção" color="text-red-500" />
        <StatCard icon={<Zap className="size-5 text-primary" />} label="Finalizadas no período" value={completedInPeriod} sub="pela data de conclusão" color="text-primary" />
      </div>

      {/* Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="size-4" /> Progresso geral
          </CardTitle>
          <CardDescription>{completionRate}% das tarefas concluídas</CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={completionRate} className="h-2.5" />
          <div className="flex gap-4 mt-3 flex-wrap">
            {(Object.keys(STATUS_CONFIG) as Status[]).map(s => (
              <div key={s} className="flex items-center gap-1.5 text-xs">
                <div className="size-2.5 rounded-full" style={{ background: STATUS_COLORS[s] }} />
                <span className="text-muted-foreground">{STATUS_CONFIG[s].label}:</span>
                <span className="font-medium">{tasks.filter(t => t.status === s).length}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tarefas por status</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {byStatus.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tarefas por prioridade</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byPriority} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {byPriority.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Por responsável */}
      {responsible.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4" /> Por responsável
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {responsible.map(m => {
                const owned = myProjects.filter(p => p.createdBy === m.id)
                const mt = tasks.filter(t => owned.some(p => p.id === t.projectId))
                const mDone = mt.filter(t => t.status === "done").length
                const mInProgress = mt.filter(t => t.status === "in-progress").length
                const mOverdue = mt.filter(isOverdue).length
                const mPct = mt.length > 0 ? Math.round((mDone / mt.length) * 100) : 0
                return (
                  <div key={m.id} className="flex flex-col gap-2 p-3 rounded-xl border bg-muted/20">
                    <div className="flex items-center gap-2">
                      <MemberAvatar member={m} size="md" />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{m.name}</p>
                        <p className="text-xs">{owned.map(p=>p.name).join(", ")}</p>
                        <p className="text-xs text-muted-foreground">{mt.length} tarefa{mt.length !== 1 ? "s" : ""}</p>
                      </div>
                      <span className="ml-auto text-sm font-bold" style={{ color: m.color }}>{mPct}%</span>
                    </div>
                    <Progress value={mPct} className="h-1.5" style={{ "--progress-color": m.color } as React.CSSProperties} />
                    <div className="flex gap-3 text-xs">
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="size-3" />{mDone} ok
                      </span>
                      <span className="flex items-center gap-1 text-yellow-600">
                        <Clock className="size-3" />{mInProgress} andamento
                      </span>
                      {mOverdue > 0 && (
                        <span className="flex items-center gap-1 text-red-500">
                          <AlertTriangle className="size-3" />{mOverdue} atrasada{mOverdue > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Projects progress + urgent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progresso por projeto</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {byProject.length === 0 && <p className="text-sm text-muted-foreground">Sem tarefas</p>}
            {byProject.map(p => {
              const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
              return (
                <div key={p.name} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm items-center">
                    <span className="flex items-center gap-1.5">
                      <ProjectIcon iconKey={p.iconKey} className="size-3.5" style={{ color: p.color }} />
                      {p.name}
                    </span>
                    <span className="text-muted-foreground text-xs">{p.done}/{p.total} ({pct}%)</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="size-4 text-red-500" /> Alta prioridade
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {urgent.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa urgente</p>}
            {urgent.map(task => {
              const status = STATUS_CONFIG[task.status]
              const priority = PRIORITY_CONFIG[task.priority]
              const overdue = isOverdue(task)
              return (
                <div key={task.id} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    {task.dueDate && (
                      <p className={cn("text-xs", overdue ? "text-red-500" : "text-muted-foreground")}>
                        {overdue ? "Atrasada · " : ""}
                        {format(parseISO(task.dueDate), "dd MMM", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className={cn("text-xs", status.color)}>{status.label}</Badge>
                    <Badge variant="outline" className={cn("text-xs", priority.color)}>{priority.label}</Badge>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: number; sub: string; color: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className={color}>{icon}</span>
        </div>
        <div className={cn("text-3xl font-bold", color)}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  )
}
