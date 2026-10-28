import { useState, useRef, useEffect } from "react"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useApp } from "@/context/AppContext"
import type { Task, Status, Priority } from "@/types/task"
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/types/task"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TaskDialog } from "@/components/TaskDialog"
import { ChecklistEditor } from "@/components/ChecklistEditor"
import { ProjectIcon } from "@/components/ProjectIcon"
import {
  Trash2, Search, Flag, ArrowUpDown,
  CheckCircle2, Circle, Plus, RefreshCw, X, Check,
  GripVertical, CalendarDays, Loader2, PanelRightOpen, Copy, Download, Share2,
  MoreHorizontal, ChevronRight, ClipboardCopy, SlidersHorizontal, User,
} from "lucide-react"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"
import { isPast, isToday, parseISO, format, isThisWeek, addDays, isBefore } from "date-fns"
import { MemberAvatar } from "@/components/MemberAvatar"
import { isTaskStale } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { showConfirm } from "@/components/ConfirmDialog"

type SortKey = "title" | "status" | "priority" | "dueDate" | "createdAt"
const PRIORITY_ORDER: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 }
const STATUS_ORDER: Record<Status, number> = { todo: 0, "in-progress": 1, review: 2, done: 3 }

// ─── Sortable row ──────────────────────────────────────────────────────────────
interface RowProps {
  task: Task
  onOpenTask: (t: Task) => void
  selected: boolean
  onToggleSelect: () => void
  checklistOpen: boolean
  onToggleChecklist: () => void
  newChecklistText: string
  onChecklistTextChange: (v: string) => void
}

function SortableRow(props: RowProps) {
  const {canEditTask} = useApp()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id, disabled: !canEditTask(props.task) })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return <TaskRow {...props} dragRef={setNodeRef} dragStyle={style} dragHandleProps={{ ...attributes, ...listeners }} isDragging={isDragging} />
}

