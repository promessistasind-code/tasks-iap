export type Status = "todo" | "in-progress" | "review" | "done"

export interface Member {
  id: string
  name: string
  color: string
  initials: string
  isAdmin?: boolean
}
export type Priority = "none" | "low" | "medium" | "high" | "urgent"
export type Recurring = "daily" | "weekly" | "biweekly" | "monthly" | null

export interface Comment {
  id: string
  text: string
  authorId: string | null
  createdAt: string
}

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface ActivityEntry {
  id: string
  text: string
  createdAt: string
}

export interface TaskLink {
  id: string
  title: string
  url: string
}

export interface Task {
  completedAt?: string | null
  id: string
  title: string
  description: string
  status: Status
  priority: Priority
  projectId: string
  dueDate: string | null
  tags: string[]
  createdAt: string
  recurring: Recurring
  position: number
  comments: Comment[]
  checklist: ChecklistItem[]
  activity: ActivityEntry[]
  links: TaskLink[]
  assignee: string | null
  assigneeId?: string | null
  teamIds?: string[]
  createdBy?: string | null
}

export interface Project {
  id: string
  name: string
  color: string
  emoji: string
  suspended: boolean
  createdBy: string | null
  memberIds?: string[]
  ministryId?: string | null
  canManage?: boolean
  canCreateTasks?: boolean
  eligibleMemberIds?: string[]
}

export const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  todo:          { label: "A Fazer",       color: "text-blue-500",   bg: "bg-blue-500/10" },
  "in-progress": { label: "Em Andamento",  color: "text-yellow-500", bg: "bg-yellow-500/10" },
  review:        { label: "Revisão",       color: "text-purple-500", bg: "bg-purple-500/10" },
  done:          { label: "Concluído",     color: "text-green-500",  bg: "bg-green-500/10" },
}

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  none:   { label: "Sem prioridade", color: "text-muted-foreground" },
  low:    { label: "Baixa",          color: "text-blue-400" },
  medium: { label: "Média",          color: "text-yellow-400" },
  high:   { label: "Alta",           color: "text-orange-400" },
  urgent: { label: "Crítica",        color: "text-red-500" },
}

export const RECURRING_CONFIG: Record<NonNullable<Recurring>, string> = {
  daily:    "Diário",
  weekly:   "Semanal",
  biweekly: "Quinzenal",
  monthly:  "Mensal",
}

export const PROJECT_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ec4899",
  "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#84cc16",
]


const task = (overrides: Partial<Task> & Pick<Task, "id" | "title" | "status" | "priority" | "projectId">): Task => ({
  description: "", dueDate: null, tags: [], createdAt: "2026-05-28T10:00:00Z",
  recurring: null, position: 0, comments: [], checklist: [], activity: [{ id: "a1", text: "Tarefa criada", createdAt: "2026-05-28T10:00:00Z" }],
  links: [], assignee: null,
  ...overrides,
})

export const DEMO_TASKS: Task[] = [
  task({ id: "t1", title: "Criar briefing campanha cliente X", status: "in-progress", priority: "high", projectId: "p1", dueDate: "2026-06-05", tags: ["briefing"], description: "Preparar documento de briefing completo para apresentação ao cliente.", checklist: [{ id: "c1", text: "Definir objetivos da campanha", done: true }, { id: "c2", text: "Levantar referências visuais", done: false }, { id: "c3", text: "Validar com cliente", done: false }], activity: [{ id: "a1", text: "Tarefa criada", createdAt: "2026-05-28T10:00:00Z" }, { id: "a2", text: "Status alterado para Em Andamento", createdAt: "2026-05-29T09:00:00Z" }], comments: [], recurring: null }),
  task({ id: "t2", title: "Revisão relatório de mídia maio", status: "review", priority: "high", projectId: "p2", dueDate: "2026-06-02", tags: ["relatório"], comments: [{ id: "cm1", text: "Já adicionei os dados do Meta. Falta Google.", authorId: null, createdAt: "2026-05-29T14:00:00Z" }], recurring: null }),
  task({ id: "t3", title: "Onboarding cliente novo", status: "todo", priority: "medium", projectId: "p5", dueDate: "2026-06-10", tags: ["onboarding"], description: "Preparar apresentação de boas-vindas e fluxo de trabalho.", checklist: [{ id: "c1", text: "Preparar deck de apresentação", done: false }, { id: "c2", text: "Enviar acesso às ferramentas", done: false }], recurring: null }),
  task({ id: "t4", title: "Atualizar proposta comercial", status: "todo", priority: "low", projectId: "p3", recurring: null }),
  task({ id: "t5", title: "Setup campanha Google Ads", status: "todo", priority: "urgent", projectId: "p2", dueDate: "2026-06-03", tags: ["ads"], description: "Criar estrutura de campanhas para Q3.", checklist: [{ id: "c1", text: "Definir estrutura de campanhas", done: false }, { id: "c2", text: "Criar públicos-alvo", done: false }], recurring: null }),
  task({ id: "t6", title: "Definir OKRs Q3", status: "done", priority: "high", projectId: "p3", dueDate: "2026-05-31", tags: ["planejamento"], checklist: [{ id: "c1", text: "Reunião de alinhamento", done: true }, { id: "c2", text: "Documentar OKRs", done: true }], recurring: null }),
  task({ id: "t7", title: "Reunião semanal de alinhamento", status: "todo", priority: "medium", projectId: "p4", dueDate: "2026-06-06", recurring: "weekly", description: "Weekly com o time para alinhar entregas e bloqueios." }),
  task({ id: "t8", title: "Relatório mensal de performance", status: "todo", priority: "high", projectId: "p2", dueDate: "2026-06-30", recurring: "monthly", description: "Consolidar dados de todas as campanhas ativas." }),
  task({ id: "t9", title: "Produção de conteúdo Instagram", status: "in-progress", priority: "medium", projectId: "p1", dueDate: "2026-06-15", tags: ["social", "conteúdo"], recurring: null }),
  task({ id: "t10", title: "Revisão contrato fornecedor", status: "todo", priority: "high", projectId: "p4", dueDate: "2026-06-07", tags: ["jurídico"], recurring: null }),
]
