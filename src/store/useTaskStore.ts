import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import type { Task, Status, ActivityEntry } from "@/types/task"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/async"
import { mapTask, mapComment, mapActivity, mapChecklist, mapTaskLink } from "./tasks/mappers"
import { useTaskData } from "./tasks/useTaskData"
import { useProjectActions } from "./tasks/useProjectActions"
import { upsertById } from "./tasks/state"

export function useTaskStore(actor: {id?: string; isAdmin?: boolean} = {}) {
  const { tasks, setTasks, projects, setProjects, creatableMinistries, loading, loadError, reload } = useTaskData()
  const [pendingWrites, setPendingWrites] = useState(0)
  const saving = pendingWrites > 0
  const moveLocks = useRef(new Set<string>())
  const deleteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set())
  useEffect(() => {
    const timers = deleteTimers.current
    return () => { timers.forEach(clearTimeout); timers.clear() }
  }, [])
  function setSaving(value: boolean) {
    setPendingWrites(count => Math.max(0, count + (value ? 1 : -1)))
    if (!value) void reload()
  }

  function canCreateTask(projectId: string) { return !!projects.find(p => p.id === projectId)?.canCreateTasks }
  function canEditTask(task: Task) {
    const project = projects.find(p => p.id === task.projectId)
    return !!project && (!!actor.isAdmin || (!project.suspended && (!!project.canManage || !!actor.id && task.assigneeId === actor.id)))
  }
  function canCommentTask(task: Task) {
    const project = projects.find(p => p.id === task.projectId)
    return canEditTask(task) || !!project && !project.suspended && !!actor.id && !!task.teamIds?.includes(actor.id)
  }
  function allowEdit(id: string) {
    const task = tasks.find(t => t.id === id)
    if (task && canEditTask(task)) return true
    toast.error('Você não tem permissão para alterar esta tarefa.')
    return false
  }

  // ── Reorder ────────────────────────────────────────────────────────────────

  async function reorderTasks(orderedIds: string[]) {
    const ids = Array.from(new Set(orderedIds)).filter(id => tasks.some(t => t.id === id && canEditTask(t)))
    try {
      setSaving(true)
    setTasks(prev => {
      const byId = Object.fromEntries(prev.map(t => [t.id, t]))
      const reordered = ids.filter(id => byId[id]).map((id, i) => ({ ...byId[id], position: i }))
      const rest = prev.filter(t => !ids.includes(t.id))
      return [...reordered, ...rest]
    })
    // Batch update positions in Supabase
    await Promise.all(
      ids.map((id, i) => supabase.from("lt_tasks").update({ position: i }).eq("id", id).select('id').single().throwOnError())
    )
    } catch { toast.error('Erro ao ordenar tarefas'); void reload() }
    finally { setSaving(false) }
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async function addTask(taskData: Omit<Task, "id" | "createdAt" | "comments" | "checklist" | "activity" | "links">) {
    if (!canCreateTask(taskData.projectId)) { toast.error("O líder precisa permitir a criação de tarefas neste ministério."); return }
    try {
      setSaving(true)
      const { data, error } = await withTimeout(supabase.from("lt_tasks").insert({
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        priority: taskData.priority,
        project_id: taskData.projectId || null,
        due_date: taskData.dueDate || null,
        tags: taskData.tags,
        recurring: taskData.recurring || null,
        position: taskData.position ?? 0,
        assignee: taskData.assignee || null,
        assignee_id: taskData.assigneeId,
        team_ids: taskData.teamIds ?? [],
      }).select().single())

      if (error || !data) {
        toast.error("Erro ao criar tarefa")
        return
      }

      // Creation history is atomic, including when assigning someone else.
      const { data: actRow } = await supabase.from("lt_task_activity").select().eq("task_id", data.id).order("created_at").limit(1).maybeSingle()
      const newTask = mapTask(data, [], [], actRow ? [mapActivity(actRow)] : [], [])
      setTasks(prev => upsertById(prev, newTask))
      return newTask
    } catch {
      toast.error("Demorou demais pra criar a tarefa — tenta de novo")
      return undefined
    } finally {
      setSaving(false)
    }
  }

  async function updateTask(id: string, patch: Partial<Task>, activityText?: string): Promise<boolean> {
    if (!allowEdit(id)) return false
    try {
      setSaving(true)
      const dbPatch: Record<string, unknown> = {}
      if (patch.title !== undefined) dbPatch.title = patch.title
      if (patch.description !== undefined) dbPatch.description = patch.description
      if (patch.status !== undefined) dbPatch.status = patch.status
      if (patch.priority !== undefined) dbPatch.priority = patch.priority
      if (patch.projectId !== undefined) dbPatch.project_id = patch.projectId || null
      if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate || null
      if (patch.tags !== undefined) dbPatch.tags = patch.tags
      if (patch.recurring !== undefined) dbPatch.recurring = patch.recurring || null
      if (patch.assignee !== undefined) dbPatch.assignee = patch.assignee || null
      if (patch.assigneeId !== undefined) dbPatch.assignee_id = patch.assigneeId
      if (patch.teamIds !== undefined) dbPatch.team_ids = patch.teamIds

      if (Object.keys(dbPatch).length > 0) {
        const { error } = await withTimeout(supabase.from("lt_tasks").update(dbPatch).eq("id", id).select("id").single())
        if (error) {
          toast.error("Erro ao atualizar tarefa")
          return false
        }
      }

      let newActivityEntry: ActivityEntry | undefined
      if (activityText && patch.assigneeId === undefined && patch.assignee === undefined && patch.teamIds === undefined) {
        const { data, error } = await supabase.from("lt_task_activity").insert({ task_id: id, text: activityText }).select().single()
        if (error) {
          toast.error("Erro ao registrar atividade")
          void reload()
        }
        if (data) newActivityEntry = mapActivity(data)
      }

      setTasks(prev => prev.map(t => {
        if (t.id !== id) return t
        const updated = { ...t, ...patch }
        if (newActivityEntry) updated.activity = [...(t.activity ?? []), newActivityEntry]
        return updated
      }))
      return true
    } catch {
      toast.error("Demorou demais pra atualizar a tarefa — tenta de novo")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function deleteTask(id: string) {
    if (!allowEdit(id)) return
    if (deleteTimers.current.has(id)) return
    setPendingDeletes(prev => new Set(prev).add(id))
    const restore = () => setPendingDeletes(prev => { const next = new Set(prev); next.delete(id); return next })
    const timer = setTimeout(async () => {
      deleteTimers.current.delete(id)
      await deleteTasks([id])
      restore()
    }, 5000)
    deleteTimers.current.set(id, timer)
    toast.success('Tarefa excluída', { duration: 5000, action: { label: 'Desfazer', onClick: () => {
      if (!deleteTimers.current.has(id)) return
      clearTimeout(timer)
      deleteTimers.current.delete(id)
      restore()
    } } })
  }

  async function deleteTasks(ids: string[]): Promise<boolean> {
    if (!ids.every(allowEdit)) return false
    try {
      setSaving(true)
      const { data, error } = await withTimeout(supabase.from("lt_tasks").delete().in("id", ids).select('id'))
      if (error) {
        toast.error("Erro ao excluir tarefas")
        return false
      }
      const removed = new Set((data ?? []).map(row => row.id))
      setTasks(prev => prev.filter(t => !removed.has(t.id)))
      if (removed.size !== new Set(ids).size) { toast.error('Algumas tarefas não puderam ser excluídas'); return false }
      return true
    } catch {
      toast.error("Demorou demais pra excluir — tenta de novo")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function updateTasks(ids: string[], patch: Partial<Task>): Promise<boolean> {
    if (!ids.every(allowEdit)) return false
    try {
      setSaving(true)
      const dbPatch: Record<string, unknown> = {}
      if (patch.status !== undefined) dbPatch.status = patch.status
      if (patch.priority !== undefined) dbPatch.priority = patch.priority
      if (Object.keys(dbPatch).length > 0) {
        const { data, error } = await withTimeout(supabase.from("lt_tasks").update(dbPatch).in("id", ids).select("id"))
        if (!error && (data ?? []).length !== new Set(ids).size) { toast.error("Algumas tarefas não puderam ser alteradas"); void reload(); return false }
        if (error) {
          toast.error("Erro ao atualizar tarefas")
          return false
        }
      }
      setTasks(prev => prev.map(t => ids.includes(t.id) ? { ...t, ...patch } : t))
      return true
    } catch {
      toast.error("Demorou demais pra atualizar — tenta de novo")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function moveTask(id: string, status: Status): Promise<boolean> {
    if (moveLocks.current.has(id)) return false
    moveLocks.current.add(id)
    try {
      // Recurrence, checklist copying and deduplication happen in one DB transaction.
      return await updateTask(id, { status }, 'Status alterado para ' + status)
    } finally {
      moveLocks.current.delete(id)
      void reload()
    }
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async function addComment(taskId: string, text: string): Promise<boolean> {
    try {
      setSaving(true)
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await withTimeout(supabase.from("lt_task_comments")
        .insert({ task_id: taskId, text, author_id: user?.id ?? null }).select().single())
      if (error || !data) {
        toast.error("Erro ao adicionar comentário")
        return false
      }
      const comment = mapComment(data)
      setTasks(prev => prev.map(t => t.id === taskId
        ? { ...t, comments: t.comments.some(c => c.id === comment.id) ? t.comments : [...(t.comments ?? []), comment] }
        : t))
      return true
    } catch {
      toast.error("Demorou demais pra enviar o comentário — tenta de novo")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function deleteComment(taskId: string, commentId: string) {
    try {
      setSaving(true)
      const { error } = await withTimeout(supabase.from("lt_task_comments").delete().eq("id", commentId).select("id").single())
      if (error) {
        toast.error("Erro ao excluir comentário")
        return
      }
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, comments: t.comments.filter(c => c.id !== commentId) } : t))
    } catch {
      toast.error("Demorou demais pra excluir — tenta de novo")
    } finally {
      setSaving(false)
    }
  }

  // ── Checklist ──────────────────────────────────────────────────────────────

  async function addChecklistItem(taskId: string, text: string) {
    if (!allowEdit(taskId)) return
    try {
      setSaving(true)
      const currentLength = tasks.find(t => t.id === taskId)?.checklist.length ?? 0
      const { data, error } = await withTimeout(supabase.from("lt_task_checklist").insert({ task_id: taskId, text, done: false, position: currentLength }).select().single())
      if (error || !data) {
        toast.error("Erro ao adicionar item")
        return
      }
      const item = mapChecklist(data)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, checklist: [...(t.checklist ?? []), item] } : t))
    } catch {
      toast.error("Demorou demais — tenta de novo")
    } finally {
      setSaving(false)
    }
  }

  async function toggleChecklistItem(taskId: string, itemId: string) {
    if (!allowEdit(taskId)) return
    try {
      setSaving(true)
      const task = tasks.find(t => t.id === taskId)
      const item = task?.checklist.find(i => i.id === itemId)
      if (!task || !item) return

      const newDone = !item.done
      const { error } = await withTimeout(supabase.from("lt_task_checklist").update({ done: newDone }).eq("id", itemId).select("id").single())
      if (error) {
        toast.error("Erro ao atualizar item")
        return
      }

      const updatedChecklist = task.checklist.map(i => i.id === itemId ? { ...i, done: newDone } : i)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, checklist: updatedChecklist } : t))

      const allDone = updatedChecklist.length > 0 && updatedChecklist.every(i => i.done)
      if (allDone && task.status !== "done") {
        await moveTask(taskId, "done")
      }
    } catch {
      toast.error("Demorou demais — tenta de novo")
    } finally {
      setSaving(false)
    }
  }

  async function updateChecklistItem(taskId: string, itemId: string, text: string) {
    if (!allowEdit(taskId)) return
    const trimmed = text.trim()
    if (!trimmed) return
    try {
      setSaving(true)
      const { error } = await withTimeout(supabase.from("lt_task_checklist").update({ text: trimmed }).eq("id", itemId).select("id").single())
      if (error) {
        toast.error("Erro ao atualizar item")
        return
      }
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, checklist: t.checklist.map(i => i.id === itemId ? { ...i, text: trimmed } : i) } : t))
    } catch {
      toast.error("Demorou demais — tenta de novo")
    } finally {
      setSaving(false)
    }
  }

  async function deleteChecklistItem(taskId: string, itemId: string) {
    if (!allowEdit(taskId)) return
    try {
      setSaving(true)
      const { error } = await withTimeout(supabase.from("lt_task_checklist").delete().eq("id", itemId).select("id").single())
      if (error) {
        toast.error("Erro ao excluir item")
        return
      }
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, checklist: t.checklist.filter(i => i.id !== itemId) } : t))
    } catch {
      toast.error("Demorou demais pra excluir — tenta de novo")
    } finally {
      setSaving(false)
    }
  }

  async function reorderChecklist(taskId: string, orderedIds: string[]) {
    if (!allowEdit(taskId)) return
    const ids = Array.from(new Set(orderedIds))
    try {
      setSaving(true)
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t
      const byId = Object.fromEntries(t.checklist.map(i => [i.id, i]))
      return { ...t, checklist: ids.filter(id => byId[id]).map(id => byId[id]) }
    }))
    await Promise.all(
      ids.map((id, i) => supabase.from("lt_task_checklist").update({ position: i }).eq("id", id).eq("task_id", taskId).select('id').single().throwOnError())
    )
    } catch { toast.error('Erro ao ordenar checklist'); void reload() }
    finally { setSaving(false) }
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  const { addProject, updateProject, deleteProject } = useProjectActions({setSaving,setProjects,setTasks})

  // ── Task Links ─────────────────────────────────────────────────────────────

  async function addTaskLink(taskId: string, title: string, url: string) {
    if (!allowEdit(taskId)) return
    try {
      setSaving(true)
      const { data, error } = await withTimeout(supabase.from("lt_task_links").insert({ task_id: taskId, title, url }).select().single())
      if (error || !data) {
        toast.error("Erro ao adicionar link")
        return
      }
      const link = mapTaskLink(data)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, links: [...(t.links ?? []), link] } : t))
    } catch {
      toast.error("Demorou demais — tenta de novo")
    } finally {
      setSaving(false)
    }
  }

  async function deleteTaskLink(taskId: string, linkId: string) {
    if (!allowEdit(taskId)) return
    try {
      setSaving(true)
      const { error } = await withTimeout(supabase.from("lt_task_links").delete().eq("id", linkId).select("id").single())
      if (error) {
        toast.error("Erro ao excluir link")
        return
      }
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, links: t.links.filter(l => l.id !== linkId) } : t))
    } catch {
      toast.error("Demorou demais pra excluir — tenta de novo")
    } finally {
      setSaving(false)
    }
  }

  // ── Duplicate Task ─────────────────────────────────────────────────────────

  async function duplicateTask(id: string): Promise<Task | undefined> {
    try {
      setSaving(true)
      const task = tasks.find(t => t.id === id)
      if (!task || !canCreateTask(task.projectId)) {
        toast.error("Sem permissão para duplicar esta tarefa")
        return
      }

      const { data, error } = await withTimeout(supabase.from("lt_tasks").insert({
        title: `Cópia de ${task.title}`,
        description: task.description,
        status: task.status,
        priority: task.priority,
        project_id: task.projectId || null,
        due_date: task.dueDate || null,
        tags: task.tags,
        recurring: task.recurring || null,
        position: 0,
        assignee_id: actor.id,
        team_ids: task.teamIds ?? [],
      }).select().single())

      if (error || !data) {
        toast.error("Erro ao duplicar tarefa")
        return
      }

      // Insert activity entry
      const { data: actRow } = await supabase.from("lt_task_activity").insert({
        task_id: data.id,
        text: `Tarefa duplicada de "${task.title}"`
      }).select().single()

      // Duplicate checklist items
      const resetChecklist = task.checklist.map(item => ({
        task_id: data.id,
        text: item.text,
        done: false,
        position: task.checklist.indexOf(item),
      }))

      let checklist: Task['checklist'] = []
      if (resetChecklist.length > 0) {
        const { data: rows, error: checklistError } = await withTimeout(supabase.from("lt_task_checklist").insert(resetChecklist).select())
        if (checklistError) {
          await supabase.from("lt_tasks").delete().eq("id", data.id)
          throw checklistError
        }
        checklist = (rows ?? []).map(mapChecklist)
      }

      const newTask = mapTask(data, [], checklist, actRow ? [mapActivity(actRow)] : [], [])
      setTasks(prev => upsertById(prev, newTask))
      return newTask
    } catch {
      toast.error("Demorou demais pra duplicar — tenta de novo")
      return undefined
    } finally {
      setSaving(false)
    }
  }

  return {
    tasks: tasks.filter(task => !pendingDeletes.has(task.id)), projects, loading, saving, loadError, reloadTasks: reload,
    creatableMinistries, canEditTask, canCommentTask, canCreateTask,
    reorderTasks,
    addTask, updateTask, deleteTask, deleteTasks, updateTasks, moveTask,
    addComment, deleteComment,
    addChecklistItem, toggleChecklistItem, updateChecklistItem, deleteChecklistItem, reorderChecklist,
    addProject, updateProject, deleteProject,
    addTaskLink, deleteTaskLink,
    duplicateTask,
  }
}