function TaskRow({
  task, onOpenTask, selected, onToggleSelect,
  checklistOpen, onToggleChecklist,
  newChecklistText, onChecklistTextChange,
  dragRef, dragStyle, dragHandleProps, isDragging,
}: RowProps & {
  dragRef?: (el: HTMLTableRowElement | null) => void
  dragStyle?: React.CSSProperties
  dragHandleProps?: Record<string, unknown>
  isDragging?: boolean
}) {
  const { canEditTask, projects, deleteTask, moveTask, updateTask, addChecklistItem, toggleChecklistItem, updateChecklistItem, deleteChecklistItem, reorderChecklist, duplicateTask, saving, members } = useApp()
  const [savingDate, setSavingDate] = useState(false)
  const [dueDate, setDueDate] = useState(task.dueDate ?? "")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task.title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  function startEditTitle(e: React.MouseEvent) {
    e.stopPropagation()
    setTitleValue(task.title)
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.focus(), 30)
  }

  async function saveTitle() {
    if (titleValue.trim() && titleValue !== task.title) {
      const ok = await updateTask(task.id, { title: titleValue.trim() })
      if (ok) toast.success("Título atualizado")
    }
    setEditingTitle(false)
  }

  const project = projects.find(p => p.id === task.projectId)
  const status = STATUS_CONFIG[task.status]
  const priority = PRIORITY_CONFIG[task.priority]
  const isDone = task.status === "done"
  const overdue = task.dueDate && !isDone && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate))
  const dueToday = task.dueDate && !isDone && isToday(parseISO(task.dueDate))
  const checklist = task.checklist ?? []

  useEffect(() => {
    setDueDate(task.dueDate ?? "")
  }, [task.dueDate])

  useEffect(() => {
    if (!saving) setSavingDate(false)
  }, [saving])

  async function handleDelete() {
    const ok = await showConfirm({ title: `Excluir "${task.title}"?`, description: "Esta ação não pode ser desfeita.", confirmLabel: "Excluir", variant: "destructive" })
    if (ok) deleteTask(task.id)
  }

  async function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation()
    const duplicated = await duplicateTask(task.id)
    if (duplicated) toast.success("Tarefa duplicada!")
  }

  function handleCopyWhatsApp(e: React.MouseEvent) {
    e.stopPropagation()
    const prazo = task.dueDate ? format(parseISO(task.dueDate), "dd/MM/yyyy") : "—"
    const responsavel = task.assignee ?? "—"
    const text = `*Tarefa:* ${task.title}\n*Responsável:* ${responsavel}\n*Prazo:* ${prazo}`
    navigator.clipboard.writeText(text)
    toast.success("Copiado para a área de transferência!")
  }

  async function handleToggleDone(e: React.MouseEvent) {
    e.stopPropagation()
    const ok = await moveTask(task.id, isDone ? "todo" : "done")
    if (ok) toast.success(isDone ? "Tarefa reaberta" : "Tarefa concluída!")
  }

  function handleDueDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation()
    setDueDate(e.target.value)
  }

  async function handleDueDateBlur() {
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return
    const newDate = dueDate || null
    if (newDate === task.dueDate) return
    setSavingDate(true)
    await updateTask(task.id, { dueDate: newDate })
  }

  function addChecklistItemLocal() {
    const text = newChecklistText.trim()
    if (!text) return
    addChecklistItem(task.id, text)
    onChecklistTextChange("")
  }

  if (!canEditTask(task)) return <tr ref={dragRef}><td colSpan={9} className="border-b p-3"><button className="flex w-full items-center gap-4 text-left" onClick={() => onOpenTask(task)}><span className="flex-1">{task.title}</span><span>{status.label}</span><span>{priority.label}</span><span>{task.assignee ?? 'Sem responsável'}</span><span className="text-xs">Abrir detalhes</span></button></td></tr>
  return (
    <>
      <tr
        ref={dragRef}
        style={dragStyle}
        className={cn(
          "group hover:bg-muted/20 transition-colors",
          overdue && "bg-red-500/5",
          selected && "bg-primary/5",
          isDragging && "opacity-50 bg-muted/30",
          "border-b last:border-0"
        )}
      >
        {/* Drag handle */}
        <td className="px-2 py-2 w-7" onClick={e => e.stopPropagation()}>
          <button {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none">
            <GripVertical className="size-3.5" />
          </button>
        </td>
        {/* Checkbox */}
        <td className="px-2 py-2 w-8" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} className="rounded" />
        </td>
        {/* Title — inline edit ao clicar, ícone abre o sheet */}
        <td className="px-2 py-2 min-w-0">
          <div className="flex items-start gap-2 min-w-0">
            <button onClick={e => { e.stopPropagation(); handleToggleDone(e) }} className="mt-0.5 text-muted-foreground hover:text-primary shrink-0">
              {isDone ? <CheckCircle2 className="size-4 text-green-500" /> : <Circle className="size-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-1.5 group/title">
                {editingTitle ? (
                  <input
                    ref={titleInputRef}
                    className="font-medium text-sm bg-transparent outline-none border-b border-primary w-full"
                    value={titleValue}
                    onChange={e => setTitleValue(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={e => {
                      if (e.key === "Enter") saveTitle()
                      if (e.key === "Escape") { setTitleValue(task.title); setEditingTitle(false) }
                    }}
                  />
                ) : (
                  <span
                    className={cn("font-medium text-sm leading-snug cursor-text flex-1 line-clamp-2", isDone && "line-through text-muted-foreground")}
                    onClick={startEditTitle}
                    title={task.title}
                  >
                    {task.title}
                  </span>
                )}
                {task.recurring && <RefreshCw className="size-3 text-muted-foreground shrink-0 mt-0.5" aria-label="Recorrente" />}
                {/* Ícone para abrir o painel de detalhes */}
                <button
                  onClick={e => { e.stopPropagation(); onOpenTask(task) }}
                  className="shrink-0 mt-0.5 text-muted-foreground/30 hover:text-primary opacity-0 group-hover/title:opacity-100 transition-all"
                  title="Abrir detalhes"
                >
                  <PanelRightOpen className="size-3.5" />
                </button>
              </div>
              {/* Checklist — colapsável via badge */}
              {checklist.length > 0 && (
                <div className="mt-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={e => { e.stopPropagation(); onToggleChecklist() }}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  >
                    <ChevronRight className={cn("size-3 transition-transform", checklistOpen && "rotate-90")} />
                    {checklist.filter(i => i.done).length}/{checklist.length} subtarefas
                  </button>
                  {checklistOpen && (
                    <div className="flex flex-col gap-0.5 mt-1 pl-1">
                      <ChecklistEditor
                        items={checklist}
                        variant="compact"
                        onToggle={itemId => toggleChecklistItem(task.id, itemId)}
                        onDelete={itemId => deleteChecklistItem(task.id, itemId)}
                        onEdit={(itemId, text) => updateChecklistItem(task.id, itemId, text)}
                        onReorder={orderedIds => reorderChecklist(task.id, orderedIds)}
                      />
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Plus className="size-3 text-muted-foreground/40 shrink-0" />
                        <input
                          className="text-xs italic text-gray-400 bg-transparent outline-none placeholder:text-muted-foreground/40 w-full"
                          placeholder="Adicionar subitem…"
                          value={newChecklistText}
                          onChange={e => onChecklistTextChange(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && newChecklistText.trim()) addChecklistItemLocal()
                            if (e.key === "Escape") onChecklistTextChange("")
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>
        {/* Status — inline select with stale indicator */}
        <td className="px-1.5 py-2 hidden sm:table-cell w-28" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            {isTaskStale(task) && (
              <div className="size-2 rounded-full bg-amber-500 shrink-0" title="Sem movimentação há 5+ dias" />
            )}
            <Select value={task.status} onValueChange={async v => {
              const ok = await moveTask(task.id, v as Status)
              if (ok) toast.success(`Status: ${STATUS_CONFIG[v as Status].label}`)
            }}>
              <SelectTrigger className={cn("h-7 text-xs border-0 shadow-none focus:ring-0 px-1.5 flex-1", status.color, status.bg)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </td>
        {/* Priority — icon only */}
        <td className="px-1 py-2 hidden sm:table-cell w-8" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted transition-colors"
                title={task.priority !== "none" ? priority.label : "Sem prioridade"}
              >
                <Flag className={cn("size-3.5", task.priority !== "none" ? priority.color : "text-muted-foreground/30")} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[140px]">
              {(Object.entries(PRIORITY_CONFIG) as [Priority, typeof PRIORITY_CONFIG[Priority]][]).map(([k, v]) => (
                <DropdownMenuItem key={k} className={cn("text-xs gap-2", v.color)} onClick={async () => {
                  const ok = await updateTask(task.id, { priority: k as Priority })
                  if (ok) toast.success(`Prioridade: ${v.label}`)
                }}>
                  <Flag className="size-3" />
                  {v.label}
                  {task.priority === k && <Check className="size-3 ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
        {/* Project */}
        <td className="px-1.5 py-2 hidden md:table-cell w-24">
          {project && (
            <span className="flex items-center gap-1 text-xs max-w-[84px]" title={project.name}>
              <ProjectIcon iconKey={project.emoji} className="size-3.5 shrink-0" style={{ color: project.color }} />
              <span className="truncate">{project.name}</span>
            </span>
          )}
        </td>
        {/* Due date — inline input */}
        <td className="px-1.5 py-2 hidden lg:table-cell w-24" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            {savingDate ? (
              <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <CalendarDays className={cn("size-3 shrink-0", overdue ? "text-red-500" : dueToday ? "text-yellow-600" : "text-muted-foreground")} />
            )}
            <input
              type="date"
              value={dueDate}
              onChange={handleDueDateChange}
              onBlur={handleDueDateBlur}
              className={cn(
                "text-xs bg-transparent outline-none w-16 cursor-pointer",
                overdue ? "text-red-500 font-medium" : dueToday ? "text-yellow-600 font-medium" : "text-muted-foreground"
              )}
              title="Data de entrega"
            />
          </div>
        </td>
        {/* Assignee — inline dropdown, ícone apenas */}
        <td className="px-1 py-2 hidden sm:table-cell w-9" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted transition-colors mx-auto"
                title={task.assignee ?? "Sem responsável"}
              >
                {task.assignee ? (
                  (() => { const m = members.find(m => m.name === task.assignee); return m ? <MemberAvatar member={m} size="xs" /> : <User className="size-3.5 text-muted-foreground/50" /> })()
                ) : (
                  <User className="size-3.5 text-muted-foreground/30" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[160px]">
              {members.filter(m => project?.eligibleMemberIds?.includes(m.id)).map(m => (
                <DropdownMenuItem
                  key={m.id}
                  className="text-xs gap-2"
                  onClick={() => updateTask(task.id, { assigneeId: task.assigneeId === m.id ? null : m.id, assignee: task.assigneeId === m.id ? null : m.name })}
                >
                  <MemberAvatar member={m} size="xs" />
                  {m.name}
                  {task.assignee === m.name && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
              ))}
              {task.assignee && (
                <DropdownMenuItem className="text-xs text-muted-foreground" onClick={() => updateTask(task.id, { assignee: null })}>
                  Remover responsável
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>

        {/* Actions — menu recolhido em "..." */}
        <td className="px-2 py-2 w-10" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem className="text-xs gap-2" onClick={() => { onOpenTask(task) }}>
                <PanelRightOpen className="size-3.5" /> Abrir detalhes
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs gap-2" onClick={handleCopyWhatsApp}>
                <Share2 className="size-3.5" /> Copiar para WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs gap-2" onClick={handleDuplicate}>
                <Copy className="size-3.5" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs gap-2 text-destructive focus:text-destructive" onClick={handleDelete}>
                <Trash2 className="size-3.5" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
    </>
  )
}

// ─── Inline add row ──────────────────────────────────────────────────────────
function InlineAddRow({ activeProjectId, defaultProjectId }: { activeProjectId: string | null; defaultProjectId: string }) {
  const { addTask, tasks, projects: allProjects, members } = useApp()
  const projects = allProjects.filter(p => p.canCreateTasks)
  const [active, setActive] = useState(false)
  const [title, setTitle] = useState("")
  const [status, setStatus] = useState<Status>("todo")
  const [priority, setPriority] = useState<Priority>("none")
  const [projectId, setProjectId] = useState<string>(activeProjectId ?? defaultProjectId)
  const [dueDate, setDueDate] = useState<string>("")
  const [assignee, setAssignee] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function activate() {
    setProjectId(activeProjectId ?? defaultProjectId)
    setActive(true)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  function reset() {
    setTitle(""); setStatus("todo"); setPriority("none")
    setProjectId(activeProjectId ?? defaultProjectId)
    setDueDate(""); setAssignee(null)
  }

  async function save() {
    if (!title.trim()) { setActive(false); reset(); return }
    const created = await addTask({
      title: title.trim(), description: "", status, priority,
      projectId: activeProjectId ?? projectId,
      dueDate: dueDate || null, tags: [], recurring: null,
      position: tasks.length, assignee,
    })
    if (!created) return
    toast.success("Tarefa criada")
    setTitle("")
    inputRef.current?.focus()
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text")
    const lines = text
      .split(/\n/)
      .map(l => l.replace(/^[\-\*\•\·\◦\▪\▸\>\d+[\.\)]\s*]+/, "").trim())
      .filter(Boolean)

    if (lines.length <= 1) return

    e.preventDefault()
    ;(async () => {
      let createdCount = 0
      for (let i = 0; i < lines.length; i++) {
        const created = await addTask({
          title: lines[i], description: "", status, priority,
          projectId: activeProjectId ?? projectId,
          dueDate: dueDate || null, tags: [], recurring: null,
          position: tasks.length + i, assignee,
        })
        if (created) createdCount++
      }
      if (createdCount > 0) toast.success(`${createdCount} tarefa${createdCount > 1 ? "s" : ""} criada${createdCount > 1 ? "s" : ""}!`)
      reset(); setActive(false)
    })()
  }

  if (!projects.length || activeProjectId && !projects.some(p => p.id === activeProjectId)) return null
  if (!active) {
    return (
      <tr>
        <td colSpan={10} className="px-4 py-2">
          <button onClick={activate} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1">
            <Plus className="size-3.5" /> Adicionar tarefa <span className="text-muted-foreground/50 text-[10px]">(cole texto com múltiplas linhas para criar várias)</span>
          </button>
        </td>
      </tr>
    )
  }

  const statusCfg = STATUS_CONFIG[status]
  const priorityCfg = PRIORITY_CONFIG[priority]

  return (
    <tr className="border-t bg-muted/20">
      {/* drag placeholder */}
      <td className="w-7" />
      {/* checkbox placeholder */}
      <td className="w-8 px-2"><Circle className="size-4 text-muted-foreground" /></td>
      {/* Title */}
      <td className="px-2 py-2">
        <input
          ref={inputRef}
          className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
          placeholder="Nome da tarefa… Enter ↵ para salvar"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={e => {
            if (e.key === "Enter") save()
            if (e.key === "Escape") { reset(); setActive(false) }
          }}
          autoFocus
        />
      </td>
      {/* Status */}
      <td className="px-1.5 py-2 hidden sm:table-cell w-28" onClick={e => e.stopPropagation()}>
        <Select value={status} onValueChange={v => setStatus(v as Status)}>
          <SelectTrigger className={cn("h-7 text-xs border-0 shadow-none focus:ring-0 px-1.5", statusCfg.color, statusCfg.bg)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      {/* Priority — icon only */}
      <td className="px-1 py-2 hidden sm:table-cell w-8" onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted transition-colors"
              title={priority !== "none" ? priorityCfg.label : "Sem prioridade"}
            >
              <Flag className={cn("size-3.5", priority !== "none" ? priorityCfg.color : "text-muted-foreground/30")} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[140px]">
            {(Object.entries(PRIORITY_CONFIG) as [Priority, typeof PRIORITY_CONFIG[Priority]][]).map(([k, v]) => (
              <DropdownMenuItem key={k} className={cn("text-xs gap-2", v.color)} onClick={() => setPriority(k as Priority)}>
                <Flag className="size-3" />
                {v.label}
                {priority === k && <Check className="size-3 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
      {/* Project — only shown when not filtered to a project */}
      <td className="px-1.5 py-2 hidden md:table-cell w-24" onClick={e => e.stopPropagation()}>
        {activeProjectId ? (
          (() => {
            const p = projects.find(pr => pr.id === activeProjectId)
            return p ? (
              <span className="flex items-center gap-1 text-xs" title={p.name}>
                <ProjectIcon iconKey={p.emoji} className="size-3.5 shrink-0" style={{ color: p.color }} />
                <span className="truncate">{p.name}</span>
              </span>
            ) : null
          })()
        ) : (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="h-7 text-xs border-0 shadow-none focus:ring-0 px-1.5 w-full text-muted-foreground">
              <SelectValue placeholder="Projeto…" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  <span className="flex items-center gap-1.5">
                    <ProjectIcon iconKey={p.emoji} className="size-3.5" style={{ color: p.color }} />
                    {p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </td>
      {/* Due date */}
      <td className="px-1.5 py-2 hidden lg:table-cell w-24" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <CalendarDays className="size-3 shrink-0 text-muted-foreground" />
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="text-xs bg-transparent outline-none w-16 cursor-pointer text-muted-foreground"
          />
        </div>
      </td>
      {/* Assignee — ícone apenas */}
      <td className="px-1 py-2 hidden sm:table-cell w-9" onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted transition-colors mx-auto"
              title={assignee ?? "Sem responsável"}
            >
              {assignee ? (
                (() => { const m = members.find(m => m.name === assignee); return m ? <MemberAvatar member={m} size="xs" /> : <User className="size-3.5 text-muted-foreground/50" /> })()
              ) : (
                <User className="size-3.5 text-muted-foreground/30" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            {members.filter(m => projects.find(p => p.id === (activeProjectId ?? projectId))?.eligibleMemberIds?.includes(m.id)).map(m => (
              <DropdownMenuItem key={m.id} className="text-xs gap-2" onClick={() => setAssignee(assignee === m.name ? null : m.name)}>
                <MemberAvatar member={m} size="xs" />
                {m.name}
                {assignee === m.name && <span className="ml-auto text-primary">✓</span>}
              </DropdownMenuItem>
            ))}
            {assignee && (
              <DropdownMenuItem className="text-xs text-muted-foreground" onClick={() => setAssignee(null)}>
                Remover
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
      {/* Save/cancel */}
      <td className="px-2 py-2 w-24" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <Button size="sm" className="h-6 text-xs px-2" onClick={save} disabled={!title.trim()}>
            Salvar
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { reset(); setActive(false) }}>
            <X className="size-3" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ─── Bulk action bar ─────────────────────────────────────────────────────────
function BulkBar({ selected, onClear, onDelete, onChangeStatus, onChangePriority }: {
  selected: string[]
  onClear: () => void
  onDelete: () => void
  onChangeStatus: (s: Status) => void
  onChangePriority: (p: Priority) => void
}) {
  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 bg-card border shadow-lg rounded-xl px-4 py-2.5">
      <span className="text-sm font-medium text-muted-foreground mr-1">
        {selected.length} selecionada{selected.length > 1 ? "s" : ""}
      </span>
      <Select onValueChange={onChangeStatus}>
        <SelectTrigger className="h-7 text-xs w-auto border-dashed gap-1"><span>Status</span></SelectTrigger>
        <SelectContent>
          {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([k, v]) => (
            <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select onValueChange={onChangePriority}>
        <SelectTrigger className="h-7 text-xs w-auto border-dashed gap-1"><span>Prioridade</span></SelectTrigger>
        <SelectContent>
          {(Object.entries(PRIORITY_CONFIG) as [Priority, typeof PRIORITY_CONFIG[Priority]][]).map(([k, v]) => (
            <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={onDelete}>
        <Trash2 className="size-3" /> Excluir
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClear}>
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type DueDateFilter = null | "overdue" | "this-week" | "next-30"
interface ListViewProps {
  onOpenTask: (task: Task) => void
  todayFilter?: boolean
  noDueDateFilter?: boolean
  assigneeFilter?: string[]
  dueDateFilter?: DueDateFilter
}

export function ListView({ onOpenTask, todayFilter = false, noDueDateFilter = false, assigneeFilter = [], dueDateFilter = null }: ListViewProps) {
  const { tasks, projects, deleteTasks, updateTasks, activeProjectId, reorderTasks } = useApp()
  const [newOpen, setNewOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterPriority, setFilterPriority] = useState<string>("all")
  const [sortKey, setSortKey] = useState<SortKey>("createdAt")
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [expandedChecklist, setExpandedChecklist] = useState<Record<string, boolean>>({})
  const [newChecklistItems, setNewChecklistItems] = useState<Record<string, string>>({})

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const filterCount = (filterStatus !== "all" ? 1 : 0) + (filterPriority !== "all" ? 1 : 0)

  function clearFieldFilters() {
    setFilterStatus("all")
    setFilterPriority("all")
  }

  const filtered = tasks
    .filter(t => {
      if (todayFilter) {
        if (t.status === "done") return false
        if (!t.dueDate) return false
        const dueDate = parseISO(t.dueDate)
        if (!(isPast(dueDate) || isToday(dueDate))) return false
      }
      if (noDueDateFilter) {
        // Sem prazo: ativas sem dueDate
        if (t.status === "done") return false
        if (t.dueDate) return false
      }
      if (assigneeFilter.length > 0 && !assigneeFilter.includes(t.assignee ?? "")) return false
      if (dueDateFilter) {
        const today = new Date()
        if (!t.dueDate) return false
        const d = parseISO(t.dueDate)
        if (dueDateFilter === "overdue" && !(isPast(d) && !isToday(d) && t.status !== "done")) return false
        if (dueDateFilter === "this-week" && !isThisWeek(d, { weekStartsOn: 1 })) return false
        if (dueDateFilter === "next-30" && (isPast(d) || !isBefore(d, addDays(today, 30)))) return false
      }
      if (activeProjectId && t.projectId !== activeProjectId) return false
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterStatus !== "all" && t.status !== filterStatus) return false
      if (filterPriority !== "all" && t.priority !== filterPriority) return false
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortKey === "title") cmp = a.title.localeCompare(b.title)
      else if (sortKey === "status") cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      else if (sortKey === "priority") cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      else if (sortKey === "dueDate") cmp = (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : 1
      else cmp = (a.position ?? 0) - (b.position ?? 0)
      return sortAsc ? cmp : (sortKey === "createdAt" ? 1 : -cmp)
    })

  const isDefaultSort = sortKey === "createdAt"

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = filtered.findIndex(t => t.id === active.id)
    const newIndex = filtered.findIndex(t => t.id === over.id)
    const reordered = arrayMove(filtered, oldIndex, newIndex)
    reorderTasks(reordered.map(t => t.id))
  }

  function toggleSelect(id: string) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  async function handleBulkDelete() {
    const ok = await showConfirm({ title: `Excluir ${selected.length} tarefas?`, description: "Esta ação não pode ser desfeita.", confirmLabel: "Excluir todas", variant: "destructive" })
    if (ok) {
      const count = selected.length
      const deleted = await deleteTasks(selected)
      setSelected([])
      if (deleted) toast.success(`${count} tarefas excluídas`)
    }
  }

  async function handleBulkStatus(status: Status) {
    const ok = await updateTasks(selected, { status })
    setSelected([])
    if (ok) toast.success("Status atualizado")
  }

  async function handleBulkPriority(priority: Priority) {
    const ok = await updateTasks(selected, { priority })
    setSelected([])
    if (ok) toast.success("Prioridade atualizada")
  }

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    return (
      <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => { if (sortKey === k) setSortAsc(v => !v); else { setSortKey(k); setSortAsc(true) } }}>
        {label} <ArrowUpDown className={cn("size-3", sortKey === k && "text-primary")} />
      </button>
    )
  }

  function exportCSV() {
    const headers = ["Título", "Status", "Prioridade", "Projeto", "Prazo", "Responsável", "Tags"]
    const rows = filtered.map(t => [
      t.title,
      STATUS_CONFIG[t.status].label,
      PRIORITY_CONFIG[t.priority].label,
      projects.find(p => p.id === t.projectId)?.name ?? "",
      t.dueDate ?? "",
      t.assignee ?? "",
      t.tags.join(";"),
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `tasks-system-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success("CSV exportado!")
  }

  function copyWhatsApp() {
    const lines = filtered.map(t => {
      const prazo = t.dueDate ? format(parseISO(t.dueDate), "dd/MM/yyyy") : "—"
      const responsavel = t.assignee ?? "—"
      return `• *${t.title}*\n  └ Responsável: ${responsavel} | Prazo: ${prazo}`
    })
    const text = lines.join("\n")
    navigator.clipboard.writeText(text)
    toast.success(`${filtered.length} tarefa${filtered.length !== 1 ? "s" : ""} copiada${filtered.length !== 1 ? "s" : ""}!`)
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-8 h-8" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex items-center gap-1.5 text-xs h-8 px-2.5 rounded-md border transition-colors font-medium shrink-0",
                filterCount > 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
              )}>
                <SlidersHorizontal className="size-3.5" />
                Filtros
                {filterCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none bg-white/20 text-white">
                    {filterCount}
                  </span>
                )}
                <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <DropdownMenuCheckboxItem
                  key={k}
                  checked={filterStatus === k}
                  onSelect={e => e.preventDefault()}
                  onCheckedChange={() => setFilterStatus(filterStatus === k ? "all" : k)}
                >
                  {v.label}
                </DropdownMenuCheckboxItem>
              ))}

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Prioridade</DropdownMenuLabel>
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                <DropdownMenuCheckboxItem
                  key={k}
                  checked={filterPriority === k}
                  onSelect={e => e.preventDefault()}
                  onCheckedChange={() => setFilterPriority(filterPriority === k ? "all" : k)}
                >
                  {v.label}
                </DropdownMenuCheckboxItem>
              ))}

              {filterCount > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={clearFieldFilters} className="justify-center text-muted-foreground">
                    Limpar filtros
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-center size-8 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Mais ações"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCSV} className="gap-2">
                <Download className="size-3.5" /> Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyWhatsApp} className="gap-2">
                <ClipboardCopy className="size-3.5" /> Copiar pra WhatsApp
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden">
          <div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={isDefaultSort ? handleDragEnd : undefined}>
              <SortableContext items={filtered.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="w-7 px-2" />
                      <th className="w-8 px-2" />
                      <th className="text-left px-2 py-2.5"><SortBtn k="title" label="Tarefa" /></th>
                      <th className="text-left px-1.5 py-2.5 hidden sm:table-cell w-28"><SortBtn k="status" label="Status" /></th>
                      <th className="px-1.5 py-2.5 hidden sm:table-cell w-8" title="Prioridade"><Flag className="size-3 text-muted-foreground/60" /></th>
                      <th className="text-left px-1.5 py-2.5 hidden md:table-cell w-24 text-xs font-medium text-muted-foreground">Projeto</th>
                      <th className="text-left px-1.5 py-2.5 hidden lg:table-cell w-24"><SortBtn k="dueDate" label="Prazo" /></th>
                      <th className="px-1.5 py-2.5 hidden sm:table-cell w-9" title="Responsável"><User className="size-3 text-muted-foreground/60" /></th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">Nenhuma tarefa encontrada</td>
                      </tr>
                    )}
                    {filtered.map(task => (
                      <SortableRow
                        key={task.id}
                        task={task}
                        onOpenTask={onOpenTask}
                        selected={selected.includes(task.id)}
                        onToggleSelect={() => toggleSelect(task.id)}
                        checklistOpen={!!expandedChecklist[task.id]}
                        onToggleChecklist={() => setExpandedChecklist(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                        newChecklistText={newChecklistItems[task.id] ?? ""}
                        onChecklistTextChange={v => setNewChecklistItems(prev => ({ ...prev, [task.id]: v }))}
                      />
                    ))}
                    <InlineAddRow activeProjectId={activeProjectId} defaultProjectId={projects.find(p => p.canCreateTasks)?.id ?? ""} />
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {!isDefaultSort && (
          <p className="text-xs text-muted-foreground">Arraste para reordenar apenas no modo padrão (sem ordenação ativa)</p>
        )}
        <p className="text-xs text-muted-foreground">{filtered.length} tarefa{filtered.length !== 1 ? "s" : ""}</p>
      </div>

      {selected.length > 0 && (
        <BulkBar
          selected={selected}
          onClear={() => setSelected([])}
          onDelete={handleBulkDelete}
          onChangeStatus={handleBulkStatus}
          onChangePriority={handleBulkPriority}
        />
      )}

      <TaskDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  )
}
